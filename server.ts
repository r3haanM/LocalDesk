import express from 'express';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import dns from 'dns/promises';
import fs from 'fs/promises';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * SSRF protection: verifies whether an IPv4 or IPv6 address belongs to a private,
 * loopback, link-local, metadata, or reserved range.
 */
function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map((n) => parseInt(n, 10));
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // Cloud metadata / link-local
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // Multicast & reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fe80:') ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('::ffff:127.') ||
      normalized.startsWith('::ffff:10.') ||
      normalized.startsWith('::ffff:192.168.') ||
      normalized.startsWith('::ffff:169.254.')
    ) {
      return true;
    }
  }
  return false;
}

async function assertUrlSafeFromSsrf(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL syntax.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only HTTP and HTTPS protocols are permitted for URL imports.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.google.internal'
  ) {
    throw new Error('SSRF Protection: Internal and loopback hostnames are blocked.');
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new Error('SSRF Protection: Direct requests to private or reserved IP ranges are blocked.');
    }
    return parsed;
  }

  const records = await dns.lookup(hostname, { all: true });
  if (!records.length) {
    throw new Error('Could not resolve remote hostname.');
  }
  for (const rec of records) {
    if (isPrivateOrReservedIp(rec.address)) {
      throw new Error('SSRF Protection: Hostname resolves to a restricted internal IP address.');
    }
  }

  return parsed;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.disable('x-powered-by');
  app.use(express.json({ limit: '10mb' }));

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // In-memory isolated session preferences store (optional user account sync; never stores guest files)
  const accountStore = new Map<
    string,
    {
      email: string;
      name: string;
      themePreset: string;
      appearance: string;
      saveHistory: boolean;
      updatedAt: string;
    }
  >();

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      engine: 'Vellum ISO-32000 Document Processing Engine',
      ssrfProtection: true,
      zeroRetentionForGuests: true
    });
  });

  /**
   * Windows Desktop Release Manifest & Artifact Download Endpoints
   */
  app.get('/api/releases/info', async (_req, res) => {
    try {
      const manifestPath = path.join(__dirname, 'release', 'release-manifest.json');
      const raw = await fs.readFile(manifestPath, 'utf-8');
      res.json(JSON.parse(raw));
    } catch {
      res.status(404).json({ error: 'Release manifest not yet generated.' });
    }
  });

  app.get('/api/releases/download/:artifact', async (req, res) => {
    try {
      const requestedName = path.basename(req.params.artifact || '');
      const aliasMap: Record<string, string> = {
        'Local-Desk-Setup-1.0.0-x64.exe': 'Local-Desk-Setup-1.0.1-x64.exe',
        'Local-Desk-Portable-1.0.0-win-x64.zip': 'Local-Desk-Portable-1.0.1-win-x64.zip'
      };
      const safeName = aliasMap[requestedName] || requestedName;
      const allowedFiles = new Set([
        'Local-Desk-Setup-1.0.1-x64.exe',
        'Local-Desk-Portable-1.0.1-win-x64.zip',
        'SHA256SUMS.txt',
        'RELEASE_NOTES.md',
        'WINDOWS_ARCHITECTURE_AND_OFFLINE_AUDIT.md',
        'THIRD_PARTY_LICENSES.md',
        'WINDOWS_TEST_REPORT.md'
      ]);

      if (!allowedFiles.has(safeName)) {
        res.status(404).json({ error: 'Requested release artifact not found.' });
        return;
      }

      const filePath = path.join(__dirname, 'release', safeName);
      const data = await fs.readFile(filePath);
      const ext = path.extname(safeName).toLowerCase();
      const contentType =
        ext === '.exe'
          ? 'application/vnd.microsoft.portable-executable'
          : ext === '.zip'
          ? 'application/zip'
          : 'text/plain; charset=utf-8';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(data.byteLength));
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.send(data);
    } catch {
      res.status(404).json({ error: 'Release artifact file could not be read.' });
    }
  });

  /**
   * Export Complete Application & Desktop Source Code as a clean .zip bundle
   */
  app.get('/api/export-source', async (_req, res) => {
    try {
      const zip = new JSZip();
      const rootFiles = [
        'package.json',
        'tsconfig.json',
        'vite.config.ts',
        'electron-builder.yml',
        'index.html',
        'metadata.json',
        'server.ts',
        '.env.example',
        '.gitignore'
      ];

      for (const f of rootFiles) {
        try {
          const content = await fs.readFile(path.join(__dirname, f));
          zip.file(f, content);
        } catch {
          // Optional file
        }
      }

      async function addDirToZip(dirPath: string, zipFolder: string) {
        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            const relZipPath = `${zipFolder}/${entry.name}`;
            if (entry.isDirectory()) {
              await addDirToZip(fullPath, relZipPath);
            } else {
              const data = await fs.readFile(fullPath);
              zip.file(relZipPath, data);
            }
          }
        } catch {
          // Optional dir
        }
      }

      await addDirToZip(path.join(__dirname, 'src'), 'src');
      await addDirToZip(path.join(__dirname, 'electron'), 'electron');
      await addDirToZip(path.join(__dirname, 'build'), 'build');
      await addDirToZip(path.join(__dirname, 'scripts'), 'scripts');

      const zipBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="local-desk-desktop-source.zip"');
      res.send(zipBuffer);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to package source archive.' });
    }
  });

  /**
   * Secure URL Document Import with SSRF Protection, Redirect Validation, and 25 MB Limit
   */
  app.post('/api/import-url', async (req, res) => {
    try {
      const { url } = req.body || {};
      if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'Please provide a valid document URL.' });
        return;
      }

      let currentUrl = await assertUrlSafeFromSsrf(url);
      let redirects = 0;
      let response: Response | null = null;

      while (redirects < 3) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        try {
          response = await fetch(currentUrl.toString(), {
            method: 'GET',
            redirect: 'manual',
            signal: controller.signal,
            headers: {
              'User-Agent': 'Vellum-Document-Importer/1.0',
              Accept: 'application/pdf,image/*,*/*;q=0.8'
            }
          });
        } finally {
          clearTimeout(timeout);
        }

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) {
            throw new Error('Remote server returned a redirect without a Location header.');
          }
          const nextUrl = new URL(location, currentUrl).toString();
          currentUrl = await assertUrlSafeFromSsrf(nextUrl);
          redirects++;
          continue;
        }
        break;
      }

      if (!response || !response.ok) {
        res.status(400).json({
          error: `Remote server responded with status ${response ? response.status : 'unknown'}.`
        });
        return;
      }

      const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
      const MAX_BYTES = 25 * 1024 * 1024; // 25 MB limit
      if (contentLength > MAX_BYTES) {
        res.status(413).json({ error: 'Remote file exceeds the 25 MB safety limit.' });
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_BYTES) {
        res.status(413).json({ error: 'Downloaded payload exceeds the 25 MB safety limit.' });
        return;
      }

      const bytes = new Uint8Array(arrayBuffer);
      const headerAscii = new TextDecoder('ascii').decode(bytes.slice(0, 8));
      const isPdf = headerAscii.startsWith('%PDF-');
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
      const isJpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

      if (!isPdf && !isPng && !isJpg && !isZip) {
        res.status(415).json({
          error: 'Remote URL did not return a valid PDF, Office document, or image signature.'
        });
        return;
      }

      const rawSegment = currentUrl.pathname.split('/').pop() || 'imported_document.pdf';
      const safeFileName = rawSegment.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'imported.pdf';
      const base64 = Buffer.from(bytes).toString('base64');

      res.json({
        fileName: safeFileName.includes('.') ? safeFileName : `${safeFileName}.pdf`,
        mimeType: isPdf ? 'application/pdf' : isPng ? 'image/png' : isJpg ? 'image/jpeg' : 'application/octet-stream',
        size: bytes.byteLength,
        base64
      });
    } catch (err: any) {
      res.status(400).json({
        error: err?.message || 'Failed to securely import URL.'
      });
    }
  });

  /**
   * Optional Account Workspace Sync (Strictly zero feature gating between Guest and Registered users)
   */
  app.post('/api/account/sync', (req, res) => {
    const { email, name, themePreset, appearance, saveHistory } = req.body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ error: 'Valid email address required for preference synchronization.' });
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const record = {
      email: cleanEmail,
      name: String(name || cleanEmail.split('@')[0]).slice(0, 60),
      themePreset: String(themePreset || 'obsidian'),
      appearance: String(appearance || 'dark'),
      saveHistory: Boolean(saveHistory),
      updatedAt: new Date().toISOString()
    };
    accountStore.set(cleanEmail, record);
    res.json({ success: true, profile: record });
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    process.env.DISABLE_HMR = 'true';
    const vite = await createViteServer({
      plugins: [
        {
          name: 'vellum-suppress-hmr-websocket-error',
          transform(code, id) {
            if (id.includes('vite/dist/client/client.mjs')) {
              return code
                .replace(
                  'reject(/* @__PURE__ */ new Error("WebSocket closed without opened."));',
                  'resolve();'
                )
                .replace(
                  'transport.connect(createHMRHandler(handleMessage));',
                  'if (false) transport.connect(createHMRHandler(handleMessage));'
                );
            }
            return null;
          }
        }
      ],
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Vellum Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

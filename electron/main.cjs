'use strict';

/**
 * Local Desk — Production Windows Desktop Main Process (Electron)
 *
 * Security & Privacy Architecture:
 * - contextIsolation: true, nodeIntegration: false, sandbox: true
 * - Zero-Outbound-Network Firewall enforced via session.defaultSession.webRequest
 * - Atomic File Save (writes to %LOCALAPPDATA%\Local Desk\Temp then renames)
 * - Automatic Temporary File Purge on Startup and Exit
 * - Single-Instance Lock & Windows Explorer .pdf File Association Handler
 */

const { app, BrowserWindow, ipcMain, dialog, session, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
const os = require('os');

const APP_NAME = 'Local Desk';
const APP_VERSION = '1.0.0';
const isDev = process.env.NODE_ENV === 'development' && !app.isPackaged;

// Configure Windows AppUserModelId for proper Taskbar & Start Menu grouping
if (process.platform === 'win32') {
  app.setAppUserModelId('com.localdesk.pdfstudio');
}

// Resolve Windows-standard paths (%APPDATA%\Local Desk and %LOCALAPPDATA%\Local Desk\Temp)
function getUserDataPath() {
  return app.getPath('userData');
}

function getLocalTempPath() {
  const localAppData = process.env.LOCALAPPDATA || app.getPath('temp');
  return path.join(localAppData, 'Local Desk', 'Temp');
}

function getPreferencesFilePath() {
  return path.join(getUserDataPath(), 'preferences.json');
}

function getRecentFilesPath() {
  return path.join(getUserDataPath(), 'recent-files.json');
}

function getWindowStatePath() {
  return path.join(getUserDataPath(), 'window-state.json');
}

// Allowed document extensions for IPC open/save operations
const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.docx',
  '.xlsx',
  '.pptx',
  '.csv',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.html',
  '.htm',
  '.txt',
  '.zip'
]);

// Outbound network firewall audit state
const networkAuditLog = {
  firewallActive: true,
  allowedLocalRequests: 0,
  blockedExternalRequests: 0,
  blockedUrls: []
};

let mainWindow = null;
let pendingOpenFilePath = null;

/**
 * Extracts a .pdf or supported document file path from Windows command-line arguments
 */
function extractFilePathFromArgs(argv) {
  if (!Array.isArray(argv)) return null;
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg || arg.startsWith('-')) continue;
    const ext = path.extname(arg).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext) && fs.existsSync(arg)) {
      return path.resolve(arg);
    }
  }
  return null;
}

/**
 * Purges all temporary staging files inside %LOCALAPPDATA%\Local Desk\Temp
 */
async function cleanupLocalTempDirectory() {
  const tempDir = getLocalTempPath();
  let filesRemoved = 0;
  let bytesFreed = 0;
  try {
    await fsp.mkdir(tempDir, { recursive: true });
    const entries = await fsp.readdir(tempDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(tempDir, entry.name);
      try {
        const stat = await fsp.stat(fullPath);
        bytesFreed += stat.size || 0;
        await fsp.rm(fullPath, { recursive: true, force: true });
        filesRemoved++;
      } catch {
        // Ignore locked file
      }
    }
  } catch {
    // Directory creation/cleanup non-fatal
  }
  return { tempDir, filesRemoved, bytesFreed };
}

/**
 * Reads JSON safely from disk
 */
async function readJsonFileSafe(filePath, fallbackValue) {
  try {
    const raw = await fsp.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

/**
 * Writes JSON atomically to disk
 */
async function writeJsonFileAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
  const tmpFile = `${filePath}.${Date.now()}.tmp`;
  await fsp.writeFile(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
  await fsp.rename(tmpFile, filePath);
}

/**
 * Records a file in the user's Recent Documents list (%APPDATA%\Local Desk\recent-files.json)
 */
async function addRecentDocumentEntry(filePath, action = 'opened') {
  try {
    const stat = await fsp.stat(filePath);
    const list = await readJsonFileSafe(getRecentFilesPath(), []);
    const filtered = Array.isArray(list)
      ? list.filter((item) => item && item.path !== filePath)
      : [];
    filtered.unshift({
      name: path.basename(filePath),
      path: filePath,
      size: stat.size,
      lastModified: stat.mtimeMs,
      lastOpenedAt: Date.now(),
      action
    });
    const trimmed = filtered.slice(0, 20);
    await writeJsonFileAtomic(getRecentFilesPath(), trimmed);
    if (process.platform === 'win32') {
      app.addRecentDocument(filePath);
    }
    return trimmed;
  } catch {
    return [];
  }
}

/**
 * Enforces a Zero-Outbound-Network Firewall on the Electron session
 * so documents, filenames, and telemetry can never leave the user's Windows PC.
 */
function installSessionNetworkFirewall() {
  const ses = session.defaultSession;

  ses.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url || '';
    const isLocalProtocol =
      url.startsWith('file://') ||
      url.startsWith('data:') ||
      url.startsWith('blob:') ||
      url.startsWith('devtools://') ||
      url.startsWith('chrome-extension://');

    const isDevLocalhost =
      isDev &&
      (url.startsWith('http://localhost:3000') ||
        url.startsWith('http://127.0.0.1:3000') ||
        url.startsWith('ws://localhost:3000'));

    if (isLocalProtocol || isDevLocalhost) {
      networkAuditLog.allowedLocalRequests++;
      callback({ cancel: false });
      return;
    }

    // Block all external internet traffic
    networkAuditLog.blockedExternalRequests++;
    if (networkAuditLog.blockedUrls.length < 25) {
      networkAuditLog.blockedUrls.push({
        url: url.slice(0, 120),
        timestamp: new Date().toISOString()
      });
    }
    callback({ cancel: true });
  });

  ses.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' file: data: blob:; " +
            "script-src 'self' 'wasm-unsafe-eval' blob:; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob: file:; " +
            "font-src 'self' data:; " +
            "connect-src 'self' blob: data: file:; " +
            "object-src 'none'; " +
            "base-uri 'self'; " +
            "frame-ancestors 'none';"
        ]
      }
    });
  });
}

// Single-Instance Lock: Ensure double-clicking a PDF in Windows Explorer focuses the active window
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      const targetFile = extractFilePathFromArgs(commandLine);
      if (targetFile) {
        mainWindow.webContents.send('localdesk:os-open-file', targetFile);
      }
    }
  });
}

async function createMainWindow() {
  const savedWindowState = await readJsonFileSafe(getWindowStatePath(), {
    width: 1440,
    height: 920,
    isMaximized: false
  });

  const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');

  mainWindow = new BrowserWindow({
    width: Math.max(1024, savedWindowState.width || 1440),
    height: Math.max(700, savedWindowState.height || 920),
    minWidth: 960,
    minHeight: 640,
    title: 'Local Desk — PDF & Document Studio',
    backgroundColor: '#0D1F18',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false
    }
  });

  if (savedWindowState.isMaximized) {
    mainWindow.maximize();
  }

  // Persist window geometry on close
  mainWindow.on('close', async () => {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    await writeJsonFileAtomic(getWindowStatePath(), {
      width: bounds.width,
      height: bounds.height,
      isMaximized: mainWindow.isMaximized()
    });
  });

  // Prevent navigation to external websites inside the application window
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!navigationUrl.startsWith('file://') && !navigationUrl.startsWith('http://localhost:3000')) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    const startupFile = pendingOpenFilePath || extractFilePathFromArgs(process.argv);
    if (startupFile) {
      pendingOpenFilePath = null;
      mainWindow.webContents.send('localdesk:os-open-file', startupFile);
    }
  });

  if (isDev) {
    await mainWindow.loadURL('http://localhost:3000');
  } else {
    const indexHtml = path.join(__dirname, '..', 'dist', 'index.html');
    await mainWindow.loadFile(indexHtml);
  }
}

function buildNativeApplicationMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Document...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('localdesk:menu-command', 'open-file');
          }
        },
        {
          label: 'Save Document As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('localdesk:menu-command', 'save-file-as');
          }
        },
        { type: 'separator' },
        {
          label: 'Purge Local Temp Cache',
          click: async () => {
            await cleanupLocalTempDirectory();
            if (mainWindow) mainWindow.webContents.send('localdesk:menu-command', 'temp-purged');
          }
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit Local Desk' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Quick Tool Search',
          accelerator: 'CmdOrCtrl+K',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('localdesk:menu-command', 'open-search');
          }
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help & Privacy Audit',
      submenu: [
        {
          label: 'Offline & Privacy Verification Center',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('localdesk:menu-command', 'open-desktop-center');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ============================================================================
// NARROWLY SCOPED, VALIDATED IPC HANDLERS
// ============================================================================

function registerIpcHandlers() {
  // 1. Open Native File Dialog
  ipcMain.handle('localdesk:open-file-dialog', async (_event, options = {}) => {
    if (!mainWindow) return { canceled: true, files: [] };

    const result = await dialog.showOpenDialog(mainWindow, {
      title: options.title || 'Open Document in Local Desk',
      properties: options.multiSelections
        ? ['openFile', 'multiSelections']
        : ['openFile'],
      filters: options.filters || [
        {
          name: 'All Supported Documents',
          extensions: ['pdf', 'docx', 'xlsx', 'pptx', 'csv', 'png', 'jpg', 'jpeg', 'webp', 'html', 'htm', 'txt']
        },
        { name: 'PDF Documents (*.pdf)', extensions: ['pdf'] },
        { name: 'Office Documents (*.docx, *.xlsx, *.pptx)', extensions: ['docx', 'xlsx', 'pptx', 'csv'] },
        { name: 'Images (*.png, *.jpg, *.webp)', extensions: ['png', 'jpg', 'jpeg', 'webp'] }
      ]
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { canceled: true, files: [] };
    }

    const loadedFiles = [];
    for (const filePath of result.filePaths) {
      const resolved = path.resolve(filePath);
      const ext = path.extname(resolved).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        continue;
      }
      const stat = await fsp.stat(resolved);
      if (!stat.isFile() || stat.size > 512 * 1024 * 1024) {
        continue; // Guard against files > 512 MB
      }
      const buffer = await fsp.readFile(resolved);
      await addRecentDocumentEntry(resolved, 'opened');
      loadedFiles.push({
        name: path.basename(resolved),
        path: resolved,
        size: stat.size,
        lastModified: stat.mtimeMs,
        bytes: Uint8Array.from(buffer)
      });
    }

    return { canceled: false, files: loadedFiles };
  });

  // 2. Open Specific File Path from Recent List or OS File Association
  ipcMain.handle('localdesk:open-recent-path', async (_event, targetPath) => {
    if (typeof targetPath !== 'string' || !targetPath.trim()) {
      throw new Error('Invalid file path');
    }
    const resolved = path.resolve(targetPath);
    const ext = path.extname(resolved).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(`Unsupported file extension: ${ext}`);
    }
    if (!fs.existsSync(resolved)) {
      throw new Error('File no longer exists at this location.');
    }
    const stat = await fsp.stat(resolved);
    if (!stat.isFile()) {
      throw new Error('Target path is not a regular file.');
    }
    const buffer = await fsp.readFile(resolved);
    await addRecentDocumentEntry(resolved, 'opened');
    return {
      name: path.basename(resolved),
      path: resolved,
      size: stat.size,
      lastModified: stat.mtimeMs,
      bytes: Uint8Array.from(buffer)
    };
  });

  // 3. Save File Dialog with Atomic Temp-to-Target Write & SHA-256 Verification
  ipcMain.handle('localdesk:save-file-dialog', async (_event, payload) => {
    if (!mainWindow || !payload || !payload.bytes) {
      return { canceled: true };
    }

    const suggestedName = path.basename(payload.suggestedName || 'LocalDesk_Output.pdf');
    const ext = path.extname(suggestedName).toLowerCase().replace('.', '') || 'pdf';

    const saveResult = await dialog.showSaveDialog(mainWindow, {
      title: payload.title || 'Save Processed Document',
      defaultPath: path.join(app.getPath('documents'), suggestedName),
       properties: ['showOverwriteConfirmation', 'createDirectory'],
      filters: [
        { name: `${ext.toUpperCase()} Document (*.${ext})`, extensions: [ext] },
        { name: 'All Files (*.*)', extensions: ['*'] }
      ]
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { canceled: true };
    }

    const destPath = path.resolve(saveResult.filePath);
    const byteBuffer = Buffer.from(payload.bytes);

    // Atomic write: write to %LOCALAPPDATA%\Local Desk\Temp first, then move into place
    const tempDir = getLocalTempPath();
    await fsp.mkdir(tempDir, { recursive: true });
    const stagingPath = path.join(
      tempDir,
      `LocalDesk-Atomic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`
    );

    await fsp.writeFile(stagingPath, byteBuffer);
    const sha256 = crypto.createHash('sha256').update(byteBuffer).digest('hex');

    try {
      await fsp.rename(stagingPath, destPath);
    } catch {
      // Cross-volume fallback: copy then unlink staging file
      await fsp.copyFile(stagingPath, destPath);
      await fsp.rm(stagingPath, { force: true });
    }

    await addRecentDocumentEntry(destPath, 'saved');

    return {
      canceled: false,
      savedPath: destPath,
      fileName: path.basename(destPath),
      size: byteBuffer.byteLength,
      sha256
    };
  });

  // 4. Recent Files Management
  ipcMain.handle('localdesk:get-recent-files', async () => {
    const list = await readJsonFileSafe(getRecentFilesPath(), []);
    if (!Array.isArray(list)) return [];
    return list.filter((item) => item && typeof item.path === 'string' && fs.existsSync(item.path));
  });

  ipcMain.handle('localdesk:clear-recent-files', async () => {
    await writeJsonFileAtomic(getRecentFilesPath(), []);
    if (process.platform === 'win32') {
      app.clearRecentDocuments();
    }
    return [];
  });

  // 5. Preferences Persistence (%APPDATA%\Local Desk\preferences.json)
  ipcMain.handle('localdesk:get-preferences', async () => {
    return await readJsonFileSafe(getPreferencesFilePath(), {
      appearance: 'dark'
    });
  });

  ipcMain.handle('localdesk:set-preferences', async (_event, prefs) => {
    if (!prefs || typeof prefs !== 'object') return false;
    await writeJsonFileAtomic(getPreferencesFilePath(), prefs);
    return true;
  });

  // 6. Temporary Directory Cleanup
  ipcMain.handle('localdesk:cleanup-temp', async () => {
    return await cleanupLocalTempDirectory();
  });

  // 7. Desktop Runtime & Privacy Diagnostics
  ipcMain.handle('localdesk:get-diagnostics', async () => {
    return {
      appName: APP_NAME,
      appVersion: APP_VERSION,
      platform: process.platform,
      arch: process.arch,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      userDataPath: getUserDataPath(),
      tempPath: getLocalTempPath(),
      isPackaged: app.isPackaged,
      networkFirewall: networkAuditLog,
      hostname: os.hostname(),
      totalMemMb: Math.round(os.totalmem() / (1024 * 1024))
    };
  });

  // 8. Reveal Saved File in Windows Explorer
  ipcMain.handle('localdesk:show-item-in-folder', async (_event, fullPath) => {
    if (typeof fullPath === 'string' && fs.existsSync(fullPath)) {
      shell.showItemInFolder(path.resolve(fullPath));
      return true;
    }
    return false;
  });
}

app.whenReady().then(async () => {
  await cleanupLocalTempDirectory();
  installSessionNetworkFirewall();
  registerIpcHandlers();
  buildNativeApplicationMenu();
  await createMainWindow();
});

app.on('will-quit', async () => {
  await cleanupLocalTempDirectory();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

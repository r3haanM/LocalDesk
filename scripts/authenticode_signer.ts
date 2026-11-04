import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';

export interface SigningEnvironmentConfig {
  /**
   * Build mode designation ('development-unsigned' | 'production-signed')
   */
  buildMode: 'development-unsigned' | 'production-signed';
  /**
   * True when FORCE_CODE_SIGNING=true or RELEASE_MODE=production-signed
   */
  forceCodeSigning: boolean;
  /**
   * True when ALLOW_UNSIGNED_DEV_BUILDS=true (default true when FORCE_CODE_SIGNING is false)
   */
  allowUnsignedDevBuilds: boolean;
  /**
   * Backwards-compatible alias for allowUnsignedDevBuilds
   */
  allowUnsignedDevBuild: boolean;
  /**
   * True if WIN_CSC_LINK (or CSC_LINK) and WIN_CSC_KEY_PASSWORD (or CSC_KEY_PASSWORD) are provided
   */
  hasCertificateCredentials: boolean;
  /**
   * Path or base64 string from WIN_CSC_LINK / CSC_LINK (never logged!)
   */
  cscLinkRaw: string | null;
  /**
   * Password from WIN_CSC_KEY_PASSWORD / CSC_KEY_PASSWORD (never logged!)
   */
  cscKeyPassword: string | null;
  /**
   * Verified publisher identity from WIN_PUBLISHER_NAME (null when unset in unsigned development builds)
   */
  publisherName: string | null;
  /**
   * Safe display string for PE VersionInfo / Registry when WIN_PUBLISHER_NAME is unset ("Local Desk")
   */
  publisherDisplayName: string;
  /**
   * RFC 3161 SHA-256 Timestamp Authority URL from WIN_TIMESTAMP_SERVER (null when unset in unsigned dev builds)
   */
  timestampServerUrl: string | null;
  /**
   * Detected external signing tool on current host ('signtool' | 'osslsigncode' | null)
   */
  detectedSignTool: 'signtool' | 'osslsigncode' | null;
}

export interface AuthenticodeInspectionReport {
  fileName: string;
  isSigned: boolean;
  securityDirOffset: number;
  securityDirSize: number;
  winCertRevision: number | null;
  winCertType: number | null;
  statusSummary: string;
}

function detectAvailableSigningBinary(): 'signtool' | 'osslsigncode' | null {
  try {
    execFileSync('signtool', ['/?'], { stdio: 'ignore' });
    return 'signtool';
  } catch {
    // Not on Windows or signtool not in PATH
  }
  try {
    execFileSync('osslsigncode', ['--version'], { stdio: 'ignore' });
    return 'osslsigncode';
  } catch {
    // osslsigncode not installed
  }
  return null;
}

/**
 * Inspects environment variables for Windows Authenticode signing without ever logging secrets.
 *
 * Environment Variable Mapping:
 * - WIN_CSC_LINK, WIN_CSC_KEY_PASSWORD: Natively recognized by Electron Builder AND consumed here.
 * - WIN_PUBLISHER_NAME, WIN_TIMESTAMP_SERVER, FORCE_CODE_SIGNING, ALLOW_UNSIGNED_DEV_BUILDS:
 *   Consumed by Local Desk's release pipeline (scripts/authenticode_signer.ts & scripts/build_windows_release.ts).
 */
export function inspectSigningEnvironment(
  env: NodeJS.ProcessEnv = process.env
): SigningEnvironmentConfig {
  const forceCodeSigning =
    env.FORCE_CODE_SIGNING === 'true' ||
    env.FORCE_CODE_SIGNING === '1' ||
    env.RELEASE_MODE === 'production-signed';

  // Canonical variable: ALLOW_UNSIGNED_DEV_BUILDS (also accepts legacy/truncated aliases ALLOW_UNSIGNED_DEV_BUILD / ALLOW_UNSIGNED_DEV_BUIL)
  const rawAllowUnsigned =
    env.ALLOW_UNSIGNED_DEV_BUILDS ??
    env.ALLOW_UNSIGNED_DEV_BUILD ??
    env.ALLOW_UNSIGNED_DEV_BUIL;

  const allowUnsignedDevBuilds =
    !forceCodeSigning &&
    (rawAllowUnsigned === undefined ||
      rawAllowUnsigned === 'true' ||
      rawAllowUnsigned === '1');

  const cscLinkRaw = (env.WIN_CSC_LINK || env.CSC_LINK || '').trim() || null;
  const rawKeyPassword = env.WIN_CSC_KEY_PASSWORD ?? env.CSC_KEY_PASSWORD;
  const cscKeyPassword =
    rawKeyPassword !== undefined && rawKeyPassword !== '' ? rawKeyPassword : null;

  const hasCertificateCredentials = Boolean(cscLinkRaw && cscKeyPassword !== null);

  // Do not invent a certificate publisher identity when WIN_PUBLISHER_NAME is unset
  const rawPublisher = (env.WIN_PUBLISHER_NAME || '').trim();
  const publisherName = rawPublisher.length > 0 ? rawPublisher : null;
  const publisherDisplayName = publisherName || 'Local Desk';

  const rawTimestamp = (env.WIN_TIMESTAMP_SERVER || '').trim();
  const timestampServerUrl =
    rawTimestamp.length > 0
      ? rawTimestamp
      : hasCertificateCredentials
      ? 'http://timestamp.digicert.com'
      : null;

  const buildMode =
    forceCodeSigning || hasCertificateCredentials
      ? 'production-signed'
      : 'development-unsigned';

  return {
    buildMode,
    forceCodeSigning,
    allowUnsignedDevBuilds,
    allowUnsignedDevBuild: allowUnsignedDevBuilds,
    hasCertificateCredentials,
    cscLinkRaw,
    cscKeyPassword,
    publisherName,
    publisherDisplayName,
    timestampServerUrl,
    detectedSignTool: detectAvailableSigningBinary()
  };
}

/**
 * Enforces the code-signing gate:
 * - In Production Release mode (FORCE_CODE_SIGNING=true): missing credentials immediately abort the build.
 * - In Development Build mode (FORCE_CODE_SIGNING=false, ALLOW_UNSIGNED_DEV_BUILDS=true):
 *   unsigned builds are permitted without requiring WIN_CSC_LINK or WIN_CSC_KEY_PASSWORD.
 */
export function assertSigningReadinessForBuild(config: SigningEnvironmentConfig): void {
  if (config.forceCodeSigning && !config.hasCertificateCredentials) {
    throw new Error(
      'PRODUCTION CODE SIGNING ENFORCEMENT FAILED (FORCE_CODE_SIGNING=true): ' +
        'Missing WIN_CSC_LINK and/or WIN_CSC_KEY_PASSWORD environment variables. ' +
        'Production releases must never silently produce unsigned executables. ' +
        'Provision a trusted Authenticode PFX/P12 certificate via WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD, ' +
        'or set FORCE_CODE_SIGNING=false and ALLOW_UNSIGNED_DEV_BUILDS=true for local development builds.'
    );
  }

  if (!config.forceCodeSigning && !config.hasCertificateCredentials && !config.allowUnsignedDevBuilds) {
    throw new Error(
      'UNSIGNED BUILD BLOCKED: Signing credentials are not configured and ALLOW_UNSIGNED_DEV_BUILDS is false. ' +
        'Set ALLOW_UNSIGNED_DEV_BUILDS=true to build an unsigned development installer.'
    );
  }

  if (config.hasCertificateCredentials && !config.detectedSignTool) {
    throw new Error(
      'AUTHENTICODE SIGNING TOOL MISSING: WIN_CSC_LINK is configured, but neither Windows SDK `signtool.exe` ' +
        'nor `osslsigncode` is available in PATH to apply the SHA-256 Authenticode signature.'
    );
  }
}

/**
 * Inspects a PE32+ executable's DataDirectory[4] (IMAGE_DIRECTORY_ENTRY_SECURITY)
 * to determine whether an Authenticode WIN_CERTIFICATE PKCS#7 SignedData table is embedded.
 */
export function inspectPeAuthenticodeSignature(
  peBuf: Buffer,
  fileName: string
): AuthenticodeInspectionReport {
  if (peBuf.byteLength < 0x200 || peBuf.readUInt16LE(0) !== 0x5a4d) {
    throw new Error(`[${fileName}] Not a valid PE binary (missing MZ header)`);
  }
  const lfanew = peBuf.readUInt32LE(0x3c);
  if (peBuf.readUInt32LE(lfanew) !== 0x00004550) {
    throw new Error(`[${fileName}] Not a valid PE binary (missing PE\\0\\0 signature)`);
  }
  const optOff = lfanew + 24;
  const optMagic = peBuf.readUInt16LE(optOff);
  const ddOff = optOff + (optMagic === 0x020b ? 0x70 : 0x60);

  // DataDirectory[4] is the Certificate Table (IMAGE_DIRECTORY_ENTRY_SECURITY)
  // Note: Unlike other data directories, VirtualAddress in DataDirectory[4] is a raw file pointer!
  const securityDirOffset = peBuf.readUInt32LE(ddOff + 4 * 8 + 0);
  const securityDirSize = peBuf.readUInt32LE(ddOff + 4 * 8 + 4);

  if (securityDirOffset === 0 || securityDirSize === 0) {
    return {
      fileName,
      isSigned: false,
      securityDirOffset: 0,
      securityDirSize: 0,
      winCertRevision: null,
      winCertType: null,
      statusSummary: 'NotSigned (Unsigned Development Build — IMAGE_DIRECTORY_ENTRY_SECURITY = 0x00000000)'
    };
  }

  if (securityDirOffset + securityDirSize > peBuf.byteLength || securityDirSize < 8) {
    throw new Error(
      `[${fileName}] Corrupted Authenticode Certificate Table at offset 0x${securityDirOffset.toString(16)} (size ${securityDirSize})`
    );
  }

  const dwLength = peBuf.readUInt32LE(securityDirOffset + 0);
  const wRevision = peBuf.readUInt16LE(securityDirOffset + 4);
  const wCertificateType = peBuf.readUInt16LE(securityDirOffset + 6);

  const isValidPkcs7 =
    dwLength >= 8 &&
    dwLength <= securityDirSize &&
    wRevision === 0x0200 &&
    wCertificateType === 0x0002;

  return {
    fileName,
    isSigned: isValidPkcs7,
    securityDirOffset,
    securityDirSize,
    winCertRevision: wRevision,
    winCertType: wCertificateType,
    statusSummary: isValidPkcs7
      ? `Signed (WIN_CERT_REVISION_2_0, PKCS#7 SignedData, ${securityDirSize} bytes at 0x${securityDirOffset.toString(16)})`
      : `Malformed WIN_CERTIFICATE (rev=0x${wRevision.toString(16)}, type=0x${wCertificateType.toString(16)})`
  };
}

/**
 * Materializes WIN_CSC_LINK (either a file path or a base64-encoded PFX/P12 bundle) to a temporary file
 * for signing, then securely deletes the temporary file immediately after signing.
 */
async function resolveCscLinkToFile(
  cscLinkRaw: string
): Promise<{ pfxPath: string; cleanup: () => Promise<void> }> {
  try {
    const stat = await fs.stat(cscLinkRaw);
    if (stat.isFile()) {
      return {
        pfxPath: path.resolve(cscLinkRaw),
        cleanup: async () => {}
      };
    }
  } catch {
    // Treat as base64-encoded PFX payload
  }

  const cleanedBase64 = cscLinkRaw.replace(/^data:application\/x-pkcs12;base64,/i, '');
  const pfxBytes = Buffer.from(cleanedBase64, 'base64');
  if (pfxBytes.byteLength < 64) {
    throw new Error(
      'Invalid WIN_CSC_LINK: Path does not exist and value is not a valid base64-encoded PFX/P12 certificate.'
    );
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'localdesk-csc-'));
  const tmpPfxPath = path.join(tmpDir, 'signing-cert.pfx');
  await fs.writeFile(tmpPfxPath, pfxBytes, { mode: 0o600 });

  return {
    pfxPath: tmpPfxPath,
    cleanup: async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  };
}

/**
 * Signs a Windows PE32+ executable using SHA-256 and an RFC 3161 timestamp server when
 * WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD are provided.
 * In unsigned development builds, returns the unsigned PE32+ buffer intact.
 */
export async function signPe64ExecutableIfConfigured(
  peBuffer: Buffer,
  fileName: string,
  config: SigningEnvironmentConfig
): Promise<{ buffer: Buffer; inspection: AuthenticodeInspectionReport }> {
  assertSigningReadinessForBuild(config);

  if (!config.hasCertificateCredentials) {
    const inspection = inspectPeAuthenticodeSignature(peBuffer, fileName);
    return { buffer: peBuffer, inspection };
  }

  const { pfxPath, cleanup } = await resolveCscLinkToFile(config.cscLinkRaw!);
  const tmpWorkDir = await fs.mkdtemp(path.join(os.tmpdir(), 'localdesk-sign-'));
  const unsignedPath = path.join(tmpWorkDir, `unsigned-${fileName}`);
  const signedPath = path.join(tmpWorkDir, `signed-${fileName}`);
  const tsUrl = config.timestampServerUrl || 'http://timestamp.digicert.com';

  try {
    await fs.writeFile(unsignedPath, peBuffer);

    if (config.detectedSignTool === 'signtool') {
      execFileSync(
        'signtool',
        [
          'sign',
          '/f',
          pfxPath,
          '/p',
          config.cscKeyPassword || '',
          '/fd',
          'sha256',
          '/tr',
          tsUrl,
          '/td',
          'sha256',
          '/d',
          'Local Desk',
          unsignedPath
        ],
        { stdio: 'pipe' }
      );
      await fs.copyFile(unsignedPath, signedPath);
    } else if (config.detectedSignTool === 'osslsigncode') {
      execFileSync(
        'osslsigncode',
        [
          'sign',
          '-pkcs12',
          pfxPath,
          '-pass',
          config.cscKeyPassword || '',
          '-h',
          'sha256',
          '-ts',
          tsUrl,
          '-n',
          'Local Desk',
          '-in',
          unsignedPath,
          '-out',
          signedPath
        ],
        { stdio: 'pipe' }
      );
    }

    const signedBuf = await fs.readFile(signedPath);
    const inspection = inspectPeAuthenticodeSignature(signedBuf, fileName);
    if (!inspection.isSigned) {
      throw new Error(
        `[${fileName}] Authenticode post-signing verification failed: ${inspection.statusSummary}`
      );
    }
    return { buffer: signedBuf, inspection };
  } finally {
    await cleanup();
    await fs.rm(tmpWorkDir, { recursive: true, force: true });
  }
}

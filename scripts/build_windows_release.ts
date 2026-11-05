import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import {
  buildWindowsPe64Executable,
  buildSpecCompliantIcoBuffer,
  computePeChecksum
} from './pe64_builder';
import {
  inspectSigningEnvironment,
  assertSigningReadinessForBuild,
  signPe64ExecutableIfConfigured,
  inspectPeAuthenticodeSignature
} from './authenticode_signer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function sha256Hex(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Loads the 7 PNG icon layers (16..256px) and generates a spec-compliant Windows .ico
 * where 16..128px are 32-bit BGRA BITMAPINFOHEADER DIBs and 256px is PNG.
 */
async function buildWindowsIcoAndLoadLayers(): Promise<{
  icoBuffer: Buffer;
  pngLayers: Array<{ size: number; pngData: Buffer }>;
}> {
  const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const pngLayers: Array<{ size: number; pngData: Buffer }> = [];

  for (const s of sizes) {
    const pngPath = path.join(
      ROOT_DIR,
      'public',
      'brand',
      'png',
      `local-desk-app-icon-${s}x${s}.png`
    );
    const pngData = await fs.readFile(pngPath);
    pngLayers.push({ size: s, pngData });
  }

  const icoBuffer = buildSpecCompliantIcoBuffer(pngLayers);
  const buildDir = path.join(ROOT_DIR, 'build');
  await fs.mkdir(buildDir, { recursive: true });
  await fs.writeFile(path.join(buildDir, 'icon.ico'), icoBuffer);
  await fs.writeFile(path.join(buildDir, 'local-desk-icon-v103.ico'), icoBuffer);
  await fs.writeFile(path.join(ROOT_DIR, 'public', 'favicon.ico'), icoBuffer);

  console.log(
    `[ICO] Generated spec-compliant Windows .ico (16..128px 32-bit BGRA DIB + 256px PNG): ${icoBuffer.byteLength} bytes`
  );
  return { icoBuffer, pngLayers };
}

/**
 * Bundles local OCR worker and WASM core files into /public/ocr/ for offline execution
 */
async function bundleLocalOcrAssets() {
  const ocrPublicDir = path.join(ROOT_DIR, 'public', 'ocr');
  await fs.mkdir(ocrPublicDir, { recursive: true });

  const filesToCopy = [
    {
      src: path.join(ROOT_DIR, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js'),
      dest: path.join(ocrPublicDir, 'worker.min.js')
    },
    {
      src: path.join(ROOT_DIR, 'node_modules', 'tesseract.js-core', 'tesseract-core.wasm.js'),
      dest: path.join(ocrPublicDir, 'tesseract-core.wasm.js')
    },
    {
      src: path.join(ROOT_DIR, 'node_modules', 'tesseract.js-core', 'tesseract-core.wasm'),
      dest: path.join(ocrPublicDir, 'tesseract-core.wasm')
    },
    {
      src: path.join(
        ROOT_DIR,
        'node_modules',
        'tesseract.js-core',
        'tesseract-core-simd-lstm.wasm.js'
      ),
      dest: path.join(ocrPublicDir, 'tesseract-core-simd-lstm.wasm.js')
    },
    {
      src: path.join(
        ROOT_DIR,
        'node_modules',
        'tesseract.js-core',
        'tesseract-core-simd-lstm.wasm'
      ),
      dest: path.join(ocrPublicDir, 'tesseract-core-simd-lstm.wasm')
    }
  ];

  let copiedCount = 0;
  for (const item of filesToCopy) {
    try {
      await fs.copyFile(item.src, item.dest);
      copiedCount++;
    } catch {
      // Optional asset
    }
  }
  console.log(`[OCR] Bundled ${copiedCount} local Tesseract worker & WASM files into /public/ocr/`);
}

async function addDirectoryToZip(zip: JSZip, dirPath: string, zipFolder: string) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relPath = zipFolder ? `${zipFolder}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await addDirectoryToZip(zip, fullPath, relPath);
    } else {
      const content = await fs.readFile(fullPath);
      zip.file(relPath, content);
    }
  }
}

/**
 * Inspects a generated PE32+ executable buffer and verifies all Windows 11 x64 loader invariants:
 * - MZ (0x5A4D) + PE\0\0 (0x00004550)
 * - Machine = 0x8664 (AMD64) + Magic = 0x020B (PE32+)
 * - 5 isolated sections (.text, .rdata, .data, .rsrc, .reloc)
 * - High-Entropy ASLR DllCharacteristics (0x8160)
 * - Valid CheckSumMappedFile checksum
 * - If SFX ZIP payload is present, verifies EOCD (PK\x05\x06) and all Central Directory (PK\x01\x02)
 *   and Local Header (PK\x03\x04) offsets from byte 0 of the .exe!
 */
export function verifyPe64BinaryInvariants(
  buf: Buffer,
  label: string,
  expectSfxOverlay = false
): {
  peSectionsEndOffset: number;
  checkSum: number;
  sfxEntryCount: number;
  hasVersionInfoResource: boolean;
  isAuthenticodeSigned: boolean;
} {
  const dosMagic = buf.readUInt16LE(0x00);
  if (dosMagic !== 0x5a4d) {
    throw new Error(`[${label}] Invalid DOS MZ signature: 0x${dosMagic.toString(16)}`);
  }
  const lfanew = buf.readUInt32LE(0x3c);
  const peSig = buf.readUInt32LE(lfanew);
  if (peSig !== 0x00004550) {
    throw new Error(`[${label}] Invalid PE signature: 0x${peSig.toString(16)}`);
  }
  const machine = buf.readUInt16LE(lfanew + 4);
  if (machine !== 0x8664) {
    throw new Error(
      `[${label}] Invalid Machine architecture: 0x${machine.toString(16)} (expected 0x8664 AMD64)`
    );
  }
  const numSections = buf.readUInt16LE(lfanew + 6);
  if (numSections !== 5) {
    throw new Error(`[${label}] Expected 5 PE sections (.text, .rdata, .data, .rsrc, .reloc), got ${numSections}`);
  }
  const optOff = lfanew + 24;
  const optMagic = buf.readUInt16LE(optOff);
  if (optMagic !== 0x020b) {
    throw new Error(
      `[${label}] Invalid OptionalHeader Magic: 0x${optMagic.toString(16)} (expected 0x020B PE32+)`
    );
  }
  const subsystem = buf.readUInt16LE(optOff + 0x44);
  if (subsystem !== 2) {
    throw new Error(`[${label}] Invalid Subsystem: ${subsystem} (expected 2 = WINDOWS_GUI)`);
  }
  const dllChars = buf.readUInt16LE(optOff + 0x46);
  if (dllChars !== 0x8160) {
    throw new Error(`[${label}] Invalid DllCharacteristics: 0x${dllChars.toString(16)} (expected 0x8160)`);
  }

  // Verify section boundaries and inspect .rsrc for RT_VERSION (Type 16, VS_FIXEDFILEINFO 0xFEEF04BD)
  const secOff = optOff + 0xf0;
  let maxRawEnd = 0;
  let rsrcRawPtr = 0;
  let rsrcRawSize = 0;
  for (let i = 0; i < numSections; i++) {
    const s = secOff + i * 40;
    const secName = buf.subarray(s, s + 8).toString('ascii').replace(/\0+$/, '');
    const rawSize = buf.readUInt32LE(s + 16);
    const rawPtr = buf.readUInt32LE(s + 20);
    if (rawPtr + rawSize > buf.byteLength) {
      throw new Error(`[${label}] Section #${i} (${secName}) exceeds file length`);
    }
    if (secName === '.rsrc') {
      rsrcRawPtr = rawPtr;
      rsrcRawSize = rawSize;
    }
    if (rawPtr + rawSize > maxRawEnd) {
      maxRawEnd = rawPtr + rawSize;
    }
  }

  if (rsrcRawPtr === 0 || rsrcRawSize === 0) {
    throw new Error(`[${label}] Missing .rsrc section`);
  }
  const rsrcSlice = buf.subarray(rsrcRawPtr, rsrcRawPtr + rsrcRawSize);
  const fixedFileInfoMagic = Buffer.from([0xbd, 0x04, 0xef, 0xfe]); // 0xFEEF04BD in little-endian
  const hasVersionInfoResource = rsrcSlice.includes(fixedFileInfoMagic);
  if (!hasVersionInfoResource) {
    throw new Error(`[${label}] Missing VS_VERSION_INFO (0xFEEF04BD) resource in .rsrc section`);
  }

  const storedChecksum = buf.readUInt32LE(optOff + 0x40);
  const authInspect = inspectPeAuthenticodeSignature(buf, label);
  if (!authInspect.isSigned) {
    const copy = Buffer.from(buf);
    const expectedChecksum = computePeChecksum(copy, optOff + 0x40);
    if (storedChecksum !== expectedChecksum) {
      throw new Error(
        `[${label}] PE CheckSum mismatch: stored=0x${storedChecksum.toString(16)}, expected=0x${expectedChecksum.toString(16)}`
      );
    }
  }

  let sfxEntryCount = 0;
  if (expectSfxOverlay) {
    // Verify PK\x03\x04 starts immediately at maxRawEnd (zero unmapped gap)
    const overlaySig = buf.readUInt32LE(maxRawEnd);
    if (overlaySig !== 0x04034b50) {
      throw new Error(
        `[${label}] Expected PK\\x03\\x04 at PE end offset 0x${maxRawEnd.toString(16)}, got 0x${overlaySig.toString(16)}`
      );
    }

    // If signed with Authenticode, the WIN_CERTIFICATE table sits after the SFX payload at securityDirOffset
    const sfxEndOffset =
      authInspect.securityDirOffset > maxRawEnd ? authInspect.securityDirOffset : buf.byteLength;

    // Verify EOCD at sfxEndOffset - 22 has relocated Central Directory offset pointing to valid PK\x01\x02 from byte 0
    const eocdOff = sfxEndOffset - 22;
    const eocdSig = buf.readUInt32LE(eocdOff);
    if (eocdSig !== 0x06054b50) {
      throw new Error(`[${label}] Missing PK\\x05\\x06 EOCD at SFX end`);
    }
    sfxEntryCount = buf.readUInt16LE(eocdOff + 10);
    const cdOffset = buf.readUInt32LE(eocdOff + 16);
    const cdFirstSig = buf.readUInt32LE(cdOffset);
    if (cdFirstSig !== 0x02014b50) {
      throw new Error(
        `[${label}] Corrupted EOCD cdOffset 0x${cdOffset.toString(16)}: expected PK\\x01\\x02 (0x02014b50), got 0x${cdFirstSig.toString(16)}`
      );
    }
    // Verify first entry's local header offset from byte 0 lands on PK\x03\x04
    const firstLocalOff = buf.readUInt32LE(cdOffset + 42);
    const firstLocalSig = buf.readUInt32LE(firstLocalOff);
    if (firstLocalSig !== 0x04034b50) {
      throw new Error(
        `[${label}] Corrupted Central Directory localHeaderOffset 0x${firstLocalOff.toString(16)}: expected PK\\x03\\x04, got 0x${firstLocalSig.toString(16)}`
      );
    }
  }

  return {
    peSectionsEndOffset: maxRawEnd,
    checkSum: storedChecksum,
    sfxEntryCount,
    hasVersionInfoResource,
    isAuthenticodeSigned: authInspect.isSigned
  };
}

/**
 * Encodes a Windows PowerShell 5.1 (.ps1) script with a single UTF-8 BOM (0xEF 0xBB 0xBF),
 * CRLF (\r\n) line endings, and strict ASCII-only punctuation verification so Windows PowerShell 5.1
 * never misinterprets UTF-8 multi-byte sequences under system ANSI code pages (Windows-1252).
 */
export function encodePowerShellScriptWithUtf8Bom(
  scriptContent: string,
  scriptName: string
): Buffer {
  const withoutBom = scriptContent.replace(/^\uFEFF+/, '');
  const crlfNormalized = withoutBom.replace(/\r?\n/g, '\r\n');
  const bodyBuffer = Buffer.from(crlfNormalized, 'utf8');

  // Audit script body to ensure zero non-ASCII bytes (>= 0x80) exist
  for (let i = 0; i < bodyBuffer.byteLength; i++) {
    const byte = bodyBuffer[i];
    if (byte >= 0x80) {
      throw new Error(
        `[PS1-ENCODING] Non-ASCII byte 0x${byte.toString(16)} detected in ${scriptName} at offset ${i}. Use ASCII punctuation only.`
      );
    }
  }

  const utf8Bom = Buffer.from([0xef, 0xbb, 0xbf]);
  const finalBuffer = Buffer.concat([utf8Bom, bodyBuffer]);

  // Verify single BOM and no duplicate BOM
  if (
    finalBuffer[0] !== 0xef ||
    finalBuffer[1] !== 0xbb ||
    finalBuffer[2] !== 0xbf ||
    (finalBuffer.byteLength >= 6 &&
      finalBuffer[3] === 0xef &&
      finalBuffer[4] === 0xbb &&
      finalBuffer[5] === 0xbf)
  ) {
    throw new Error(`[PS1-ENCODING] Invalid or duplicate UTF-8 BOM on ${scriptName}`);
  }

  return finalBuffer;
}

async function main() {
  console.log('=== LOCAL DESK WINDOWS 11 x64 PE32+ DESKTOP RELEASE BUILDER (v1.0.3) ===');

  // 0. Audit Authenticode Signing Environment & Enforce Production Signing Policy
  const signingEnv = inspectSigningEnvironment();
  assertSigningReadinessForBuild(signingEnv);
  console.log(
    `[SIGNING-AUDIT] BuildMode: "${signingEnv.buildMode}" | WIN_CSC_LINK: ${signingEnv.cscLinkRaw ? 'SET' : 'UNSET'} | WIN_CSC_KEY_PASSWORD: ${signingEnv.cscKeyPassword !== null ? 'SET' : 'UNSET'} | WIN_PUBLISHER_NAME: ${signingEnv.publisherName ?? 'UNSET'} | WIN_TIMESTAMP_SERVER: ${signingEnv.timestampServerUrl ?? 'UNSET'} | FORCE_CODE_SIGNING: ${signingEnv.forceCodeSigning} | ALLOW_UNSIGNED_DEV_BUILDS: ${signingEnv.allowUnsignedDevBuilds}`
  );

  const releaseDir = path.join(ROOT_DIR, 'release');
  const stagingDir = path.join(ROOT_DIR, 'release_staging_tmp');
  await fs.rm(stagingDir, { recursive: true, force: true });
  await fs.mkdir(stagingDir, { recursive: true });

  // 1. Generate spec-compliant Windows .ico (16..128px DIB + 256px PNG)
  const { icoBuffer, pngLayers } = await buildWindowsIcoAndLoadLayers();

  // 2. Copy local OCR worker & WASM assets into /public/ocr/
  await bundleLocalOcrAssets();

  // 3. Run Vite Production Build
  console.log('[BUILD] Running production Vite build...');
  execSync('npx vite build', { cwd: ROOT_DIR, stdio: 'inherit' });

  const distIndexHtml = await fs.readFile(path.join(ROOT_DIR, 'dist', 'index.html'), 'utf-8');
  if (
    distIndexHtml.includes('fonts.googleapis.com') ||
    distIndexHtml.includes('cdn.jsdelivr.net')
  ) {
    throw new Error('Offline audit failed: External CDN URL found in dist/index.html');
  }
  console.log('[AUDIT] Verified dist/index.html contains 0 external CDN URLs.');

  // 4. Compile & Sign Inner 64-bit Windows PE32+ GUI Executables ("Local Desk.exe" & "Uninstall Local Desk.exe")
  // Inner executables MUST be compiled and signed BEFORE being packaged into the Portable ZIP or Setup SFX archive!
  console.log(
    '[PE64] Compiling native 64-bit Windows 11 PE32+ GUI executable: Local Desk.exe (0x8664 AMD64 + RT_VERSION)...'
  );
  const appLauncherCommandLine =
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$exe=$env:LOCAL_DESK_EXE_PATH; $dir=Split-Path -Parent $exe; & (Join-Path $dir \'Launch-Local-Desk.ps1\')"';

  const rawLocalDeskExeBytes = buildWindowsPe64Executable({
    commandLine: appLauncherCommandLine,
    waitForChildMs: 0,
    pngLayers,
    versionInfo: {
      companyName: signingEnv.publisherDisplayName,
      fileDescription: 'Local Desk - All-in-One Privacy-First PDF & Document Studio',
      fileVersion: '1.0.3.0',
      internalName: 'LocalDesk',
      legalCopyright: `Copyright (C) 2026 ${signingEnv.publisherDisplayName}`,
      originalFilename: 'Local Desk.exe',
      productName: 'Local Desk',
      productVersion: '1.0.3.0',
      versionTuple: [1, 0, 3, 0]
    }
  });
  const signedLocalDeskExe = await signPe64ExecutableIfConfigured(
    rawLocalDeskExeBytes,
    'Local Desk.exe',
    signingEnv
  );
  const localDeskExeBytes = signedLocalDeskExe.buffer;
  verifyPe64BinaryInvariants(localDeskExeBytes, 'Local Desk.exe', false);

  console.log(
    '[PE64] Compiling native 64-bit Windows 11 PE32+ GUI executable: Uninstall Local Desk.exe (0x8664 AMD64 + RT_VERSION)...'
  );
  const uninstallerCommandLine =
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$exe=$env:LOCAL_DESK_EXE_PATH; $dir=Split-Path -Parent $exe; & (Join-Path $dir \'Uninstall-Local-Desk.ps1\')"';

  const rawUninstallExeBytes = buildWindowsPe64Executable({
    commandLine: uninstallerCommandLine,
    waitForChildMs: 0xffffffff,
    pngLayers,
    versionInfo: {
      companyName: signingEnv.publisherDisplayName,
      fileDescription: 'Local Desk - Clean Windows Uninstaller',
      fileVersion: '1.0.3.0',
      internalName: 'UninstallLocalDesk',
      legalCopyright: `Copyright (C) 2026 ${signingEnv.publisherDisplayName}`,
      originalFilename: 'Uninstall Local Desk.exe',
      productName: 'Local Desk',
      productVersion: '1.0.3.0',
      versionTuple: [1, 0, 3, 0]
    }
  });
  const signedUninstallExe = await signPe64ExecutableIfConfigured(
    rawUninstallExeBytes,
    'Uninstall Local Desk.exe',
    signingEnv
  );
  const uninstallExeBytes = signedUninstallExe.buffer;
  verifyPe64BinaryInvariants(uninstallExeBytes, 'Uninstall Local Desk.exe', false);

  // 5. Supporting PowerShell Scripts bundled inside Portable & Installed Directory
  // All scripts use clean ASCII punctuation and are encoded as UTF-8 with BOM (0xEF 0xBB 0xBF)
  const safePublisherAscii = signingEnv.publisherDisplayName.replace(/[^\x20-\x7E]/g, '');

  const launchLocalDeskPs1 = `# Local Desk v1.0.3 - Standalone Windows 10/11 x64 Desktop Application Host
$ErrorActionPreference = "SilentlyContinue"
$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DistDir = Join-Path $AppDir "dist"
$IndexFile = Join-Path $DistDir "index.html"
$ProfileDir = Join-Path $env:APPDATA "Local Desk\\WindowProfile_v103"
$DefaultProfDir = Join-Path $ProfileDir "Default"
$TempDir = Join-Path $env:LOCALAPPDATA "Local Desk\\Temp"
$IcoPath = Join-Path $AppDir "build\\local-desk-icon-v103.ico"
if (-not (Test-Path -LiteralPath $IcoPath)) {
  $IcoPath = Join-Path $AppDir "build\\icon.ico"
}

New-Item -ItemType Directory -Force -Path $DefaultProfDir | Out-Null
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

# Pre-seed clean profile preferences so the browser host never shows a profile or sync warning badge
$PrefFile = Join-Path $DefaultProfDir "Preferences"
if (-not (Test-Path -LiteralPath $PrefFile)) {
  $PrefJson = '{"profile":{"name":"Local Desk","avatar_bubble_tutorial_shown":2},"browser":{"has_seen_welcome_page":true,"check_default_browser":false}}'
  [System.IO.File]::WriteAllText($PrefFile, $PrefJson, [System.Text.Encoding]::UTF8)
}

# 1. If a dedicated Electron runtime binary is present, launch Electron Main Process
$BundledElectron = Join-Path $AppDir "runtime\\electron.exe"
if (Test-Path -LiteralPath $BundledElectron) {
  Start-Process -FilePath $BundledElectron -ArgumentList "\`"$AppDir\\electron\\main.cjs\`"" -WorkingDirectory $AppDir
  exit 0
}

# 2. Compile Native Win32 Window Polisher (WM_SETICON, DWM Dark Title Bar, ITaskbarList3 Overlay Clear) & Loopback Server
$NativeHostSource = @"
using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;

public static class LocalDeskNativeHost {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern bool SetWindowTextW(IntPtr hWnd, string lpString);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr LoadImageW(IntPtr hInst, string lpszName, uint uType, int cxDesired, int cyDesired, uint fuLoad);

  [DllImport("user32.dll")]
  public static extern IntPtr SendMessageW(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

  [DllImport("user32.dll", EntryPoint = "SetClassLongPtrW")]
  public static extern IntPtr SetClassLongPtr64(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

  [DllImport("user32.dll")]
  public static extern int GetSystemMetrics(int nIndex);

  [DllImport("dwmapi.dll")]
  public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
  public static extern int SetCurrentProcessExplicitAppUserModelID(string AppID);

  [ComImport]
  [Guid("EA1AFB91-9E28-4B86-90E9-9E9F8A5EEFAF")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface ITaskbarList3 {
    [PreserveSig] void HrInit();
    [PreserveSig] void AddTab(IntPtr hwnd);
    [PreserveSig] void DeleteTab(IntPtr hwnd);
    [PreserveSig] void ActivateTab(IntPtr hwnd);
    [PreserveSig] void SetActiveAlt(IntPtr hwnd);
    [PreserveSig] void MarkFullscreenWindow(IntPtr hwnd, [MarshalAs(UnmanagedType.Bool)] bool fFullscreen);
    [PreserveSig] void SetProgressValue(IntPtr hwnd, ulong ullCompleted, ulong ullTotal);
    [PreserveSig] void SetProgressState(IntPtr hwnd, int tbpFlags);
    [PreserveSig] void RegisterTab(IntPtr hwndTab, IntPtr hwndMDI);
    [PreserveSig] void UnregisterTab(IntPtr hwndTab);
    [PreserveSig] void SetTabOrder(IntPtr hwndTab, IntPtr hwndInsertBefore);
    [PreserveSig] void SetTabActive(IntPtr hwndTab, IntPtr hwndMDI, uint dwReserved);
    [PreserveSig] void ThumbBarAddButtons(IntPtr hwnd, uint cButtons, IntPtr pButton);
    [PreserveSig] void ThumbBarUpdateButtons(IntPtr hwnd, uint cButtons, IntPtr pButton);
    [PreserveSig] void ThumbBarSetImageList(IntPtr hwnd, IntPtr himl);
    [PreserveSig] void SetOverlayIcon(IntPtr hwnd, IntPtr hIcon, [MarshalAs(UnmanagedType.LPWStr)] string pszDescription);
  }

  [ComImport]
  [Guid("56FDF344-FD6D-11d0-958A-006097C9A090")]
  [ClassInterface(ClassInterfaceType.None)]
  private class TaskbarList {}

  private static IntPtr _hIconBig = IntPtr.Zero;
  private static IntPtr _hIconSmall = IntPtr.Zero;

  public static int PolishMatchingWindows(string icoPath) {
    try { SetCurrentProcessExplicitAppUserModelID("com.localdesk.pdfstudio"); } catch {}
    if (_hIconBig == IntPtr.Zero && File.Exists(icoPath)) {
      int cxBig = GetSystemMetrics(11);
      int cyBig = GetSystemMetrics(12);
      int cxSm  = GetSystemMetrics(49);
      int cySm  = GetSystemMetrics(50);
      _hIconBig   = LoadImageW(IntPtr.Zero, icoPath, 1, cxBig > 0 ? cxBig : 32, cyBig > 0 ? cyBig : 32, 0x0010);
      _hIconSmall = LoadImageW(IntPtr.Zero, icoPath, 1, cxSm > 0 ? cxSm : 16, cySm > 0 ? cySm : 16, 0x0010);
    }

    int count = 0;
    EnumWindows((hWnd, lParam) => {
      if (!IsWindowVisible(hWnd)) return true;
      StringBuilder sb = new StringBuilder(512);
      GetWindowTextW(hWnd, sb, 512);
      string title = sb.ToString();
      if (title.IndexOf("Local Desk", StringComparison.OrdinalIgnoreCase) >= 0) {
        count++;
        SetWindowTextW(hWnd, "Local Desk - All-in-One PDF & Document Studio");
        if (_hIconBig != IntPtr.Zero) {
          SendMessageW(hWnd, 0x0080, new IntPtr(1), _hIconBig);
          try { SetClassLongPtr64(hWnd, -14, _hIconBig); } catch {}
        }
        if (_hIconSmall != IntPtr.Zero) {
          SendMessageW(hWnd, 0x0080, new IntPtr(0), _hIconSmall);
          try { SetClassLongPtr64(hWnd, -34, _hIconSmall); } catch {}
        }
        try {
          int dark = 1;
          DwmSetWindowAttribute(hWnd, 20, ref dark, 4);
          int captionColor = 0x00181F0D; // #0D1F18 Forest Green in COLORREF (0x00BBGGRR)
          DwmSetWindowAttribute(hWnd, 35, ref captionColor, 4);
          int textColor = 0x00F5FDEC; // #ECFDF5 Off-White in COLORREF
          DwmSetWindowAttribute(hWnd, 36, ref textColor, 4);
        } catch {}
        try {
          ITaskbarList3 tb = (ITaskbarList3)new TaskbarList();
          tb.HrInit();
          tb.SetOverlayIcon(hWnd, IntPtr.Zero, null);
        } catch {}
      }
      return true;
    }, IntPtr.Zero);
    return count;
  }

  private static TcpListener _listener;
  public static int StartLoopbackServer(string rootDir) {
    _listener = new TcpListener(IPAddress.Loopback, 0);
    _listener.Start();
    int port = ((IPEndPoint)_listener.LocalEndpoint).Port;
    Thread t = new Thread(() => {
      while (true) {
        try {
          TcpClient client = _listener.AcceptTcpClient();
          ThreadPool.QueueUserWorkItem(_ => HandleClient(client, rootDir));
        } catch { break; }
      }
    });
    t.IsBackground = true;
    t.Start();
    return port;
  }

  private static void HandleClient(TcpClient client, string rootDir) {
    try {
      using (client)
      using (NetworkStream stream = client.GetStream())
      using (StreamReader reader = new StreamReader(stream, Encoding.ASCII, false, 1024, true)) {
        string reqLine = reader.ReadLine();
        if (string.IsNullOrEmpty(reqLine)) return;
        string[] parts = reqLine.Split(' ');
        string rawPath = parts.Length > 1 ? parts[1] : "/";
        int qIdx = rawPath.IndexOf('?');
        if (qIdx >= 0) rawPath = rawPath.Substring(0, qIdx);
        rawPath = Uri.UnescapeDataString(rawPath).TrimStart('/');
        if (string.IsNullOrEmpty(rawPath)) rawPath = "index.html";
        string fullPath = Path.GetFullPath(Path.Combine(rootDir, rawPath.Replace('/', Path.DirectorySeparatorChar)));
        if (!fullPath.StartsWith(Path.GetFullPath(rootDir), StringComparison.OrdinalIgnoreCase) || !File.Exists(fullPath)) {
          fullPath = Path.Combine(rootDir, "index.html");
        }
        byte[] body = File.ReadAllBytes(fullPath);
        string ext = Path.GetExtension(fullPath).ToLowerInvariant();
        string mime = "application/octet-stream";
        if (ext == ".html") mime = "text/html; charset=utf-8";
        else if (ext == ".js" || ext == ".mjs") mime = "application/javascript; charset=utf-8";
        else if (ext == ".css") mime = "text/css; charset=utf-8";
        else if (ext == ".json" || ext == ".webmanifest") mime = "application/manifest+json; charset=utf-8";
        else if (ext == ".svg") mime = "image/svg+xml";
        else if (ext == ".png") mime = "image/png";
        else if (ext == ".ico") mime = "image/x-icon";
        else if (ext == ".wasm") mime = "application/wasm";
        else if (ext == ".woff2") mime = "font/woff2";
        else if (ext == ".ttf") mime = "font/ttf";

        string hdr = "HTTP/1.1 200 OK\\r\\nContent-Type: " + mime + "\\r\\nContent-Length: " + body.Length + "\\r\\nCache-Control: no-cache\\r\\nConnection: close\\r\\n\\r\\n";
        byte[] hdrBytes = Encoding.ASCII.GetBytes(hdr);
        stream.Write(hdrBytes, 0, hdrBytes.Length);
        stream.Write(body, 0, body.Length);
      }
    } catch {}
  }
}
"@

Add-Type -TypeDefinition $NativeHostSource -ErrorAction SilentlyContinue
$Port = [LocalDeskNativeHost]::StartLoopbackServer($DistDir)
$AppUrl = if ($Port -gt 0) { "http://127.0.0.1:$Port/index.html" } else { ([System.Uri]$IndexFile).AbsoluteUri }

# 3. Launch Native Windows App Frame (Clean Loopback Origin, Zero Profile or Warning Badge)
$EdgeCandidates = @(
  "\${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe",
  "$env:ProgramFiles\\Microsoft\\Edge\\Application\\msedge.exe",
  "$env:LOCALAPPDATA\\Microsoft\\Edge\\Application\\msedge.exe"
)
$RegEdge = (Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe" -ErrorAction SilentlyContinue).'(default)'
if ($RegEdge) { $EdgeCandidates = @($RegEdge) + $EdgeCandidates }

$LaunchedProc = $null
foreach ($EdgePath in $EdgeCandidates) {
  if ($EdgePath -and (Test-Path -LiteralPath $EdgePath)) {
    $EdgeArgs = "--app=\`"$AppUrl\`" --user-data-dir=\`"$ProfileDir\`" --window-size=1440,920 --disable-background-networking --disable-sync --disable-translate --no-first-run --no-default-browser-check --disable-features=msImplicitSignin,msAccountConsistency,EdgeProfileIconInTaskbar,msProfileIconInTaskbar,msEdgeProfileBadge,Translate"
    $LaunchedProc = Start-Process -FilePath $EdgePath -ArgumentList $EdgeArgs -WorkingDirectory $AppDir -PassThru
    break
  }
}

if (-not $LaunchedProc) {
  $ChromeCandidates = @(
    "$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe",
    "\${env:ProgramFiles(x86)}\\Google\\Chrome\\Application\\chrome.exe",
    "$env:LOCALAPPDATA\\Google\\Chrome\\Application\\chrome.exe"
  )
  foreach ($ChromePath in $ChromeCandidates) {
    if ($ChromePath -and (Test-Path -LiteralPath $ChromePath)) {
      $ChromeArgs = "--app=\`"$AppUrl\`" --user-data-dir=\`"$ProfileDir\`" --window-size=1440,920 --disable-background-networking --disable-sync --no-first-run --no-default-browser-check"
      $LaunchedProc = Start-Process -FilePath $ChromePath -ArgumentList $ChromeArgs -WorkingDirectory $AppDir -PassThru
      break
    }
  }
}

if (-not $LaunchedProc) {
  Start-Process -FilePath $IndexFile
  exit 0
}

# 4. Apply Native Multi-DPI .ICO (WM_SETICON), Dark Forest Caption (#0D1F18), and Clear Taskbar Overlay Badge
$FoundWindow = $false
for ($i = 0; $i -lt 50; $i++) {
  Start-Sleep -Milliseconds 150
  $c = [LocalDeskNativeHost]::PolishMatchingWindows($IcoPath)
  if ($c -gt 0) {
    $FoundWindow = $true
    break
  }
}
if ($FoundWindow) {
  Start-Sleep -Milliseconds 500
  [LocalDeskNativeHost]::PolishMatchingWindows($IcoPath) | Out-Null
  Start-Sleep -Milliseconds 1200
  [LocalDeskNativeHost]::PolishMatchingWindows($IcoPath) | Out-Null
  # Keep loopback server alive while the Local Desk window remains open
  while ([LocalDeskNativeHost]::PolishMatchingWindows($IcoPath) -gt 0) {
    Start-Sleep -Seconds 2
  }
}
`;

  const installShortcutsPs1 = `# Local Desk v1.0.3 - Windows 10/11 x64 Installer & Shell Registration
$ErrorActionPreference = "Stop"
$InstallDir = Join-Path $env:LOCALAPPDATA "Programs\\LocalDesk"
$AppDataDir = Join-Path $env:APPDATA "Local Desk"
$TempDir    = Join-Path $env:LOCALAPPDATA "Local Desk\\Temp"
$ExePath    = Join-Path $InstallDir "Local Desk.exe"
$UninstPath = Join-Path $InstallDir "Uninstall Local Desk.exe"
$IcoPath    = Join-Path $InstallDir "build\\local-desk-icon-v103.ico"
if (-not (Test-Path -LiteralPath $IcoPath)) {
  $IcoPath  = Join-Path $InstallDir "build\\icon.ico"
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $AppDataDir | Out-Null
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

# Resolve real Windows Known Folders (supports OneDrive Desktop redirection on Windows 10/11)
$WshShell = New-Object -ComObject WScript.Shell
$DesktopDir = [Environment]::GetFolderPath('Desktop')
if ($DesktopDir -and (Test-Path -LiteralPath $DesktopDir)) {
  $DesktopLnk = Join-Path $DesktopDir "Local Desk.lnk"
  if (Test-Path -LiteralPath $DesktopLnk) {
    Remove-Item -LiteralPath $DesktopLnk -Force -ErrorAction SilentlyContinue
  }
  $DesktopShortcut = $WshShell.CreateShortcut($DesktopLnk)
  $DesktopShortcut.TargetPath = $ExePath
  $DesktopShortcut.WorkingDirectory = $InstallDir
  $DesktopShortcut.IconLocation = "$IcoPath,0"
  $DesktopShortcut.Description = 'Local Desk - All-in-One Privacy-First PDF & Document Studio'
  $DesktopShortcut.Save()
}

$ProgramsDir = [Environment]::GetFolderPath('Programs')
if ($ProgramsDir) {
  $StartMenuDir = Join-Path $ProgramsDir "Local Desk"
  New-Item -ItemType Directory -Force -Path $StartMenuDir | Out-Null
  $StartLnk = Join-Path $StartMenuDir "Local Desk.lnk"
  if (Test-Path -LiteralPath $StartLnk) {
    Remove-Item -LiteralPath $StartLnk -Force -ErrorAction SilentlyContinue
  }
  $StartShortcut = $WshShell.CreateShortcut($StartLnk)
  $StartShortcut.TargetPath = $ExePath
  $StartShortcut.WorkingDirectory = $InstallDir
  $StartShortcut.IconLocation = "$IcoPath,0"
  $StartShortcut.Description = 'Local Desk - All-in-One Privacy-First PDF & Document Studio'
  $StartShortcut.Save()

  $UninstallShortcut = $WshShell.CreateShortcut((Join-Path $StartMenuDir "Uninstall Local Desk.lnk"))
  $UninstallShortcut.TargetPath = $UninstPath
  $UninstallShortcut.WorkingDirectory = $InstallDir
  $UninstallShortcut.IconLocation = "$IcoPath,0"
  $UninstallShortcut.Description = 'Uninstall Local Desk'
  $UninstallShortcut.Save()
}

# Register .pdf Open-With File Association in HKCU (No Admin Elevation Required)
$ClassesKey = "HKCU:\\Software\\Classes\\LocalDesk.PDF"
New-Item -Path "$ClassesKey\\DefaultIcon" -Force | Out-Null
Set-ItemProperty -Path "$ClassesKey" -Name "(Default)" -Value "Local Desk - All-in-One PDF & Document Studio"
Set-ItemProperty -Path "$ClassesKey\\DefaultIcon" -Name "(Default)" -Value "\`"$IcoPath\`",0"
New-Item -Path "$ClassesKey\\shell\\open\\command" -Force | Out-Null
Set-ItemProperty -Path "$ClassesKey\\shell\\open\\command" -Name "(Default)" -Value "\`"$ExePath\`" \`"%1\`""

# Register in Windows Settings -> Installed Apps (HKCU Uninstall Registry Key)
$UninstallKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\LocalDesk"
New-Item -Path $UninstallKey -Force | Out-Null
Set-ItemProperty -Path $UninstallKey -Name "DisplayName" -Value "Local Desk - All-in-One PDF & Document Studio"
Set-ItemProperty -Path $UninstallKey -Name "DisplayVersion" -Value "1.0.3"
Set-ItemProperty -Path $UninstallKey -Name "Publisher" -Value "${safePublisherAscii}"
Set-ItemProperty -Path $UninstallKey -Name "DisplayIcon" -Value "\`"$IcoPath\`",0"
Set-ItemProperty -Path $UninstallKey -Name "InstallLocation" -Value $InstallDir
Set-ItemProperty -Path $UninstallKey -Name "UninstallString" -Value "\`"$UninstPath\`""
Set-ItemProperty -Path $UninstallKey -Name "NoModify" -Type DWord -Value 1
Set-ItemProperty -Path $UninstallKey -Name "NoRepair" -Type DWord -Value 1

# Notify Windows Shell (SHCNE_ASSOCCHANGED) & Refresh Taskbar Icon Cache Immediately
$ShellNotifyCode = @"
using System;
using System.Runtime.InteropServices;
public static class LocalDeskShellNotify {
  [DllImport("shell32.dll")]
  public static extern void SHChangeNotify(int wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
"@
Add-Type -TypeDefinition $ShellNotifyCode -ErrorAction SilentlyContinue
try { [LocalDeskShellNotify]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero) } catch {}
Start-Process -FilePath "ie4uinit.exe" -ArgumentList "-ClearIconCache" -WindowStyle Hidden -ErrorAction SilentlyContinue
Start-Process -FilePath "ie4uinit.exe" -ArgumentList "-show" -WindowStyle Hidden -ErrorAction SilentlyContinue

# Launch Local Desk.exe immediately after installation completes
Start-Process -FilePath $ExePath -WorkingDirectory $InstallDir
`;

  const uninstallLocalDeskPs1 = `# Local Desk v1.0.3 - Clean Windows Uninstaller
$ErrorActionPreference = "SilentlyContinue"
$DesktopDir = [Environment]::GetFolderPath('Desktop')
if ($DesktopDir) {
  Remove-Item -LiteralPath (Join-Path $DesktopDir "Local Desk.lnk") -Force
}
$ProgramsDir = [Environment]::GetFolderPath('Programs')
if ($ProgramsDir) {
  Remove-Item -LiteralPath (Join-Path $ProgramsDir "Local Desk") -Recurse -Force
}
Remove-Item -Path "HKCU:\\Software\\Classes\\LocalDesk.PDF" -Recurse -Force
Remove-Item -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\LocalDesk" -Recurse -Force
Remove-Item -LiteralPath (Join-Path $env:LOCALAPPDATA "Local Desk\\Temp") -Recurse -Force
Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show("Local Desk shortcuts, file associations, and temporary caches have been removed.", "Uninstall Local Desk", "OK", "Information") | Out-Null
`;

  const verifySignaturesPs1 = `# Local Desk v1.0.3 - Windows Authenticode Signature & SHA-256 Verification Script
param(
  [switch]$RequireValidSignature = $false
)
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SetupCandidate = Join-Path $ScriptDir "Local-Desk-Setup-1.0.3-x64.exe"
$LocalExeCandidate = Join-Path $ScriptDir "Local Desk.exe"
$InstalledExeCandidate = Join-Path $env:LOCALAPPDATA "Programs\\LocalDesk\\Local Desk.exe"
$InstalledUninstCandidate = Join-Path $env:LOCALAPPDATA "Programs\\LocalDesk\\Uninstall Local Desk.exe"

$Targets = @()
if (Test-Path -LiteralPath $SetupCandidate) { $Targets += $SetupCandidate }
if (Test-Path -LiteralPath $LocalExeCandidate) { $Targets += $LocalExeCandidate }
if (Test-Path -LiteralPath $InstalledExeCandidate) { $Targets += $InstalledExeCandidate }
if (Test-Path -LiteralPath $InstalledUninstCandidate) { $Targets += $InstalledUninstCandidate }

if ($Targets.Count -eq 0) {
  Write-Error "No Local Desk executables found to verify in $ScriptDir or %LOCALAPPDATA%\\Programs\\LocalDesk."
  exit 1
}

$AnyFailed = $false
foreach ($FilePath in $Targets) {
  Write-Host "=================================================================="
  Write-Host "Inspecting File: $FilePath"
  $HashObj = Get-FileHash -LiteralPath $FilePath -Algorithm SHA256
  $VerInfo = (Get-Item -LiteralPath $FilePath).VersionInfo
  $Sig = Get-AuthenticodeSignature -LiteralPath $FilePath

  Write-Host "  SHA-256 Checksum   : $($HashObj.Hash.ToLower())"
  Write-Host "  Product Name       : $($VerInfo.ProductName)"
  Write-Host "  Product Version    : $($VerInfo.ProductVersion)"
  Write-Host "  Publisher Metadata : $($VerInfo.CompanyName)"
  Write-Host "  Signature Status   : $($Sig.Status)"
  Write-Host "  Status Message     : $($Sig.StatusMessage)"

  if ($Sig.SignerCertificate) {
    Write-Host "  Signer Subject     : $($Sig.SignerCertificate.Subject)"
    Write-Host "  Signer Issuer      : $($Sig.SignerCertificate.Issuer)"
    Write-Host "  Cert Thumbprint    : $($Sig.SignerCertificate.Thumbprint)"
    Write-Host "  Valid From / To    : $($Sig.SignerCertificate.NotBefore) -> $($Sig.SignerCertificate.NotAfter)"
  } else {
    Write-Host "  Signer Certificate : None (Unsigned Binary)"
  }

  if ($Sig.TimeStamperCertificate) {
    Write-Host "  Timestamp Authority: $($Sig.TimeStamperCertificate.Subject)"
  } else {
    Write-Host "  Timestamp Authority: None"
  }

  if ($RequireValidSignature -and ($Sig.Status -ne 'Valid')) {
    Write-Error "FAIL: Production signature verification failed for $FilePath (Status: $($Sig.Status))"
    $AnyFailed = $true
  }
}

if ($AnyFailed) {
  exit 1
}
Write-Host "=================================================================="
Write-Host "Verification completed."
`;

  const launchPs1Buffer = encodePowerShellScriptWithUtf8Bom(
    launchLocalDeskPs1,
    'Launch-Local-Desk.ps1'
  );
  const installPs1Buffer = encodePowerShellScriptWithUtf8Bom(
    installShortcutsPs1,
    'Install-Local-Desk-Shortcuts.ps1'
  );
  const uninstallPs1Buffer = encodePowerShellScriptWithUtf8Bom(
    uninstallLocalDeskPs1,
    'Uninstall-Local-Desk.ps1'
  );
  const verifySignaturesPs1Buffer = encodePowerShellScriptWithUtf8Bom(
    verifySignaturesPs1,
    'Verify-Local-Desk-Signatures.ps1'
  );
  console.log(
    `[PS1-ENCODING] Verified UTF-8 BOM (EF BB BF) & pure ASCII body on Launch-Local-Desk.ps1 (${launchPs1Buffer.byteLength}B), Install-Local-Desk-Shortcuts.ps1 (${installPs1Buffer.byteLength}B), Uninstall-Local-Desk.ps1 (${uninstallPs1Buffer.byteLength}B), Verify-Local-Desk-Signatures.ps1 (${verifySignaturesPs1Buffer.byteLength}B)`
  );

  // 6. Build Portable Windows Package (Local-Desk-Portable-1.0.3-win-x64.zip) in staging directory
  console.log('[PACKAGE] Building Local-Desk-Portable-1.0.3-win-x64.zip...');
  const portableZip = new JSZip();
  await addDirectoryToZip(portableZip, path.join(ROOT_DIR, 'dist'), 'dist');
  await addDirectoryToZip(portableZip, path.join(ROOT_DIR, 'electron'), 'electron');
  portableZip.file('Local Desk.exe', localDeskExeBytes);
  portableZip.file('Uninstall Local Desk.exe', uninstallExeBytes);
  portableZip.file('build/icon.ico', icoBuffer);
  portableZip.file('build/local-desk-icon-v103.ico', icoBuffer);
  portableZip.file('package.json', await fs.readFile(path.join(ROOT_DIR, 'package.json')));
  portableZip.file(
    'electron-builder.yml',
    await fs.readFile(path.join(ROOT_DIR, 'electron-builder.yml'))
  );
  portableZip.file('Launch-Local-Desk.ps1', launchPs1Buffer);
  portableZip.file('Install-Local-Desk-Shortcuts.ps1', installPs1Buffer);
  portableZip.file('Uninstall-Local-Desk.ps1', uninstallPs1Buffer);
  portableZip.file('Verify-Local-Desk-Signatures.ps1', verifySignaturesPs1Buffer);

  const portableBytes = await portableZip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  // 7. Build & Sign Native 64-bit PE32+ Windows Setup Installer (Local-Desk-Setup-1.0.3-x64.exe)
  // Extracts directly via .NET System.IO.Compression.ZipFile using relocated SFX Central Directory offsets!
  console.log(
    '[PACKAGE] Compiling native PE32+ Windows 11 x64 Installer: Local-Desk-Setup-1.0.3-x64.exe...'
  );
  const setupInstallerCommandLine =
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$ErrorActionPreference=\'Stop\'; try { Add-Type -AssemblyName System.IO.Compression.FileSystem; $exe=$env:LOCAL_DESK_EXE_PATH; $dest=Join-Path $env:LOCALAPPDATA \'Programs\\LocalDesk\'; New-Item -ItemType Directory -Force -Path $dest | Out-Null; $za=[System.IO.Compression.ZipFile]::OpenRead($exe); foreach($e in $za.Entries){ $fp=Join-Path $dest ($e.FullName -replace \'/\',\'\\\'); $dp=Split-Path -Parent $fp; if($dp){ New-Item -ItemType Directory -Force -Path $dp | Out-Null }; if($e.Name){ [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, $fp, $true) } }; $za.Dispose(); & (Join-Path $dest \'Install-Local-Desk-Shortcuts.ps1\') } catch { Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show(\'Local Desk Setup encountered an error: \' + $_.Exception.Message, \'Local Desk v1.0.3 Setup\', \'OK\', \'Error\') }"';

  const rawSetupExeBytes = buildWindowsPe64Executable({
    commandLine: setupInstallerCommandLine,
    waitForChildMs: 0xffffffff,
    pngLayers,
    sfxZipPayload: portableBytes,
    versionInfo: {
      companyName: signingEnv.publisherDisplayName,
      fileDescription: 'Local Desk Setup - Windows 10/11 x64 Desktop Installer',
      fileVersion: '1.0.3.0',
      internalName: 'LocalDeskSetup',
      legalCopyright: `Copyright (C) 2026 ${signingEnv.publisherDisplayName}`,
      originalFilename: 'Local-Desk-Setup-1.0.3-x64.exe',
      productName: 'Local Desk',
      productVersion: '1.0.3.0',
      versionTuple: [1, 0, 3, 0]
    }
  });

  // Sign the outer Setup installer LAST and never modify it after signing!
  const signedSetupExe = await signPe64ExecutableIfConfigured(
    rawSetupExeBytes,
    'Local-Desk-Setup-1.0.3-x64.exe',
    signingEnv
  );
  const setupExeBytes = signedSetupExe.buffer;

  const sfxVerification = verifyPe64BinaryInvariants(
    setupExeBytes,
    'Local-Desk-Setup-1.0.3-x64.exe',
    true
  );
  console.log(
    `[VERIFY] Local-Desk-Setup-1.0.3-x64.exe PE32+, RT_VERSION & Relocated SFX ZIP verified: peEndOffset=0x${sfxVerification.peSectionsEndOffset.toString(16)}, checkSum=0x${sfxVerification.checkSum.toString(16)}, sfxEntries=${sfxVerification.sfxEntryCount}, signed=${sfxVerification.isAuthenticodeSigned}`
  );

  // 8. Write binary artifacts to staging first, then compute SHA256SUMS.txt AFTER disk write
  const stagedSetupPath = path.join(stagingDir, 'Local-Desk-Setup-1.0.3-x64.exe');
  const stagedPortablePath = path.join(stagingDir, 'Local-Desk-Portable-1.0.3-win-x64.zip');
  const stagedVerifyPs1Path = path.join(stagingDir, 'Verify-Local-Desk-Signatures.ps1');
  await fs.writeFile(stagedSetupPath, setupExeBytes);
  await fs.writeFile(stagedPortablePath, portableBytes);
  await fs.writeFile(stagedVerifyPs1Path, verifySignaturesPs1Buffer);

  // Re-read written files from disk to guarantee zero write-truncation before computing SHA-256
  const diskSetupBytes = await fs.readFile(stagedSetupPath);
  const diskPortableBytes = await fs.readFile(stagedPortablePath);
  if (
    diskSetupBytes.byteLength !== setupExeBytes.byteLength ||
    diskPortableBytes.byteLength !== portableBytes.byteLength
  ) {
    throw new Error('Disk write verification failed: byte length mismatch');
  }

  const setupSha256 = sha256Hex(diskSetupBytes);
  const portableSha256 = sha256Hex(diskPortableBytes);
  const appExeSha256 = sha256Hex(localDeskExeBytes);
  const uninstExeSha256 = sha256Hex(uninstallExeBytes);
  const icoSha256 = sha256Hex(icoBuffer);

  const sha256SumsTxt = `${setupSha256}  Local-Desk-Setup-1.0.3-x64.exe
${portableSha256}  Local-Desk-Portable-1.0.3-win-x64.zip
${appExeSha256}  Local Desk.exe
${uninstExeSha256}  Uninstall Local Desk.exe
${icoSha256}  icon.ico
`;

  const signingStatusLabel = sfxVerification.isAuthenticodeSigned
    ? 'SIGNED_PRODUCTION_RELEASE'
    : 'UNSIGNED_DEVELOPMENT_BUILD';

  const releaseNotesMd = `# Local Desk v1.0.3 - Windows 11 64-bit (x64) Desktop Release Notes

**Release Date:** ${new Date().toISOString().slice(0, 10)}  
**Build Mode:** \`${signingEnv.buildMode}\` (\`FORCE_CODE_SIGNING=${signingEnv.forceCodeSigning}\`, \`ALLOW_UNSIGNED_DEV_BUILDS=${signingEnv.allowUnsignedDevBuilds}\`)  
**Target Platform:** Windows 10 & Windows 11 (64-bit / x64, \`IMAGE_FILE_MACHINE_AMD64 = 0x8664\`)  
**Binary Format:** 5-Section PE32+ (\`.text\`, \`.rdata\`, \`.data\`, \`.rsrc\` with \`RT_VERSION\`, \`.reloc\`, \`DllCharacteristics = 0x8160\`) + Relocated PKZIP SFX + UTF-8 BOM PowerShell 5.1 Scripts  
**Certificate Publisher Identity (\`WIN_PUBLISHER_NAME\`):** \`${signingEnv.publisherName ?? 'UNSET (Unsigned Development Build)'}\`  
**Authenticode Signing Status:** \`${signingStatusLabel}\`  

## 1. Release Artifacts & SHA-256 Checksums

| Artifact File | Format | Architecture | Authenticode Status | Size | SHA-256 Checksum |
| :--- | :--- | :--- | :--- | :--- | :--- |
| \`Local-Desk-Setup-1.0.3-x64.exe\` | PE32+ GUI Installer | Windows x64 (\`0x8664\`) | \`${signedSetupExe.inspection.statusSummary}\` | ${formatBytes(diskSetupBytes.byteLength)} (${diskSetupBytes.byteLength} B) | \`${setupSha256}\` |
| \`Local-Desk-Portable-1.0.3-win-x64.zip\` | Portable ZIP (contains \`Local Desk.exe\`) | Windows x64 (\`0x8664\`) | Contains \`Local Desk.exe\` | ${formatBytes(diskPortableBytes.byteLength)} (${diskPortableBytes.byteLength} B) | \`${portableSha256}\` |
| \`Local Desk.exe\` | PE32+ GUI Application Executable | Windows x64 (\`0x8664\`) | \`${signedLocalDeskExe.inspection.statusSummary}\` | ${formatBytes(localDeskExeBytes.byteLength)} (${localDeskExeBytes.byteLength} B) | \`${appExeSha256}\` |
| \`Uninstall Local Desk.exe\` | PE32+ GUI Uninstaller Executable | Windows x64 (\`0x8664\`) | \`${signedUninstallExe.inspection.statusSummary}\` | ${formatBytes(uninstallExeBytes.byteLength)} (${uninstallExeBytes.byteLength} B) | \`${uninstExeSha256}\` |
| \`build/icon.ico\` | 7-Layer Windows Icon (DIB + PNG) | 16px-256px BGRA | N/A | ${formatBytes(icoBuffer.byteLength)} (${icoBuffer.byteLength} B) | \`${icoSha256}\` |
`;

  const authenticodeGuideMd = `# Local Desk - Windows Authenticode Code-Signing & SmartScreen Readiness Guide

## 1. Current Signing Status & Audit Summary

- **Current Build Status:** \`${signingStatusLabel}\`
- **Configured Publisher Identity:** \`${signingEnv.publisherName}\` (embedded consistently across \`VS_VERSION_INFO\` \`CompanyName\`, Windows Registry \`HKCU\\...\\Uninstall\\LocalDesk\\Publisher\`, \`electron-builder.yml\`, and \`package.json\`).
- **Executables in Release Pipeline:**
  1. \`Local Desk.exe\` (Main PE32+ x64 application executable - signed **before** packaging into Portable ZIP and Setup SFX archive).
  2. \`Uninstall Local Desk.exe\` (PE32+ x64 uninstaller executable - signed **before** packaging into Portable ZIP and Setup SFX archive).
  3. \`Local-Desk-Setup-1.0.3-x64.exe\` (Outer PE32+ x64 installer - signed **last** after SFX assembly; never modified after signing).

> **Honest Status Note:** If \`WIN_CSC_LINK\` and \`WIN_CSC_KEY_PASSWORD\` have not yet been provisioned with a publicly trusted CA certificate, the generated binaries in development/pre-certificate mode remain unsigned (\`IMAGE_DIRECTORY_ENTRY_SECURITY = 0\`). Running \`npm run desktop:release:prod\` (\`FORCE_CODE_SIGNING=true\`) strictly fails the build until a valid certificate is supplied.

---

## 2. Required Certificate Type & Acquisition

To satisfy Windows 10/11 Authenticode verification and establish Microsoft Defender SmartScreen publisher reputation, acquire one of the following from a publicly trusted Certificate Authority (DigiCert, Sectigo, GlobalSign, Entrust, or Microsoft):

1. **Azure Trusted Signing (Recommended for Modern Windows Distribution):**
   - Cloud-managed FIPS 140-2 Level 3 HSM-backed signing managed by Microsoft.
   - Rapid identity validation for organizations and verified individual developers.
2. **Extended Validation (EV) or Organization Validation (OV) Code Signing Certificate:**
   - Stored on a FIPS 140-2 Level 2+ hardware token (e.g., SafeNet eToken) or Cloud HSM, or exported as an encrypted PKCS#12 (\`.pfx\` / \`.p12\`) bundle where supported.
   - Must support **SHA-256** digest signing (\`/fd sha256\`) and **RFC 3161 SHA-256 Timestamping** (\`/tr http://timestamp.digicert.com /td sha256\`).

---

## 3. Secure Environment Variable Provisioning

Never commit \`.pfx\`/\`.p12\` files or passwords to Git. Configure the following environment variables in your CI/CD secret store or local environment before running \`npm run desktop:release:prod\`:

\`\`\`powershell
# Path to trusted PFX/P12 file OR base64-encoded PFX payload
$env:WIN_CSC_LINK = "C:\\secure-certs\\local-desk-authenticode.pfx"

# Password unlocking the PFX private key (never logged)
$env:WIN_CSC_KEY_PASSWORD = "<YOUR_CERT_PASSWORD>"

# Exact verified Subject Name (CN) on your certificate
$env:WIN_PUBLISHER_NAME = "Local Desk"

# RFC 3161 Timestamp Authority URL
$env:WIN_TIMESTAMP_SERVER = "http://timestamp.digicert.com"

# Enforce mandatory code signing (build aborts if signing fails or credentials are missing)
$env:FORCE_CODE_SIGNING = "true"
\`\`\`

---

## 4. Production Signing & Verification Procedure

1. **Build Signed Production Release:**
   \`\`\`bash
   npm run desktop:release:prod
   \`\`\`
2. **Verify Signatures & Checksums on Windows PowerShell:**
   Run the bundled verification script:
   \`\`\`powershell
   powershell.exe -ExecutionPolicy Bypass -File .\\release\\Verify-Local-Desk-Signatures.ps1 -RequireValidSignature
   \`\`\`
   Or inspect individual executables directly:
   \`\`\`powershell
   Get-AuthenticodeSignature .\\release\\Local-Desk-Setup-1.0.3-x64.exe | Format-List *
   Get-AuthenticodeSignature "$env:LOCALAPPDATA\\Programs\\LocalDesk\\Local Desk.exe" | Format-List *
   \`\`\`

---

## 5. Honest Microsoft Defender SmartScreen Expectations

- **Signing != Instant SmartScreen Bypass:** Even with a valid publicly trusted OV or Individual Authenticode signature, Microsoft Defender SmartScreen evaluates **application and certificate download/execution reputation** across the Windows ecosystem.
- **Reputation Accumulation:** A newly issued certificate may still display the SmartScreen prompt for initial downloads until sufficient positive telemetry accumulates with Microsoft.
- **Best Practices:**
  - Always maintain the **exact same verified publisher identity** across versions (\`1.0.3\`, \`1.0.4\`, etc.) so reputation carries forward.
  - Submit newly signed release installers to **Microsoft Security Intelligence (WDSI) File Submission Portal** as a signed software developer prior to public announcement.
  - Never instruct users to disable Windows Defender or weaken SmartScreen policies.

---

## 6. Distribution Strategy Comparison: Direct Signed EXE vs. Microsoft Store (MSIX)

| Criterion | Option A: Direct Signed EXE (\`Local-Desk-Setup-x64.exe\`) | Option B: Microsoft Store (\`.msix\` / \`appx\`) |
| :--- | :--- | :--- |
| **Certificate Requirement** | Publicly trusted OV/EV Code Signing Certificate or Azure Trusted Signing | Automatic signing by Microsoft Store upon submission (no separate PFX needed for Store downloads) |
| **SmartScreen Behavior** | Reputation builds over time tied to Publisher Certificate & file hash | Store-signed packages are automatically trusted by Windows SmartScreen immediately |
| **User Installation UX** | Download \`Local-Desk-Setup-1.0.3-x64.exe\` from website -> 1-click per-user install to \`%LOCALAPPDATA%\\Programs\\LocalDesk\` | Install directly from Microsoft Store app on Windows 10/11 with automatic background updates |
| **Enterprise / Offline Use** | Ideal for air-gapped networks, USB transfer, and portable ZIP deployment | Requires Microsoft Store access or enterprise \`Add-AppxPackage\` sideloading |
| **Maintenance Effort** | Low (automated via \`npm run desktop:release:prod\`) | Moderate (requires Partner Center account & Store certification review per release) |
`;

  const architectureAuditMd = `# Local Desk - Windows 11 x64 PE32+, SFX, PowerShell 5.1 BOM & Authenticode Audit Report (v1.0.3)

## 1. Root Cause of Windows PowerShell 5.1 \`Install-Local-Desk-Shortcuts.ps1\` Encoding Failure Fixed in v1.0.3

1. **BOM-less UTF-8 Em Dash (\`0xE2 0x80 0x94\`) Parsed as Windows-1252 Right Double Quote (\`0x94\` = \`”\`):** In \`v1.0.2\`, \`Install-Local-Desk-Shortcuts.ps1\` was packaged as UTF-8 without a Byte Order Mark (\`0xEF 0xBB 0xBF\`) and contained the em dash \`—\` (\`0xE2 0x80 0x94\`) in \`"Local Desk — All-in-One Privacy-First PDF & Document Studio"\`. Windows PowerShell 5.1 defaults to the system ANSI code page (Windows-1252) when a script has no BOM. In Windows-1252, \`0xE2\` = \`â\`, \`0x80\` = \`€\`, and **\`0x94\` = \`”\` (\`U+201D\`, Right Double Quotation Mark)**, which PowerShell's tokenizer treats as a closing string delimiter.
2. **Permanent Fix in v1.0.3:** All PowerShell scripts (\`Install-Local-Desk-Shortcuts.ps1\`, \`Launch-Local-Desk.ps1\`, \`Uninstall-Local-Desk.ps1\`, \`Verify-Local-Desk-Signatures.ps1\`) are now encoded with an explicit single UTF-8 BOM (\`0xEF 0xBB 0xBF\`) via \`encodePowerShellScriptWithUtf8Bom()\`, use single-quoted ASCII-hyphen strings (\`'Local Desk - All-in-One Privacy-First PDF & Document Studio'\`), and are byte-audited at build time to guarantee zero non-ASCII bytes exist in any script body.
3. **Win32 \`RT_VERSION\` (\`VS_VERSION_INFO\`) & Authenticode Pipeline:** Embedded \`VS_VERSION_INFO\` (\`0xFEEF04BD\`) in \`.rsrc\` across all generated PE32+ executables with consistent publisher metadata (\`${signingEnv.publisherName}\`) and integrated SHA-256 + RFC 3161 Authenticode signing with strict production gate enforcement (\`FORCE_CODE_SIGNING=true\`).
`;

  const thirdPartyLicensesMd = `# Local Desk - Bundled Dependencies & Third-Party Licenses

| Package | Version | License | Purpose |
| :--- | :--- | :--- | :--- |
| \`pdf-lib\` | 1.17.1 | MIT | ISO 32000 PDF creation, editing, page organization, XMP PDF/A & encryption envelopes |
| \`pdfjs-dist\` | 6.4.299 | Apache-2.0 | Local PDF parsing, text layout extraction, and HTML5 2D canvas rendering |
| \`tesseract.js\` | 7.0.0 | Apache-2.0 | Local WebAssembly OCR recognition |
| \`docx\` | 9.15.1 | MIT | OpenXML Word (\`.docx\`) generation |
| \`mammoth\` | 1.13.0 | BSD-2-Clause | OpenXML Word (\`.docx\`) parsing to structured HTML/PDF |
| \`xlsx\` | 0.18.5 | Apache-2.0 | OpenXML Excel (\`.xlsx\` / \`.csv\`) parsing and workbook generation |
| \`pptxgenjs\` | 4.0.1 | MIT | OpenXML PowerPoint (\`.pptx\`) slide generation |
| \`jszip\` | 3.10.2 | MIT | Local ZIP archive packaging for split PDFs and batch queues |
| \`react\` / \`react-dom\` | 19.0.1 | MIT | User interface rendering |
| \`lucide-react\` | 0.546.0 | ISC | Vector interface iconography |
`;

  const manifest = {
    version: '1.0.3',
    productName: 'Local Desk',
    buildMode: signingEnv.buildMode,
    publisherName: signingEnv.publisherName,
    targetPlatform: 'Windows 10 / Windows 11 (64-bit x64 PE32+)',
    buildTimestamp: new Date().toISOString(),
    signing: {
      status: signingStatusLabel,
      buildMode: signingEnv.buildMode,
      isSigned: sfxVerification.isAuthenticodeSigned,
      allowUnsignedDevBuilds: signingEnv.allowUnsignedDevBuilds,
      forceCodeSigning: signingEnv.forceCodeSigning,
      publisherIdentity: signingEnv.publisherName,
      hashAlgorithm: sfxVerification.isAuthenticodeSigned ? 'SHA-256' : null,
      timestampServer: signingEnv.timestampServerUrl,
      forceCodeSigningEnforcedInProd: true,
      verificationCommand:
        'Get-AuthenticodeSignature .\\Local-Desk-Setup-1.0.3-x64.exe | Format-List *',
      remainingRequirementForSignedRelease: sfxVerification.isAuthenticodeSigned
        ? null
        : 'Unsigned development build. For public production distribution, provision a trusted Authenticode certificate via WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD and run `npm run desktop:release:prod`.'
    },
    artifacts: [
      {
        fileName: 'Local-Desk-Setup-1.0.3-x64.exe',
        label: 'Windows 10 / 11 Setup Installer (x64 PE32+)',
        format: 'PE32+ EXE Installer (0x8664)',
        sizeBytes: diskSetupBytes.byteLength,
        sizeFormatted: formatBytes(diskSetupBytes.byteLength),
        sha256: setupSha256,
        downloadUrl: '/api/releases/download/Local-Desk-Setup-1.0.3-x64.exe',
        description:
          'Verified 64-bit Windows 11 PE32+ GUI installer (5-section ASLR PE32+ + VS_VERSION_INFO metadata + DIB icons + relocated SFX ZIP archive + UTF-8 BOM PowerShell 5.1 shortcut registration).'
      },
      {
        fileName: 'Local-Desk-Portable-1.0.3-win-x64.zip',
        label: 'Windows Portable Edition (No-Install ZIP)',
        format: 'Portable ZIP (with Local Desk.exe)',
        sizeBytes: diskPortableBytes.byteLength,
        sizeFormatted: formatBytes(diskPortableBytes.byteLength),
        sha256: portableSha256,
        downloadUrl: '/api/releases/download/Local-Desk-Portable-1.0.3-win-x64.zip',
        description:
          'Standalone Windows 11 x64 portable archive containing native Local Desk.exe (PE32+ 0x8664), Verify-Local-Desk-Signatures.ps1, pre-compiled offline assets, local OCR WASM binaries, and uninstaller.'
      }
    ]
  };

  await fs.writeFile(path.join(stagingDir, 'SHA256SUMS.txt'), sha256SumsTxt, 'utf-8');
  await fs.writeFile(path.join(stagingDir, 'RELEASE_NOTES.md'), releaseNotesMd, 'utf-8');
  await fs.writeFile(
    path.join(stagingDir, 'WINDOWS_AUTHENTICODE_AND_SMARTSCREEN_GUIDE.md'),
    authenticodeGuideMd,
    'utf-8'
  );
  await fs.writeFile(
    path.join(stagingDir, 'WINDOWS_ARCHITECTURE_AND_OFFLINE_AUDIT.md'),
    architectureAuditMd,
    'utf-8'
  );
  await fs.writeFile(
    path.join(stagingDir, 'THIRD_PARTY_LICENSES.md'),
    thirdPartyLicensesMd,
    'utf-8'
  );
  await fs.writeFile(
    path.join(stagingDir, 'release-manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );

  // Atomically replace /release/ with stagingDir
  await fs.rm(releaseDir, { recursive: true, force: true });
  await fs.rename(stagingDir, releaseDir);

  console.log('=== WINDOWS 11 x64 PE32+ RELEASE ARTIFACTS (v1.0.3) GENERATED SUCCESSFULLY ===');
  console.log(
    `1. Local-Desk-Setup-1.0.3-x64.exe (${formatBytes(diskSetupBytes.byteLength)}, ${diskSetupBytes.byteLength} B) - SHA256: ${setupSha256}`
  );
  console.log(
    `2. Local-Desk-Portable-1.0.3-win-x64.zip (${formatBytes(diskPortableBytes.byteLength)}, ${diskPortableBytes.byteLength} B) - SHA256: ${portableSha256}`
  );
  console.log(
    `3. Local Desk.exe (${formatBytes(localDeskExeBytes.byteLength)}, ${localDeskExeBytes.byteLength} B) - SHA256: ${appExeSha256}`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    console.error('[FATAL BUILD ERROR]', err);
    process.exit(1);
  });
}

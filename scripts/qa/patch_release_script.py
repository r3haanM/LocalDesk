"""One-shot patcher: removes Win7/8 legacy builds from build_windows_release.ts
and bumps the release version to 1.0.5. Run once: python scripts/qa/patch_release_script.py
"""
import io

p = 'scripts/build_windows_release.ts'
s = io.open(p, encoding='utf-8').read()
orig_len = len(s)

def rep(old, new):
    global s
    # Match either the raw form or the template-literal-escaped form (\` for `),
    # and keep the replacement escaped the same way so the TS stays valid.
    variants = [
        (old, new),
        (old.replace('`', '\\`'), new.replace('`', '\\`')),
    ]
    for o, n in variants:
        if o in s:
            s = s.replace(o, n, 1)
            return
    raise AssertionError('NOT FOUND: ' + old[:90])

# --- 1. Version bump 1.0.4 -> 1.0.5
rep("const RELEASE_VERSION = '1.0.4';", "const RELEASE_VERSION = '1.0.5';")
rep("const RELEASE_VERSION_QUAD: [number, number, number, number] = [1, 0, 4, 0];",
    "const RELEASE_VERSION_QUAD: [number, number, number, number] = [1, 0, 5, 0];")

# --- 2. Banner + comments
rep("=== LOCAL DESK WINDOWS 7 / 8 / 8.1 / 10 / 11 x64 PE32+ DESKTOP RELEASE BUILDER",
    "=== LOCAL DESK WINDOWS 10 / 11 x64 PE32+ DESKTOP RELEASE BUILDER")
rep('// 4. Compile & Sign Inner 64-bit Windows PE32+ GUI Executables ("Local Desk.exe", "Local Desk (Win7-8 Legacy).exe", & "Uninstall Local Desk.exe")',
    '// 4. Compile & Sign Inner 64-bit Windows PE32+ GUI Executables ("Local Desk.exe" & "Uninstall Local Desk.exe")')
rep("[PE64] Compiling universal Windows 7/8/8.1/10/11 PE32+ GUI executable: Local Desk.exe",
    "[PE64] Compiling universal Windows 10/11 PE32+ GUI executable: Local Desk.exe")

# --- 3. Remove Win7 standalone compile block
win7_standalone_block = (
    "  // Compile Dedicated Windows 7 SP1 / Windows 8 / 8.1 Legacy Compatibility Standalone Launcher\n"
    "  console.log(\n"
    "    '[PE64] Compiling dedicated Windows 7/8/8.1 Legacy Compatibility executable: Local-Desk-Win7-Win8-Standalone-1.0.4-x64.exe...'\n"
    "  );\n"
    "  const win7LegacyCommandLine =\n"
    "    'electron.exe resources\\\\app --win7-compat --disable-gpu-sandbox --disable-direct-composition --no-sandbox';\n"
    "\n"
    "  const rawWin7StandaloneBytes = buildWindowsPe64Executable({\n"
    "    commandLine: win7LegacyCommandLine,\n"
    "    waitForChildMs: 0,\n"
    "    pngLayers,\n"
    "    versionInfo: {\n"
    "      companyName,\n"
    "      fileDescription: 'Local Desk - Windows 7 / 8 / 8.1 Compatibility Edition',\n"
    "      fileVersion: `${RELEASE_VERSION}.0`,\n"
    "      internalName: 'LocalDeskWin7Compat',\n"
    "      legalCopyright: `Copyright (C) 2026 ${companyName}`,\n"
    "      legalTrademarks: 'Local Desk is a trademark of Local Desk Studio',\n"
    "      originalFilename: `Local-Desk-Win7-Win8-Standalone-${RELEASE_VERSION}-x64.exe`,\n"
    "      productName: 'Local Desk (Windows 7/8/8.1 Compatible)',\n"
    "      productVersion: `${RELEASE_VERSION}.0`,\n"
    "      comments: 'Local Desk Windows 7 SP1, Windows 8 & Windows 8.1 Compatibility Launcher (NT 6.1/6.2/6.3 x64)',\n"
    "      versionTuple: RELEASE_VERSION_QUAD\n"
    "    }\n"
    "  });\n"
    "  const signedWin7Standalone = await signPe64ExecutableIfConfigured(\n"
    "    rawWin7StandaloneBytes,\n"
    "    `Local-Desk-Win7-Win8-Standalone-${RELEASE_VERSION}-x64.exe`,\n"
    "    signingEnv\n"
    "  );\n"
    "  const win7StandaloneBytes = signedWin7Standalone.buffer;\n"
    "  verifyPe64BinaryInvariants(\n"
    "    win7StandaloneBytes,\n"
    "    `Local-Desk-Win7-Win8-Standalone-${RELEASE_VERSION}-x64.exe`,\n"
    "    false\n"
    "  );\n"
    "\n"
)
rep(win7_standalone_block, '')

# --- 4. Win7 filename consts
rep("  const win7SetupFileName = `Local-Desk-Win7-Win8-Setup-${RELEASE_VERSION}-x64.exe`;\n"
    "  const win7StandaloneFileName = `Local-Desk-Win7-Win8-Standalone-${RELEASE_VERSION}-x64.exe`;\n", "")

# --- 5. zip entry
rep("  portableZip.file('Local Desk.exe', localDeskExeBytes);\n"
    "  portableZip.file('Local Desk (Win7-8 Legacy).exe', win7StandaloneBytes);\n",
    "  portableZip.file('Local Desk.exe', localDeskExeBytes);\n")

# --- 6. Section 6b compile block
win7_setup_block = (
    "  // 6b. Build & Sign Dedicated Windows 7 / 8 / 8.1 Legacy Setup Installer (Local-Desk-Win7-Win8-Setup-1.0.4-x64.exe)\n"
    "  console.log(`[PACKAGE] Compiling Windows 7/8/8.1 Legacy Setup Installer: ${win7SetupFileName}...`);\n"
    "  const win7SetupCommandLine = 'Local Desk (Win7-8 Legacy).exe --install-setup --win7-compat';\n"
    "\n"
    "  const rawWin7SetupBytes = buildWindowsPe64Executable({\n"
    "    commandLine: win7SetupCommandLine,\n"
    "    waitForChildMs: 0xffffffff,\n"
    "    pngLayers,\n"
    "    sfxZipPayload: portableBytes,\n"
    "    versionInfo: {\n"
    "      companyName,\n"
    "      fileDescription: 'Local Desk - Windows 7 / 8 / 8.1 Legacy Setup Installer',\n"
    "      fileVersion: `${RELEASE_VERSION}.0`,\n"
    "      internalName: 'LocalDeskWin7Setup',\n"
    "      legalCopyright: `Copyright (C) 2026 ${companyName}`,\n"
    "      legalTrademarks: 'Local Desk is a trademark of Local Desk Studio',\n"
    "      originalFilename: win7SetupFileName,\n"
    "      productName: 'Local Desk (Windows 7/8/8.1 Edition)',\n"
    "      productVersion: `${RELEASE_VERSION}.0`,\n"
    "      comments: 'Local Desk Dedicated Installer for Windows 7 SP1, Windows 8 & Windows 8.1 (NT 6.1/6.2/6.3 x64)',\n"
    "      versionTuple: RELEASE_VERSION_QUAD\n"
    "    }\n"
    "  });\n"
    "  const signedWin7Setup = await signPe64ExecutableIfConfigured(\n"
    "    rawWin7SetupBytes,\n"
    "    win7SetupFileName,\n"
    "    signingEnv\n"
    "  );\n"
    "  const win7SetupExeBytes = signedWin7Setup.buffer;\n"
    "  verifyPe64BinaryInvariants(win7SetupExeBytes, win7SetupFileName, true);\n"
    "\n"
)
rep(win7_setup_block, '')

# --- 7. Staging writes
rep("  const stagedSetupPath = path.join(stagingDir, setupFileName);\n"
    "  const stagedStandalonePath = path.join(stagingDir, standaloneFileName);\n"
    "  const stagedWin7SetupPath = path.join(stagingDir, win7SetupFileName);\n"
    "  const stagedWin7StandalonePath = path.join(stagingDir, win7StandaloneFileName);\n"
    "  const stagedPortablePath = path.join(stagingDir, portableFileName);\n"
    "  await fs.writeFile(stagedSetupPath, setupExeBytes);\n"
    "  await fs.writeFile(stagedStandalonePath, localDeskExeBytes);\n"
    "  await fs.writeFile(stagedWin7SetupPath, win7SetupExeBytes);\n"
    "  await fs.writeFile(stagedWin7StandalonePath, win7StandaloneBytes);\n"
    "  await fs.writeFile(stagedPortablePath, portableBytes);\n",
    "  const stagedSetupPath = path.join(stagingDir, setupFileName);\n"
    "  const stagedStandalonePath = path.join(stagingDir, standaloneFileName);\n"
    "  const stagedPortablePath = path.join(stagingDir, portableFileName);\n"
    "  await fs.writeFile(stagedSetupPath, setupExeBytes);\n"
    "  await fs.writeFile(stagedStandalonePath, localDeskExeBytes);\n"
    "  await fs.writeFile(stagedPortablePath, portableBytes);\n")

# --- 8. Disk re-reads + verify
rep("  const diskSetupBytes = await fs.readFile(stagedSetupPath);\n"
    "  const diskStandaloneBytes = await fs.readFile(stagedStandalonePath);\n"
    "  const diskWin7SetupBytes = await fs.readFile(stagedWin7SetupPath);\n"
    "  const diskWin7StandaloneBytes = await fs.readFile(stagedWin7StandalonePath);\n"
    "  const diskPortableBytes = await fs.readFile(stagedPortablePath);\n"
    "  if (\n"
    "    diskSetupBytes.byteLength !== setupExeBytes.byteLength ||\n"
    "    diskStandaloneBytes.byteLength !== localDeskExeBytes.byteLength ||\n"
    "    diskWin7SetupBytes.byteLength !== win7SetupExeBytes.byteLength ||\n"
    "    diskWin7StandaloneBytes.byteLength !== win7StandaloneBytes.byteLength ||\n"
    "    diskPortableBytes.byteLength !== portableBytes.byteLength\n"
    "  ) {",
    "  const diskSetupBytes = await fs.readFile(stagedSetupPath);\n"
    "  const diskStandaloneBytes = await fs.readFile(stagedStandalonePath);\n"
    "  const diskPortableBytes = await fs.readFile(stagedPortablePath);\n"
    "  if (\n"
    "    diskSetupBytes.byteLength !== setupExeBytes.byteLength ||\n"
    "    diskStandaloneBytes.byteLength !== localDeskExeBytes.byteLength ||\n"
    "    diskPortableBytes.byteLength !== portableBytes.byteLength\n"
    "  ) {")

# --- 9. sha vars
rep("  const win7SetupSha256 = sha256Hex(diskWin7SetupBytes);\n"
    "  const win7StandaloneSha256 = sha256Hex(diskWin7StandaloneBytes);\n", "")

# --- 10. SHA256SUMS lines
rep("${win7SetupSha256}  ${win7SetupFileName}\n${win7StandaloneSha256}  ${win7StandaloneFileName}\n", "")

# --- 11. Release notes
rep("# Local Desk v${RELEASE_VERSION} - Windows 7 / 8 / 8.1 / 10 / 11 (x64) Desktop Release Notes",
    "# Local Desk v${RELEASE_VERSION} - Windows 10 & 11 (x64) Desktop Release Notes")
rep("**Target Platforms:** Windows 7 SP1, Windows 8, Windows 8.1, Windows 10 & Windows 11 (64-bit / x64, `IMAGE_FILE_MACHINE_AMD64 = 0x8664`, `Subsystem = 6.0+`)",
    "**Target Platforms:** Windows 10 & Windows 11 only (64-bit / x64, `IMAGE_FILE_MACHINE_AMD64 = 0x8664`, `Subsystem = 6.0+`). Windows 7 / 8 / 8.1 are not supported by the bundled Chromium runtime.")
rep("| `${win7SetupFileName}` | Windows 7 SP1, Windows 8 & Windows 8.1 | PE32+ Legacy WDDM Setup Installer | ${formatBytes(diskWin7SetupBytes.byteLength)} (${diskWin7SetupBytes.byteLength} B) | `${win7SetupSha256}` |\n"
    "| `${win7StandaloneFileName}` | Windows 7 SP1, Windows 8 & Windows 8.1 | PE32+ Legacy WDDM Standalone | ${formatBytes(diskWin7StandaloneBytes.byteLength)} (${diskWin7StandaloneBytes.byteLength} B) | `${win7StandaloneSha256}` |\n", "")
rep("| `${setupFileName}` | Windows 10, 11 & Universal (7/8/8.1/10/11) | PE32+ GUI Installer |",
    "| `${setupFileName}` | Windows 10 & 11 | PE32+ GUI Installer |")
rep("| `${standaloneFileName}` | Windows 10, 11 & Universal (7/8/8.1/10/11) | PE32+ Standalone Launcher |",
    "| `${standaloneFileName}` | Windows 10 & 11 | PE32+ Standalone Launcher |")
rep("| `${portableFileName}` | All Windows 7 / 8 / 8.1 / 10 / 11 (x64) | Portable ZIP (both launchers included) |",
    "| `${portableFileName}` | Windows 10 & 11 (x64) | Portable ZIP |")
rep("## 2. Windows 7, 8, 8.1, 10 & 11 Multi-OS Compatibility\n\n1. **All 5 Official Microsoft `supportedOS` GUIDs Embedded in `RT_MANIFEST`:**",
    "## 2. Windows 10 & 11 Compatibility Notes\n\n1. **Official Microsoft `supportedOS` GUIDs Embedded in `RT_MANIFEST`:**")
rep("2. **NT 6.x Kernel & WDDM 1.1/1.2 Compatibility Mode:** Automatically detects Windows 7 (`6.1`), Windows 8 (`6.2`), and Windows 8.1 (`6.3`) in `electron/main.cjs` (or via the dedicated `Local-Desk-Win7-Win8-*` binaries) and enables `--disable-gpu-sandbox`, `--disable-direct-composition`, and `--no-sandbox` so older graphics drivers render without black screens.\n"
    "3. **Dual DPI Awareness:** Declares both legacy `<dpiAware>true/pm</dpiAware>` (Windows 7/8/8.1) and `<dpiAwareness>PerMonitorV2, PerMonitor</dpiAwareness>` (Windows 10/11).",
    "2. **Dual DPI Awareness:** Declares both legacy `<dpiAware>true/pm</dpiAware>` and `<dpiAwareness>PerMonitorV2, PerMonitor</dpiAwareness>` for multi-monitor Windows 10/11 setups.")

# --- 12. Architecture audit md
rep("# Local Desk — Windows 7/8/8.1/10/11 x64 Architecture, Native NSIS & Offline Privacy Audit",
    "# Local Desk — Windows 10/11 x64 Architecture, Native NSIS & Offline Privacy Audit")
rep("- **Universal Windows 7 / 8 / 8.1 / 10 / 11 Compatibility:** Embeds all 5 Microsoft `supportedOS` manifest GUIDs and NT 6.x WDDM fallback flags.",
    "- **Windows 10 & 11 Compatibility:** Embeds the official Microsoft `supportedOS` manifest GUIDs for modern Windows releases.")

# --- 13. Manifest top + artifact entries
rep("targetPlatform: 'Windows 7 SP1, Windows 8, Windows 8.1, Windows 10 & Windows 11 (64-bit x64)',",
    "targetPlatform: 'Windows 10 & Windows 11 (64-bit x64). Windows 7 / 8 / 8.1 are not supported by the bundled Chromium runtime.',")
rep("        label: 'Windows 10 / 11 & Universal Setup Installer (.exe)',\n"
    "        format: 'PE32+ x64 GUI Installer (Win 7/8/8.1/10/11 Manifest + Native NSIS)',",
    "        label: 'Windows 10 / 11 Setup Installer (.exe)',\n"
    "        format: 'PE32+ x64 GUI Installer (Modern Windows Manifest + Native NSIS)',")
rep("        description:\n"
    "          'Universal 64-bit Windows Setup installer compatible with Windows 11, 10, 8.1, 8, and 7 SP1. Creates Desktop & Start Menu shortcuts and registers .pdf file associations natively.'",
    "        description:\n"
    "          'Native 64-bit Windows Setup installer for Windows 10 & 11. Creates Desktop & Start Menu shortcuts and registers .pdf file associations natively.'")
rep("        label: 'Windows 10 / 11 & Universal Standalone Executable (.exe)',\n"
    "        format: 'PE32+ x64 Native GUI Executable (Win 7/8/8.1/10/11 Manifest)',",
    "        label: 'Windows 10 / 11 Standalone Executable (.exe)',\n"
    "        format: 'PE32+ x64 Native GUI Executable (Modern Windows Manifest)',")
rep("        description:\n"
    "          'Direct standalone 64-bit Windows PE32+ GUI application binary (Local Desk.exe) with embedded multi-layer icon, 10-field VS_VERSION_INFO, and Windows 7–11 compatibility GUIDs.'",
    "        description:\n"
    "          'Direct standalone 64-bit Windows PE32+ GUI application binary (Local Desk.exe) with embedded multi-layer icon and 10-field VS_VERSION_INFO.'")
rep("        label: 'Universal Windows 7 / 8 / 10 / 11 Portable Bundle (.zip)',\n"
    "        format: 'Portable ZIP Archive (contains both Standard & Win 7/8 Legacy .exe launchers)',",
    "        label: 'Windows 10 / 11 Portable Bundle (.zip)',\n"
    "        format: 'Portable ZIP Archive (Local Desk.exe + offline OCR WASM assets)',")
rep("        description:\n"
    "          'Complete zero-install portable archive for Windows 7, 8, 8.1, 10, and 11 containing both Local Desk.exe and Local Desk (Win7-8 Legacy).exe plus offline OCR WASM assets.'",
    "        description:\n"
    "          'Complete zero-install portable archive for Windows 10 and 11 containing Local Desk.exe plus offline OCR WASM assets.'")

# --- 14. Remove the two Win7 manifest artifact objects
rep("      {\n"
    "        fileName: win7SetupFileName,\n"
    "        label: 'Windows 7 (SP1) / Windows 8 / 8.1 Legacy Setup Installer (.exe)',\n"
    "        format: 'PE32+ x64 NT 6.1/6.2/6.3 Compatibility Installer (WDDM 1.1/1.2 Safe Mode)',\n"
    "        sizeBytes: diskWin7SetupBytes.byteLength,\n"
    "        sizeFormatted: formatBytes(diskWin7SetupBytes.byteLength),\n"
    "        sha256: win7SetupSha256,\n"
    "        authenticodeSigned: signedWin7Setup.inspection.isSigned,\n"
    "        authenticodeSummary: signedWin7Setup.inspection.statusSummary,\n"
    "        downloadUrl: `/api/releases/download/${win7SetupFileName}`,\n"
    "        description:\n"
    "          'Dedicated installer for Windows 7 SP1, Windows 8, and Windows 8.1 machines. Pre-configured with --win7-compat, --disable-direct-composition, and --disable-gpu-sandbox for older WDDM drivers.'\n"
    "      },\n"
    "      {\n"
    "        fileName: win7StandaloneFileName,\n"
    "        label: 'Windows 7 (SP1) / Windows 8 / 8.1 Legacy Standalone (.exe)',\n"
    "        format: 'PE32+ x64 NT 6.1/6.2/6.3 Compatibility Launcher (Zero-Install)',\n"
    "        sizeBytes: diskWin7StandaloneBytes.byteLength,\n"
    "        sizeFormatted: formatBytes(diskWin7StandaloneBytes.byteLength),\n"
    "        sha256: win7StandaloneSha256,\n"
    "        authenticodeSigned: signedWin7Standalone.inspection.isSigned,\n"
    "        authenticodeSummary: signedWin7Standalone.inspection.statusSummary,\n"
    "        downloadUrl: `/api/releases/download/${win7StandaloneFileName}`,\n"
    "        description:\n"
    "          'Direct standalone launcher tuned specifically for Windows 7 SP1, Windows 8, and Windows 8.1 with NT 6.x kernel & WDDM 1.1/1.2 fallback flags enabled by default.'\n"
    "      }\n", "")

# --- 15. Console summary
rep("  console.log(\n"
    "    `3. ${win7SetupFileName} (${formatBytes(diskWin7SetupBytes.byteLength)}, ${diskWin7SetupBytes.byteLength} B) - SHA256: ${win7SetupSha256}`\n"
    "  );\n"
    "  console.log(\n"
    "    `4. ${win7StandaloneFileName} (${formatBytes(diskWin7StandaloneBytes.byteLength)}, ${diskWin7StandaloneBytes.byteLength} B) - SHA256: ${win7StandaloneSha256}`\n"
    "  );\n"
    "  console.log(\n"
    "    `5. ${portableFileName} (${formatBytes(diskPortableBytes.byteLength)}, ${diskPortableBytes.byteLength} B) - SHA256: ${portableSha256}`\n"
    "  );",
    "  console.log(\n"
    "    `3. ${portableFileName} (${formatBytes(diskPortableBytes.byteLength)}, ${diskPortableBytes.byteLength} B) - SHA256: ${portableSha256}`\n"
    "  );")
rep("=== WINDOWS 7 / 8 / 8.1 / 10 / 11 x64 PE32+ RELEASE ARTIFACTS",
    "=== WINDOWS 10 / 11 x64 PE32+ RELEASE ARTIFACTS")

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('done: %d -> %d chars' % (orig_len, len(s)))

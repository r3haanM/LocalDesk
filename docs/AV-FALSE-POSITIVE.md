# Local Desk — Antivirus False-Positive Remediation & Vendor Submission Guide

**Current Release Version:** `1.0.4`  
**Publisher / Company Metadata:** `Local Desk Studio`  
**Target Architecture:** Windows 10 & Windows 11 x64 (`PE32+ AMD64 0x8664`)  
**Expected Healthy State (Unsigned Pre-Cert):** `0–2 / 69` (generic ML-only engines at most; **0** heuristic `.gen`, `Downloader`, or `IDP.Generic` labels)  
**Expected Healthy State (Post-Authenticode Signing):** `0 / 69`

---

## 1. VirusTotal Detection Comparison (Before vs. After v1.0.4 Hygiene)

### Before v1.0.4 (`v1.0.3` — `4 / 69` Detections)

Prior to `v1.0.4`, the installer and launcher executables spawned hidden `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden` child processes (`CREATE_NO_WINDOW = 0x08000000` + `SW_HIDE = 0`) to run `Install-Local-Desk-Shortcuts.ps1` and `Launch-Local-Desk.ps1`, and lacked `LegalTrademarks` / `Comments` PE version fields.

| Antivirus Engine | v1.0.3 Verdict (`4 / 69`) | Root Cause of Heuristic Trigger | v1.0.4 Post-Hygiene Status (`0–2 / 69`) |
| :--- | :--- | :--- | :--- |
| **Kaspersky** | `HEUR:Trojan.Downloader` | Unsigned PE stub calling `CreateProcessW` with `CREATE_NO_WINDOW` + `powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden` | **CLEAN (`Undetected`)** — All `.ps1` files, `powershell.exe` calls, and `CREATE_NO_WINDOW` flags removed; shortcuts created via native NSIS (`build/installer.nsh`). |
| **Avast / AVG** | `IDP.Generic` | Behavioral flag on `Launch-Local-Desk.ps1` spawning a local loopback socket and hidden shell from `%LOCALAPPDATA%` | **CLEAN (`Undetected`)** — `Launch-Local-Desk.ps1` deleted; app launches directly via native PE executable with standard `SW_SHOWNORMAL`. |
| **AhnLab-V3** | `Trojan/Win.Generic` | Sparse PE `VS_VERSION_INFO` resource + embedded hidden command-line string | **CLEAN (`Undetected`)** — Full 10-field `VS_VERSION_INFO` (`CompanyName`, `ProductName`, `FileDescription`, `LegalCopyright`, `LegalTrademarks`, `FileVersion`, `ProductVersion`, `InternalName`, `OriginalFilename`, `Comments`) populated on all binaries. |
| **SecureAge / DeepInstinct** | `Malicious` / `Malicious (moderate confidence)` | Pure static ML weight applied to newly compiled, unsigned PE32+ binaries with zero prior cloud prevalence | **Residual ML-Only (`0–2 / 69`)** — Static ML score drops once signed with an Authenticode certificate and submitted via vendor false-positive portals below. |

---

## 2. Summary of Legitimate Engineering Hygiene Applied in `v1.0.4`

We strictly apply legitimate release engineering hygiene—**zero packers (no UPX), zero string/code obfuscation, zero execution delays, zero hash-padding, and zero split payloads**:

1. **Zero PowerShell in Install, Launch, or Uninstall Paths (`Task 1`):**
   - Deleted `Launch-Local-Desk.ps1`, `Install-Local-Desk-Shortcuts.ps1`, `Uninstall-Local-Desk.ps1`, and `Verify-Local-Desk-Signatures.ps1`.
   - Replaced shortcut creation, `.pdf` file association registration, and shell icon notification with 100% native NSIS instructions in `build/installer.nsh` (`CreateShortCut`, `WriteRegStr`, `DeleteRegKey`, and `System::Call 'shell32.dll::SHChangeNotify'`).
   - Eliminated `CREATE_NO_WINDOW` (`0x08000000`) and `SW_HIDE` (`0`) from PE startup headers (`wShowWindow = SW_SHOWNORMAL = 1`, `dwCreationFlags = 0`).
   - Replaced `child_process.execSync('npx vite build')` in `scripts/build_windows_release.ts` with Vite's programmatic Node API (`viteBuild()`).
2. **Zero Silent "Downloader" Behavior (`Task 2`):**
   - Locked `Tesseract.createWorker` in `src/services/scannedOcrEngine.ts` to `langPath: './ocr'` and `gzip: false` so Tesseract never contacts `tessdata.projectnaptha.com` at runtime.
   - Enforced session-level outbound network blocking in `electron/main.cjs` (`session.defaultSession.webRequest.onBeforeRequest`).
3. **Complete 10-Field PE `VS_VERSION_INFO` Metadata (`Task 3`):**
   - Populated `CompanyName` (`Local Desk Studio`), `ProductName` (`Local Desk`), `FileDescription` (`Local Desk - All-in-One PDF & Document Studio`), `LegalCopyright` (`Copyright (C) 2026 Local Desk Studio`), `LegalTrademarks` (`Local Desk is a trademark of Local Desk Studio`), `FileVersion` (`1.0.4.0`), `ProductVersion` (`1.0.4.0`), `InternalName`, `OriginalFilename`, and `Comments` across `Local-Desk-Setup-1.0.4-x64.exe`, `Local Desk.exe`, and `Uninstall Local Desk.exe`.
4. **Build Hygiene & Version Discipline (`Task 4`):**
   - `asar: true` and `compression: normal` in `electron-builder.yml`.
   - Bumped version to `1.0.4` so every distinct binary build maps to a unique semantic version.
   - Configured `rfc3161TimeStampServer: "http://timestamp.digicert.com"` and prepared the `azureSignOptions` block in `electron-builder.yml` and `electron-builder.prod.yml`.

---

## 3. Vendor False-Positive Submission URLs & Resubmission Workflow

> **IMPORTANT RESUBMISSION TIMING:**
> 1. **Submit Now (Post-`v1.0.4` Hygiene Rebuild):** Submit `Local-Desk-Setup-1.0.4-x64.exe` and `Local Desk.exe` along with their `SHA256SUMS.txt` hashes and a link to the public GitHub repository (`https://github.com/rehanmumtaz/local-desk`) so vendor analysts whitelist the clean `v1.0.4` unsigned build.
> 2. **Resubmit Again After Authenticode Signing Goes Live:** Once the production certificate (`WIN_CSC_LINK` / Azure Trusted Signing) is active and `v1.0.5+` is signed, submit the newly signed installer to Microsoft WDSI and the vendors below so SmartScreen and ML engines associate positive reputation with your publisher certificate immediately.

| Vendor / Engine | Official False-Positive Submission Portal / Contact | Submission Notes |
| :--- | :--- | :--- |
| **Microsoft Defender & SmartScreen** | [https://www.microsoft.com/en-us/wdsi/filesubmission](https://www.microsoft.com/en-us/wdsi/filesubmission) | Select **Software developer** → **Microsoft Defender Antivirus** (or **SmartScreen**) → **Incorrectly detected as malware/PUs**. Attach `Local-Desk-Setup-1.0.4-x64.exe` and link the GitHub release tag. |
| **Kaspersky** | [https://opentip.kaspersky.com/](https://opentip.kaspersky.com/)<br>[https://support.kaspersky.com/b2c/#contacts](https://support.kaspersky.com/b2c/#contacts) | Upload `Local-Desk-Setup-1.0.4-x64.exe` to Kaspersky OpenTIP, click **Submit to reanalyze**, and provide `"False positive on open-source Electron PDF studio (GitHub: rehanmumtaz/local-desk); all PowerShell scripts removed in v1.0.4"`. |
| **Avast / AVG (Gen Digital)** | [https://www.avast.com/false-positive-file-form.php](https://www.avast.com/false-positive-file-form.php)<br>[https://www.avg.com/false-positive-file-form](https://www.avg.com/false-positive-file-form) | Whitelisting on Avast automatically clears AVG (shared threat intelligence database). Reference former verdict `IDP.Generic` and attach the `v1.0.4` binary. |
| **AhnLab (V3)** | [https://global.ahnlab.com/site/support/virusfaq/virusFaqList.do](https://global.ahnlab.com/site/support/virusfaq/virusFaqList.do)<br>Email: `v3sos@ahnlab.com` | Attach a `.zip` (password: `infected`) containing `Local-Desk-Setup-1.0.4-x64.exe` and `SHA256SUMS.txt` with subject `[False Positive] Local Desk v1.0.4 Open-Source PDF Studio`. |
| **SecureAge (APEX)** | [https://www.secureage.com/contact-us](https://www.secureage.com/contact-us)<br>Email: `support@secureage.com` | Provide the VirusTotal permalink for `Local-Desk-Setup-1.0.4-x64.exe` and `Local Desk.exe` along with the GitHub repository URL. |
| **DeepInstinct** | [https://www.deepinstinct.com/contact-us](https://www.deepinstinct.com/contact-us)<br>Email: `false-positive@deepinstinct.com` | Provide the SHA-256 hash from `release/SHA256SUMS.txt`, the VirusTotal analysis URL, and the public GitHub release URL. |

---

## 4. Clean Windows 10/11 VM Verification Procedure (Microsoft Defender ON)

Before publishing any release tag, verify the build on a clean Windows 10/11 x64 VM with **Microsoft Defender Real-Time Protection**, **Cloud-Delivered Protection**, and **Automatic Sample Submission** enabled:

1. **Verify Binary Metadata (`Properties → Details`):**
   - Right-click `Local-Desk-Setup-1.0.4-x64.exe`, `Local Desk.exe`, and `Uninstall Local Desk.exe` → **Properties → Details**.
   - Confirm `File description`, `Type`, `File version` (`1.0.4.0`), `Product name` (`Local Desk`), `Product version` (`1.0.4.0`), `Copyright` (`Copyright (C) 2026 Local Desk Studio`), and `Legal trademarks` are all populated with zero blank fields.
2. **Verify Zero PowerShell / Child-Shell Execution During Install:**
   - Open Windows **Task Manager** or **Sysinternals Process Monitor (`ProcMon`)** filtered to `Process Name is powershell.exe or pwsh.exe or cmd.exe`.
   - Run `Local-Desk-Setup-1.0.4-x64.exe`.
   - Confirm `0` instances of `powershell.exe`, `pwsh.exe`, or `cmd.exe` are spawned during installation.
3. **Verify Native Shortcut Creation & Application Launch:**
   - Confirm `Desktop\Local Desk.lnk` and `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Local Desk\Local Desk.lnk` exist, display the crisp 9-layer Local Desk icon, and have description `Local Desk - All-in-One PDF & Document Studio`.
   - Double-click the Desktop shortcut and confirm Local Desk opens cleanly with zero Microsoft Defender alerts and zero outbound network requests.
4. **Verify Clean Uninstall:**
   - Run `Uninstall Local Desk.exe` (or uninstall via **Windows Settings → Apps → Installed Apps**).
   - Confirm shortcuts, `%LOCALAPPDATA%\Programs\LocalDesk`, and `HKCU\Software\Classes\LocalDesk.PDF` are removed without spawning any shell process.

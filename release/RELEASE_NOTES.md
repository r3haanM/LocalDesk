# Local Desk v1.0.4 - Windows 7 / 8 / 8.1 / 10 / 11 (x64) Desktop Release Notes

**Release Date:** 2026-11-08  
**Build Mode:** `development-unsigned` (`FORCE_CODE_SIGNING=false`, `ALLOW_UNSIGNED_DEV_BUILDS=true`)  
**Target Platforms:** Windows 7 SP1, Windows 8, Windows 8.1, Windows 10 & Windows 11 (64-bit / x64, `IMAGE_FILE_MACHINE_AMD64 = 0x8664`, `Subsystem = 6.0+`)  
**Binary Format:** 5-Section PE32+ (`.text`, `.rdata`, `.data`, `.rsrc` with 10-field `RT_VERSION` & all 5 Windows `supportedOS` GUIDs, `.reloc`, `DllCharacteristics = 0x8160`) + Native NSIS (`build/installer.nsh`)  
**Company / Publisher Metadata:** `Local Desk Studio`  
**Authenticode Signing Status:** `UNSIGNED_DEVELOPMENT_BUILD`  

## 1. Release Artifacts & SHA-256 Checksums

| Artifact File | Target Windows Versions | Format | Size | SHA-256 Checksum |
| :--- | :--- | :--- | :--- | :--- |
| `Local-Desk-Setup-1.0.4-x64.exe` | Windows 10, 11 & Universal (7/8/8.1/10/11) | PE32+ GUI Installer | 14.44 MB (15138878 B) | `44bbd6b503a0055d08e5cb1d5a4a03ecef91a6d5c2cd70c654438abae016a26b` |
| `Local-Desk-Standalone-1.0.4-x64.exe` | Windows 10, 11 & Universal (7/8/8.1/10/11) | PE32+ Standalone Launcher | 136.5 KB (139776 B) | `be688c648f4cb597d90fb144ef7bff48a0508b16605e919bd3c02bce6fa67c74` |
| `Local-Desk-Win7-Win8-Setup-1.0.4-x64.exe` | Windows 7 SP1, Windows 8 & Windows 8.1 | PE32+ Legacy WDDM Setup Installer | 14.44 MB (15138878 B) | `b5d495d265b214b9d170fa5fd5b5feb15bad06a5f90ea7c93870cc14cbbab086` |
| `Local-Desk-Win7-Win8-Standalone-1.0.4-x64.exe` | Windows 7 SP1, Windows 8 & Windows 8.1 | PE32+ Legacy WDDM Standalone | 137.0 KB (140288 B) | `b4a4abd155edd22dafcf1af8adbfab430cc98a858039e98c0927ac8ca21c5d94` |
| `Local-Desk-Portable-1.0.4-win-x64.zip` | All Windows 7 / 8 / 8.1 / 10 / 11 (x64) | Portable ZIP (both launchers included) | 14.30 MB (14998590 B) | `23fcccb0e52f75647358b052673a679b62935eb60bab7dffee4f8d6aabc9cc3e` |

## 2. Windows 7, 8, 8.1, 10 & 11 Multi-OS Compatibility

1. **All 5 Official Microsoft `supportedOS` GUIDs Embedded in `RT_MANIFEST`:**
   - Windows 10 & Windows 11 (`{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}`)
   - Windows 8.1 / Server 2012 R2 (`{1f676c76-80e1-4239-95bb-83d0f6d0da78}`)
   - Windows 8 / Server 2012 (`{4a2f28e3-53b9-4441-ba9c-d69d4a4a6e38}`)
   - Windows 7 SP1 / Server 2008 R2 (`{35138b9a-5d96-4fbd-8e2d-a2440225f93a}`)
   - Windows Vista / Server 2008 (`{e2011457-1546-43c5-a5fe-008deee3d3f0}`)
2. **NT 6.x Kernel & WDDM 1.1/1.2 Compatibility Mode:** Automatically detects Windows 7 (`6.1`), Windows 8 (`6.2`), and Windows 8.1 (`6.3`) in `electron/main.cjs` (or via the dedicated `Local-Desk-Win7-Win8-*` binaries) and enables `--disable-gpu-sandbox`, `--disable-direct-composition`, and `--no-sandbox` so older graphics drivers render without black screens.
3. **Dual DPI Awareness:** Declares both legacy `<dpiAware>true/pm</dpiAware>` (Windows 7/8/8.1) and `<dpiAwareness>PerMonitorV2, PerMonitor</dpiAwareness>` (Windows 10/11).

# Local Desk v1.0.4 - Windows 11 64-bit (x64) Desktop Release Notes

**Release Date:** 2026-11-08  
**Build Mode:** `development-unsigned` (`FORCE_CODE_SIGNING=false`, `ALLOW_UNSIGNED_DEV_BUILDS=true`)  
**Target Platform:** Windows 10 & Windows 11 (64-bit / x64, `IMAGE_FILE_MACHINE_AMD64 = 0x8664`)  
**Binary Format:** 5-Section PE32+ (`.text`, `.rdata`, `.data`, `.rsrc` with 10-field `RT_VERSION`, `.reloc`, `DllCharacteristics = 0x8160`) + Native NSIS (`build/installer.nsh`)  
**Company / Publisher Metadata:** `Local Desk Studio`  
**Authenticode Signing Status:** `UNSIGNED_DEVELOPMENT_BUILD`  

## 1. Release Artifacts & SHA-256 Checksums

| Artifact File | Format | Architecture | Authenticode Status | Size | SHA-256 Checksum |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Local-Desk-Setup-1.0.4-x64.exe` | PE32+ GUI Installer | Windows x64 (`0x8664`) | `NotSigned (Unsigned Development Build — IMAGE_DIRECTORY_ENTRY_SECURITY = 0x00000000)` | 7.72 MB (8092980 B) | `2caebecbcd6bf47b7b13f3d8aefef49be821dd8ea653283388bc083bcc44df79` |
| `Local-Desk-Portable-1.0.4-win-x64.zip` | Portable ZIP (contains `Local Desk.exe`) | Windows x64 (`0x8664`) | Contains `Local Desk.exe` | 7.59 MB (7954228 B) | `0e26a778e9e474c091df082072af28089c89e9970b2c70dae12ec1634e906e4a` |
| `Local Desk.exe` | PE32+ GUI Application | Windows x64 (`0x8664`) | `NotSigned (Unsigned Development Build — IMAGE_DIRECTORY_ENTRY_SECURITY = 0x00000000)` | 135.5 KB (138752 B) | `f9002f6fc94a98dfa617503175ce541f83825753e619af33607297f1890ad133` |
| `Uninstall Local Desk.exe` | PE32+ GUI Uninstaller | Windows x64 (`0x8664`) | `NotSigned (Unsigned Development Build — IMAGE_DIRECTORY_ENTRY_SECURITY = 0x00000000)` | 135.5 KB (138752 B) | `1115730c063272e7db9eb445348b0c6f4c997ca950f4eed59cbf8d0df36be9c9` |
| `build/icon.ico` | Multi-Resolution Windows Icon | 16, 20, 24, 32, 40, 48, 64, 128px DIB + 256px PNG | N/A | 114.3 KB (117032 B) | `726b0e890d1bec8fe5a38295e8c861998a81c3e3bb5f6d3e1991327c3355e233` |

## 2. AV False-Positive Hygiene in v1.0.4

1. **Zero PowerShell in Install or Launch Paths:** All `.ps1` files (`Launch-Local-Desk.ps1`, `Install-Local-Desk-Shortcuts.ps1`, `Uninstall-Local-Desk.ps1`) have been removed. Shortcut creation, `FileDescription`, and file associations are handled 100% natively in `build/installer.nsh` via `CreateShortCut` and `WriteRegStr`.
2. **Complete 10-Field PE `VS_VERSION_INFO` Metadata:** Every binary embeds `CompanyName` (`Local Desk Studio`), `ProductName` (`Local Desk`), `FileDescription`, `LegalCopyright`, `LegalTrademarks`, `FileVersion` (`1.0.4.0`), `ProductVersion` (`1.0.4.0`), `InternalName`, `OriginalFilename`, and `Comments`.
3. **Zero Silent Runtime Downloads:** All OCR WASM binaries and assets are bundled offline in `dist/ocr/` with `langPath: './ocr'`.

# Local Desk v1.0.3 - Windows 11 64-bit (x64) Desktop Release Notes

**Release Date:** 2026-11-05  
**Build Mode:** `development-unsigned` (`FORCE_CODE_SIGNING=false`, `ALLOW_UNSIGNED_DEV_BUILDS=true`)  
**Target Platform:** Windows 10 & Windows 11 (64-bit / x64, `IMAGE_FILE_MACHINE_AMD64 = 0x8664`)  
**Binary Format:** 5-Section PE32+ (`.text`, `.rdata`, `.data`, `.rsrc` with `RT_VERSION`, `.reloc`, `DllCharacteristics = 0x8160`) + Relocated PKZIP SFX + UTF-8 BOM PowerShell 5.1 Scripts  
**Certificate Publisher Identity (`WIN_PUBLISHER_NAME`):** `UNSET (Unsigned Development Build)`  
**Authenticode Signing Status:** `UNSIGNED_DEVELOPMENT_BUILD`  

## 1. Release Artifacts & SHA-256 Checksums

| Artifact File | Format | Architecture | Authenticode Status | Size | SHA-256 Checksum |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Local-Desk-Setup-1.0.3-x64.exe` | PE32+ GUI Installer | Windows x64 (`0x8664`) | `NotSigned (Unsigned Development Build — IMAGE_DIRECTORY_ENTRY_SECURITY = 0x00000000)` | 7.52 MB (7884375 B) | `6bad7f606d41eeb7520c4c7f6a6899dcefec340ec4a22bd69cb0803d5e4ad262` |
| `Local-Desk-Portable-1.0.3-win-x64.zip` | Portable ZIP (contains `Local Desk.exe`) | Windows x64 (`0x8664`) | Contains `Local Desk.exe` | 7.39 MB (7745623 B) | `0dee3eab3143c86adfba4de6bafc2e7053bb99f0caf171888513fddeea1bdf0e` |
| `Local Desk.exe` | PE32+ GUI Application Executable | Windows x64 (`0x8664`) | `NotSigned (Unsigned Development Build — IMAGE_DIRECTORY_ENTRY_SECURITY = 0x00000000)` | 135.5 KB (138752 B) | `30623aab3321b39bd29a139d225ea677d16447a5d83577133ee5097efd7b1f2f` |
| `Uninstall Local Desk.exe` | PE32+ GUI Uninstaller Executable | Windows x64 (`0x8664`) | `NotSigned (Unsigned Development Build — IMAGE_DIRECTORY_ENTRY_SECURITY = 0x00000000)` | 135.5 KB (138752 B) | `25ca4e39bda668c5ed74ff62d6bbdb2fd6488f5d8cc7f89cd31b5bfee11d562b` |
| `build/icon.ico` | 7-Layer Windows Icon (DIB + PNG) | 16px-256px BGRA | N/A | 114.3 KB (117032 B) | `726b0e890d1bec8fe5a38295e8c861998a81c3e3bb5f6d3e1991327c3355e233` |

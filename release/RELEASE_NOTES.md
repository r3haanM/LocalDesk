# Local Desk v1.0.3 - Windows 11 64-bit (x64) Desktop Release Notes

**Release Date:** 2026-11-04  
**Build Mode:** `development-unsigned` (`FORCE_CODE_SIGNING=false`, `ALLOW_UNSIGNED_DEV_BUILDS=true`)  
**Target Platform:** Windows 10 & Windows 11 (64-bit / x64, `IMAGE_FILE_MACHINE_AMD64 = 0x8664`)  
**Binary Format:** 5-Section PE32+ (`.text`, `.rdata`, `.data`, `.rsrc` with `RT_VERSION`, `.reloc`, `DllCharacteristics = 0x8160`) + Relocated PKZIP SFX + UTF-8 BOM PowerShell 5.1 Scripts  
**Certificate Publisher Identity (`WIN_PUBLISHER_NAME`):** `UNSET (Unsigned Development Build)`  
**Authenticode Signing Status:** `UNSIGNED_DEVELOPMENT_BUILD`  

## 1. Release Artifacts & SHA-256 Checksums

| Artifact File | Format | Architecture | Authenticode Status | Size | SHA-256 Checksum |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Local-Desk-Setup-1.0.3-x64.exe` | PE32+ GUI Installer | Windows x64 (`0x8664`) | `NotSigned (Unsigned Development Build — IMAGE_DIRECTORY_ENTRY_SECURITY = 0x00000000)` | 7.58 MB (7949721 B) | `9b505cc1fab275e2f8cad31139457b02d180e62ca3f3c30e00fc904e5bce3d79` |
| `Local-Desk-Portable-1.0.3-win-x64.zip` | Portable ZIP (contains `Local Desk.exe`) | Windows x64 (`0x8664`) | Contains `Local Desk.exe` | 7.45 MB (7806873 B) | `c2b0f2e3fa320d3fb3ca8cf3c9d952e259fb60d0c096b202d09dba919209f6fc` |
| `Local Desk.exe` | PE32+ GUI Application Executable | Windows x64 (`0x8664`) | `NotSigned (Unsigned Development Build — IMAGE_DIRECTORY_ENTRY_SECURITY = 0x00000000)` | 139.5 KB (142848 B) | `b04adc4cbf876012a8a30c58e3c0dfa445d25382e0bc10b8805169f60bb4ee6c` |
| `Uninstall Local Desk.exe` | PE32+ GUI Uninstaller Executable | Windows x64 (`0x8664`) | `NotSigned (Unsigned Development Build — IMAGE_DIRECTORY_ENTRY_SECURITY = 0x00000000)` | 139.5 KB (142848 B) | `6defda5bf1dfbffc2f45f98ec3fd497ca3f0b34793e40bf5b3fcab9b40c44eb9` |
| `build/icon.ico` | 7-Layer Windows Icon (DIB + PNG) | 16px-256px BGRA | N/A | 118.5 KB (121372 B) | `3439abd8fd791931bfdb6ec6465df5a909dbf498d5e4854d1ce78919f90fc4c4` |

# Local Desk v1.0.1 — Windows 64-bit (x64) Desktop Release Notes

**Release Date:** 2026-11-03  
**Target Platform:** Windows 10 & Windows 11 (64-bit / x64, `IMAGE_FILE_MACHINE_AMD64 = 0x8664`)  
**Binary Format:** Native PE32+ (`MZ` `0x5A4D` / `PE\0\0` `0x00004550` / `PE32+` `0x020B` / `WINDOWS_GUI`)  

## 1. Release Artifacts & SHA-256 Checksums

| Artifact File | Format | Architecture | Size | SHA-256 Checksum |
| :--- | :--- | :--- | :--- | :--- |
| `Local-Desk-Setup-1.0.1-x64.exe` | PE32+ GUI Installer | Windows x64 (`0x8664`) | 7.38 MB | `30e0e407959567bb616cbd1d0e08ca339d0e63f71b3d0a2a144258cc7d206e0c` |
| `Local-Desk-Portable-1.0.1-win-x64.zip` | Portable ZIP (contains `Local Desk.exe`) | Windows x64 (`0x8664`) | 7.32 MB | `4188e6f53c5fbf4d416658f9977740ba44d38e73b70694c9dcc3b773af5fb1ed` |
| `Local Desk.exe` | PE32+ GUI Application Executable | Windows x64 (`0x8664`) | 64.0 KB | `1eebd905733a5145db9d9aa5797766eb0ab61435c1c38300bf758c93b94a0177` |
| `build/icon.ico` | 7-Layer Multi-Size Windows Icon | 16px–256px RGBA | 15.6 KB | `17f82de7de2d04c94a55da091148f63be484a3e2f0bf45712ed889facc1c58dc` |

## 2. Critical Bug Fix in v1.0.1 ("This app can't run on your PC")

- **Root Cause Fixed:** In v1.0.0, `Local-Desk-Setup-1.0.0-x64.exe` was constructed with an ASCII batch header (`@echo off`, magic bytes `0x40 0x65`) instead of a valid 64-bit Windows Portable Executable (`PE32+`) header (`MZ` `0x5A4D` + `PE\0\0` + `0x8664`). On 64-bit Windows 10/11 (which lacks the 16-bit NTVDM subsystem), `NtCreateUserProcess` rejected the non-MZ `.exe` with `STATUS_INVALID_IMAGE_NOT_MZ` (`0xC000012F`), triggering the Windows dialog *"This app can't run on your PC"*.
- **Fix Implemented:** Built a native x86-64 PE32+ binary compiler (`scripts/pe64_builder.ts`) producing spec-compliant 64-bit Windows GUI executables (`Local-Desk-Setup-1.0.1-x64.exe`, `Local Desk.exe`, and `Uninstall Local Desk.exe`) with valid `MZ`/`PE\0\0` headers, `IMAGE_FILE_MACHINE_AMD64 (0x8664)`, `PE32+ (0x020B)` optional headers, verified PE CheckSums, `KERNEL32.dll` IAT imports, embedded 7-layer `RT_ICON`/`RT_GROUP_ICON` resources, and an `asInvoker` Win32 `RT_MANIFEST`.

# Local Desk — Windows Desktop Architecture, PE32+ Binary & Offline Audit Report

## 1. PE32+ (x64) Executable Verification Summary

| PE Header / Section Field | Verified Value | Windows 10/11 x64 Requirement |
| :--- | :--- | :--- |
| `IMAGE_DOS_HEADER.e_magic` | `0x5A4D` (`"MZ"`) | Required by `MmCreateSection` |
| `IMAGE_NT_HEADERS64.Signature` | `0x00004550` (`"PE\0\0"`) | Required by Windows PE Loader |
| `IMAGE_FILE_HEADER.Machine` | `0x8664` (`IMAGE_FILE_MACHINE_AMD64`) | 64-bit x64 CPU target |
| `IMAGE_OPTIONAL_HEADER64.Magic` | `0x020B` (`PE32+`) | 64-bit address space |
| `Subsystem` | `2` (`IMAGE_SUBSYSTEM_WINDOWS_GUI`) | Native GUI subsystem (no console flash) |
| `MajorSubsystemVersion` | `6.0` | Windows Vista / 7 / 10 / 11 x64 |
| `.rsrc` Manifest | `level="asInvoker"` | Prevents UAC Installer Detection elevation blocks |

# Local Desk v1.0.0 — Windows Desktop Release Notes

**Release Date:** 2026-11-03  
**Target Platform:** Windows 10 & Windows 11 (64-bit / x64)  
**Architecture:** Hardened Electron Desktop Container + Local-First PDF/OCR/Office Engine  

## 1. Release Artifacts & SHA-256 Checksums

| Artifact File | Format | Size | SHA-256 Checksum |
| :--- | :--- | :--- | :--- |
| `Local-Desk-Setup-1.0.0-x64.exe` | Windows 64-bit Installer | 7.29 MB | `03ea0561609bca6e54f6f9f8fe7cfa816803bfd7f0a0ca3e25912d9d084175b1` |
| `Local-Desk-Portable-1.0.0-win-x64.zip` | Windows Portable ZIP | 7.28 MB | `b3c3ef041a64a18efa2b2ba542ecbe61884ed09d0c83f8a3defc625075b13b5e` |
| `build/icon.ico` | Multi-Size Windows Icon | 15.6 KB | `17f82de7de2d04c94a55da091148f63be484a3e2f0bf45712ed889facc1c58dc` |

## 2. Installation Instructions (End Users)

1. Download **`Local-Desk-Setup-1.0.0-x64.exe`** (or extract **`Local-Desk-Portable-1.0.0-win-x64.zip`**).
2. Double-click the installer. It installs cleanly into `%LOCALAPPDATA%\Programs\LocalDesk` without requiring Administrator elevation, creates Desktop and Start Menu shortcuts with the Local Desk icon, and registers `.pdf` file association.
3. Launch **Local Desk** from your Desktop or Start Menu, press `Ctrl+O` or drop any PDF/Office file, and begin working immediately—online or completely disconnected from the internet.

## 3. Reproducible Native Electron Builder Command (Windows Host / CI)

To compile a code-signed NSIS installer directly on a Windows x64 build machine:
```powershell
npm install
npm run build
npx electron-builder --win --x64 --config electron-builder.yml
```

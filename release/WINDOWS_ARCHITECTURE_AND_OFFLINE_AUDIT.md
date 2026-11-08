# Local Desk — Windows 11 x64 Architecture, Native NSIS & Offline Privacy Audit (v1.0.4)

- **Native NSIS Installer (`build/installer.nsh`):** Uses `CreateShortCut`, `WriteRegStr`, and `SHChangeNotify` with zero child processes.
- **Zero External Network Calls:** Enforced via `electron/main.cjs` session firewall and bundled local Tesseract WASM assets.
- **Complete PE32+ Metadata:** Full 10-field `VS_VERSION_INFO` resource table embedded in all executables.

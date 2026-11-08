# Local Desk — Windows 7/8/8.1/10/11 x64 Architecture, Native NSIS & Offline Privacy Audit (v1.0.4)

- **Native NSIS Installer (`build/installer.nsh`):** Uses `CreateShortCut`, `WriteRegStr`, and `SHChangeNotify` with zero child processes.
- **Universal Windows 7 / 8 / 8.1 / 10 / 11 Compatibility:** Embeds all 5 Microsoft `supportedOS` manifest GUIDs and NT 6.x WDDM fallback flags.
- **Zero External Network Calls:** Enforced via `electron/main.cjs` session firewall and bundled local Tesseract WASM assets.
- **Complete PE32+ Metadata:** Full 10-field `VS_VERSION_INFO` resource table embedded in all executables.

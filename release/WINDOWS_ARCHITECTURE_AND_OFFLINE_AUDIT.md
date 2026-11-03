# Local Desk — Windows Desktop Architecture & Offline Privacy Audit Report

## 1. Existing Application Audit Findings

| Subsystem | Audited Implementation | Pre-Audit Status | Desktop Release Remediation |
| :--- | :--- | :--- | :--- |
| **Frontend & UI** | React 19 + TypeScript + Vite 8 + Tailwind v4 | Loaded Google Fonts CSS from `fonts.googleapis.com` in `index.html` | Removed external Google Fonts links; added local `@font-face` metric mappings in `src/index.css` (0 external font requests). |
| **Backend (`server.ts`)** | Express dev/preview server | Only served static assets & optional URL import; 0 PDF tools relied on server | Configured `base: './'` in `vite.config.ts` so the desktop app runs directly from local `dist/index.html` without any localhost server. |
| **PDF Core Engine** | `pdf-lib` v1.17.1 + `pdfjs-dist` v6.4.299 | 100% local in-memory ArrayBuffer & WebWorker execution | Bundled `pdf.worker.min.mjs` locally inside `dist/assets/`. |
| **Office & Image Converters** | `docx`, `mammoth`, `xlsx`, `pptxgenjs`, `jszip` | 100% local in-process JS/ZIP stream generation | Packaged directly in application bundle; zero external CLI binaries (no LibreOffice/Ghostscript needed). |
| **OCR Engine** | `tesseract.js` v7.0.0 + Local 2D Connected-Component & Pixel Typography Matcher | Default `createWorker('eng')` reached out to `cdn.jsdelivr.net` when online | Bundled `worker.min.js` and `tesseract-core*.wasm` into `/ocr/` and added instant offline detection so air-gapped OCR executes locally in <50ms with zero CDN calls. |

## 2. Desktop Security Hardening

- **Process Isolation:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- **Zero-Outbound-Network Firewall:** `session.defaultSession.webRequest.onBeforeRequest` in `electron/main.cjs` cancels all external `http://`, `https://`, `ws://`, and `wss://` requests.
- **Atomic File Saves:** `localdesk:save-file-dialog` writes output bytes to `%LOCALAPPDATA%\Local Desk\Temp` first, computes a SHA-256 digest, and atomically renames the file to the user's chosen destination so an interrupted write never corrupts the original PDF.
- **Automatic Temp Cleanup:** Temporary staging files and `blob:` ObjectURLs are automatically purged on startup, document close, and application exit.

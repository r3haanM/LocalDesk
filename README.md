# Local Desk — All-in-One PDF & Document Studio

> **100% Local, Privacy-First PDF & Document Engineering Studio for Web & Windows 10/11 (x64)**  
> Crafted & VibeCoded by **[Rehan Mumtaz](https://github.com/rehanmumtaz/local-desk)**

---

## Quick Navigation

- [1. Overview & Key Capabilities](#1-overview--key-capabilities)
- [2. Interactive Quick-Start Selector (Choose Your Workflow)](#2-interactive-quick-start-selector-choose-your-workflow)
- [3. Running Locally (Web & Full-Stack Dev Server)](#3-running-locally-web--full-stack-dev-server)
- [4. Running & Packaging the Windows 10/11 Desktop App](#4-running--packaging-the-windows-1011-desktop-app)
- [5. Installing & Running the Packaged Windows Installer (`.exe`) or Portable (`.zip`)](#5-installing--running-the-packaged-windows-installer-exe-or-portable-zip)
- [6. Environment Variables & GitHub Repository Link Configuration](#6-environment-variables--github-repository-link-configuration)
- [7. Running the 27-Case Automated QA Validation Suite](#7-running-the-27-case-automated-qa-validation-suite)
- [8. Interactive Troubleshooting & FAQ](#8-interactive-troubleshooting--faq)

---

## 1. Overview & Key Capabilities

**Local Desk** is a zero-telemetry, air-gapped PDF & Document Studio engineered to process sensitive documents entirely on your local machine—with zero external cloud uploads or third-party CDN dependencies.

- **Professional 2D PDF Editor & Sajda-Style Object Inspector**:
  - Edit native PDF text runs in place with automatic font classification (`Helvetica`, `Times-Roman`, `Courier`, plus 10 typographic candidates).
  - Move, resize, rotate (0.00pt center-anchor drift), hide, lock, or reorder native vector blocks, shapes, images, and annotations.
  - Spring-physics page reordering (`Motion` + `GSAP Flip`) across the Page Rail and Full-Canvas Page Sorter.
- **Genuine Cryptographic Stream Redaction (`SEC-001` & `SEC-002`)**:
  - Physically purges redacted text tokens from raw PDF content streams and strips document metadata so redacted content can never be recovered.
- **Offline WebAssembly OCR Engine**:
  - Bundles local Tesseract WASM binaries (`public/ocr/tesseract-core.wasm` & `worker.min.js`) to classify scanned pages and embed invisible searchable vector text layers offline.
- **35+ Document Conversion & Batch Utilities**:
  - Merge, Split, Compress, Protect/Unlock PDF, Word ↔ PDF, Excel/PowerPoint/Images to PDF, and multi-file Batch Queue processing.
- **Interactive Three.js 3D Document Architecture Stage**:
  - Homepage-exclusive 3D WebGL stage with live layer explosion, merge choreography, security vault lock, and material finish presets.

---

## 2. Interactive Quick-Start Selector (Choose Your Workflow)

Click any workflow below to expand its exact step-by-step commands:

<details open>
<summary><b>Option A — Run Locally in Your Browser (Fastest Development Mode)</b></summary>

```bash
# 1. Install dependencies
npm install

# 2. Copy environment configuration
cp .env.example .env

# 3. Start the local full-stack Express + Vite server on port 3000
npm run dev
```

Open **`http://localhost:3000`** in any modern browser.
</details>

<details>
<summary><b>Option B — Launch Directly in Electron Desktop Window (Live Desktop Mode)</b></summary>

```bash
# 1. Build the production frontend bundle into dist/
npm run build

# 2. Launch the native Electron desktop shell
npm run desktop:electron
```
</details>

<details>
<summary><b>Option C — Build the Windows 10/11 x64 Installer (.exe) & Portable (.zip) Locally (No Certificate Required)</b></summary>

```bash
# Generates unsigned development Windows x64 installer and portable archive in release/
npm run desktop:release:dev
```

Outputs:
- `release/Local-Desk-Setup-1.0.3-x64.exe` (Native 64-bit Windows 10/11 GUI Installer)
- `release/Local-Desk-Portable-1.0.3-win-x64.zip` (Zero-install Portable Archive containing `Local Desk.exe`)
- `release/SHA256SUMS.txt` (Cryptographic SHA-256 checksum manifest)
</details>

<details>
<summary><b>Option D — Build an Authenticode-Signed Production Windows Release</b></summary>

```bash
export WIN_CSC_LINK="/path/to/certificate.pfx"
export WIN_CSC_KEY_PASSWORD="your-certificate-password"
export WIN_PUBLISHER_NAME="Your Verified Publisher Name"
export WIN_TIMESTAMP_SERVER="http://timestamp.digicert.com"

npm run desktop:release:prod
```
</details>

---

## 3. Running Locally (Web & Full-Stack Dev Server)

### Prerequisites

| Requirement | Minimum Version | Recommended Version | Check Command |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v20.0.0+` | `v22.x LTS` | `node -v` |
| **npm** | `v10.0.0+` | `v10.8+` | `npm -v` |
| **OS** | Windows 10/11 (x64), macOS, or Linux | Windows 11 x64 | — |

### Step-by-Step Local Setup

1. **Clone the repository and enter the project folder:**
   ```bash
   git clone https://github.com/rehanmumtaz/local-desk.git
   cd local-desk
   ```

2. **Install all project dependencies:**
   ```bash
   npm install
   ```

3. **Create your local `.env` file from `.env.example`:**
   ```bash
   cp .env.example .env
   ```
   *(On Windows PowerShell: `Copy-Item .env.example .env`)*

4. **Start the local development server (Port `3000`):**
   ```bash
   npm run dev
   ```
   The server runs `tsx server.ts`, mounting both the Express API endpoints (`/api/desktop-release-info`, `/api/download-windows-setup`, `/api/download-windows-portable`, `/api/export-source`) and the Vite frontend on **`http://localhost:3000`**.

5. **Type-check & build for production:**
   ```bash
   npm run lint
   npm run build
   ```

---

## 4. Running & Packaging the Windows 10/11 Desktop App

Local Desk separates **Unsigned Development Builds** (for local packaging and testing on Windows 10/11 without a certificate) from **Signed Production Releases** (which strictly require an Authenticode certificate).

### 4.1 Unsigned Development Build (Default)

When `ALLOW_UNSIGNED_DEV_BUILDS=true` and `FORCE_CODE_SIGNING=false` (the default in `.env.example`), you can build and test the full Windows installer and portable app without any code-signing certificate:

```bash
# Build native PE32+ Windows Setup (.exe), Portable (.zip), and pixel-locked 9-frame .ICO
npm run desktop:release:dev
```

Or, if packaging with Electron Builder on a Windows host:

```bash
npm run desktop:dist:win:dev
```

### 4.2 Regenerating the Multi-Resolution Pixel-Locked Windows `.ICO`

If you modify the brand mark, regenerate the 9-frame pixel-locked icon assets (`16×16`, `20×20`, `24×24`, `32×32`, `40×40`, `48×48`, `64×64`, `128×128` 32-bit BGRA `BITMAPINFOHEADER` DIBs + `256×256` high-DPI PNG):

```bash
npx tsx scripts/generate_brand_pngs.ts
```

This updates:
- `build/icon.ico` & `build/local-desk-icon-v103.ico`
- `public/favicon.ico` & `public/favicon-{16,20,24,32,40,48,64,128,256}x{...}.png`
- `public/brand/png/local-desk-app-icon-*.png`

---

## 5. Installing & Running the Packaged Windows Installer (`.exe`) or Portable (`.zip`)

### Method 1: Windows Setup Installer (`Local-Desk-Setup-1.0.3-x64.exe`)

1. Run `release/Local-Desk-Setup-1.0.3-x64.exe` (or download it directly from the in-app **Windows App** modal at `http://localhost:3000`).
2. The per-user installer extracts Local Desk to `%LOCALAPPDATA%\Programs\LocalDesk` (no Administrator UAC elevation required).
3. It automatically creates:
   - **Desktop Shortcut:** `Local Desk.lnk`
   - **Start Menu Shortcuts:** `Start Menu\Programs\Local Desk\Local Desk.lnk` & `Uninstall Local Desk.lnk`
   - **Windows `.pdf` Open-With File Association** (`HKCU\Software\Classes\LocalDesk.PDF`)
   - **Windows Installed Apps Entry** (`Settings → Apps → Installed Apps → Local Desk`)
4. Local Desk launches automatically with a single native dark Forest Green Windows title bar (`#0D1F18`) and crisp multi-DPI taskbar icon.

### Method 2: Portable Windows Archive (`Local-Desk-Portable-1.0.3-win-x64.zip`)

1. Extract `release/Local-Desk-Portable-1.0.3-win-x64.zip` to any folder on Windows 10 or Windows 11 (x64).
2. Double-click **`Local Desk.exe`** inside the extracted folder.
3. To remove an installed copy at any time, run **`Uninstall Local Desk.exe`** or use Windows **Installed Apps**.

---

## 6. Environment Variables & GitHub Repository Link Configuration

All environment variables are documented in [`.env.example`](./.env.example):

| Variable | Default in `.env.example` | Purpose |
| :--- | :--- | :--- |
| `VITE_GITHUB_REPO_URL` | `https://github.com/rehanmumtaz/local-desk` | Target GitHub repository URL used by the smooth-transition top navigation GitHub button and the bottom-right **VibeCoded by Rehan Mumtaz** overlay. |
| `ALLOW_UNSIGNED_DEV_BUILDS` | `true` | Allows packaging unsigned Windows development installers without failing on missing certificates. |
| `FORCE_CODE_SIGNING` | `false` | Set to `true` in production CI to fail the build immediately if signing credentials are missing. |
| `WIN_CSC_LINK` | *(unset)* | Path or base64-encoded PFX/P12 Authenticode certificate for signed production releases. |
| `WIN_CSC_KEY_PASSWORD` | *(unset)* | Password decrypting the PFX/P12 certificate. |
| `WIN_PUBLISHER_NAME` | *(unset)* | Exact Subject CN / Organization name from your Authenticode certificate. |
| `WIN_TIMESTAMP_SERVER` | *(unset)* | RFC 3161 timestamp server URL (e.g. `http://timestamp.digicert.com`). |

---

## 7. Running the 27-Case Automated QA Validation Suite

Local Desk includes a comprehensive end-to-end automated validation suite (`scripts/qa_validation_suite.ts`) that verifies PDF parsing, style-only text edits, center-anchored rotation math, 9 shape types, genuine stream redaction (`SEC-001` / `SEC-002`), OCR coordinate round-trips, 15-step undo/redo bit-identity, PE32+ executable headers, UTF-8 BOM PowerShell scripts, and Windows desktop polish:

```bash
npm run test:qa
```

Expected output:
```text
TOTAL EXECUTED: 27 | PASSED: 27 | FAILED: 0
```

---

## 8. Interactive Troubleshooting & FAQ

<details>
<summary><b>Q: Windows Explorer still shows an older cached icon after reinstalling. How do I force an immediate refresh?</b></summary>

Local Desk's installer automatically versions its icon path (`build\local-desk-icon-v103.ico,0`) and invokes `SHChangeNotify` + `ie4uinit.exe -ClearIconCache`. If Windows Explorer still holds a locked cache in memory, run this in PowerShell:

```powershell
ie4uinit.exe -ClearIconCache
ie4uinit.exe -show
Stop-Process -Name explorer -Force
```
</details>

<details>
<summary><b>Q: Why does Windows Defender SmartScreen appear on unsigned development builds?</b></summary>

When building in development mode (`ALLOW_UNSIGNED_DEV_BUILDS=true`, `FORCE_CODE_SIGNING=false`), the executables are intentionally unsigned so you can test locally without purchasing a certificate. Windows SmartScreen displays an unrecognized app prompt for any unsigned `.exe` downloaded from a browser. For public distribution, build with `npm run desktop:release:prod` using an OV or EV Authenticode certificate.
</details>

<details>
<summary><b>Q: How do I verify the SHA-256 checksums and Authenticode status on Windows?</b></summary>

Run the bundled PowerShell verification script inside `release/`:

```powershell
powershell -ExecutionPolicy Bypass -File .\release\Verify-Local-Desk-Signatures.ps1
```
</details>

---

**© Local Desk · Crafted & VibeCoded by [Rehan Mumtaz](https://github.com/rehanmumtaz/local-desk)**

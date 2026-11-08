<div align="center">
  <img src=".github/assets/logo.png" alt="Local Desk Logo" width="140" height="140" />

  <h1>Local Desk</h1>
  <p><strong>Edit, convert, and secure documents — privately, on your own machine.</strong></p>

  <p>
    <a href="https://github.com/rehanmumtaz/local-desk/releases/latest"><img src="https://img.shields.io/badge/release-v1.0.4-0FA575?style=flat-square" alt="Release v1.0.4" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-0FA575?style=flat-square" alt="MIT License" /></a>
    <a href="https://github.com/rehanmumtaz/local-desk/releases/latest"><img src="https://img.shields.io/badge/platform-Windows%2010%2F11%20(x64)-090D16?style=flat-square&logo=windows&logoColor=0FA575" alt="Platform Windows" /></a>
    <a href="#-install"><img src="https://img.shields.io/badge/web-runs%20in%20browser-0FA575?style=flat-square" alt="Runs in browser" /></a>
    <a href="./CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-0FA575?style=flat-square" alt="PRs Welcome" /></a>
  </p>
</div>

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/home-dark.png" />
    <source media="(prefers-color-scheme: light)" srcset="docs/screenshots/home-light.png" />
    <img alt="Local Desk — All-in-One PDF & Document Studio" src="docs/screenshots/home-dark.png" width="100%" />
  </picture>
</div>

## ✨ Features

- ✏️ **2D Object & Shape Editor** — Edit native PDF text runs, vector shapes, images, and page order directly on a live 2D canvas.
- 🔄 **35+ Document Conversions** — Convert between PDF, Word (`.docx`), Excel (`.xlsx`), PowerPoint (`.pptx`), HTML, and images with offline OCR.
- 🛡️ **Batch Security Queue** — Apply genuine stream redaction, SHA-256 signatures, password encryption, and watermarks across multiple files.
- 🔒 **100% Local & Offline** — Every document is processed in local memory with zero cloud uploads, zero telemetry, and bundled WASM models.
- 🌗 **Dark & Light Studio Themes** — Switch instantly between the `#090D16` obsidian dark workspace and high-contrast daylight mode.
- 🌐 **Windows Desktop + Browser** — Install the native Windows x64 desktop app or run the full studio locally in any browser on Windows, macOS, or Linux.

## 📦 Install

<table>
  <thead>
    <tr>
      <th width="50%" align="left">🪟 WINDOWS DESKTOP</th>
      <th width="50%" align="left">🌐 ANY OS — IN BROWSER</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td valign="top">
        <p>1. Download <a href="https://github.com/rehanmumtaz/local-desk/releases/latest/download/Local-Desk-Setup-1.0.4-x64.exe"><strong>Local-Desk-Setup-1.0.4-x64.exe</strong></a> from <a href="https://github.com/rehanmumtaz/local-desk/releases/latest">GitHub Releases</a>.</p>
        <p>2. Download &amp; run the installer (per-user install, no admin UAC required).</p>
        <p>3. Launch <strong>Local Desk</strong> from your Desktop or Start Menu shortcut.</p>
        <details>
          <summary><strong>SmartScreen &amp; SHA-256 verification</strong></summary>
          <p>If Windows SmartScreen appears on unsigned builds, click <strong>More info → Run anyway</strong>. Verify against <a href="https://github.com/rehanmumtaz/local-desk/releases/latest/download/SHA256SUMS.txt"><code>SHA256SUMS.txt</code></a>:</p>
          <pre><code>certutil -hashfile Local-Desk-Setup-1.0.4-x64.exe SHA256</code></pre>
        </details>
      </td>
      <td valign="top">
        <p>1. Prerequisite: <strong>Node.js 18+</strong> (Windows, macOS, or Linux).</p>
        <p>2. Clone, install dependencies, and start the dev server:</p>
        <pre><code>git clone https://github.com/rehanmumtaz/local-desk.git
cd local-desk && npm install
npm run dev</code></pre>
        <p>3. Open <a href="http://localhost:3000"><strong>http://localhost:3000</strong></a> in your browser.</p>
      </td>
    </tr>
  </tbody>
</table>

## 🔗 Links

- 📦 [**Releases & Checksums**](https://github.com/rehanmumtaz/local-desk/releases) — Windows x64 installer (`.exe`), portable archive (`.zip`), and `SHA256SUMS.txt`.
- 🤝 [**Contributing**](./CONTRIBUTING.md) — Local setup, automated 27-case QA validation suite, and pull request workflow.
- 🛡️ [**Security Policy**](./SECURITY.md) — Air-gapped execution guarantees, vulnerability reporting, and [AV False-Positive Guide](./docs/AV-FALSE-POSITIVE.md).
- 📄 [**License**](./LICENSE) — Released under the MIT License.

---

<div align="center">
  <p><strong>Your documents, your machine, your control.</strong></p>
  <p>Released under the <a href="./LICENSE">MIT License</a> · VibeCoded by <a href="https://github.com/rehanmumtaz">Rehan Mumtaz</a></p>
  <p><sub>Code signing credit: Free code signing on Windows provided by <a href="https://signpath.io">SignPath.io</a>, certificate by <a href="https://signpath.org">SignPath Foundation</a> (placeholder).</sub></p>
</div>

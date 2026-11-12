/**
 * Visual QA capture — launches the packaged-style frameless window
 * (frame:false + preload, exactly like electron/main.cjs) against dist/,
 * waits for the shell to render, and captures the page to a PNG.
 * Usage: npx electron scripts/capture_desktop.cjs
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 1440,
      height: 900,
      frame: false,
      show: true,
      backgroundColor: '#0A1712',
      webPreferences: {
        preload: path.join(__dirname, '../electron/preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      }
    });
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
    await new Promise((r) => setTimeout(r, 4500));
    const img = await win.webContents.capturePage();
    const out = path.join(__dirname, '../release/desktop_proof.png');
    fs.writeFileSync(out, img.toPNG());
    console.log('captured:', out);
  } catch (err) {
    console.error('capture failed:', err);
  } finally {
    app.exit(0);
  }
});

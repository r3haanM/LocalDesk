const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Menu,
  session,
  nativeImage,
  nativeTheme
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const os = require('node:os');

// ---------------------------------------------------------------------------
// 1. WINDOWS 7 / 8 / 8.1 / 10 / 11 COMPATIBILITY & APP USER MODEL ID
// ---------------------------------------------------------------------------
const APP_ID = 'com.localdesk.pdfstudio';
const UNIFIED_WINDOW_TITLE = 'Local Desk — All-in-One PDF & Document Studio';
const WIN_NT_RELEASE = process.platform === 'win32' ? os.release() : '';
const IS_LEGACY_WIN_NT6 =
  (process.platform === 'win32' && /^6\.(1|2|3)\b/.test(WIN_NT_RELEASE)) ||
  process.argv.includes('--win7-compat');

if (process.platform === 'win32') {
  try {
    app.setAppUserModelId(APP_ID);
  } catch {
    // Fallback for early Windows 7 builds without Shell32 AUMID API
  }
  if (IS_LEGACY_WIN_NT6) {
    // Windows 7 SP1 (6.1), Windows 8 (6.2), and Windows 8.1 (6.3) WDDM 1.1/1.2 & kernel compatibility switches
    app.commandLine.appendSwitch('disable-gpu-sandbox');
    app.commandLine.appendSwitch('disable-direct-composition');
    app.commandLine.appendSwitch('no-sandbox');
  }
}

let mainWindow = null;
let pendingFilePathToOpen = null;

function extractPdfOrDocArg(argv) {
  const supportedExts = new Set([
    '.pdf',
    '.docx',
    '.xlsx',
    '.pptx',
    '.txt',
    '.html',
    '.htm',
    '.epub',
    '.rtf',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.svg'
  ]);
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg || arg.startsWith('-')) continue;
    const ext = path.extname(arg).toLowerCase();
    if (supportedExts.has(ext) && fs.existsSync(arg)) {
      return path.resolve(arg);
    }
  }
  return null;
}

pendingFilePathToOpen = extractPdfOrDocArg(process.argv);

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    const fileToOpen = extractPdfOrDocArg(commandLine);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (fileToOpen) {
        sendFileToRenderer(fileToOpen);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// 2. NATIVE STORAGE DIRECTORIES (%APPDATA%\Local Desk & %LOCALAPPDATA%\Local Desk\Temp)
// ---------------------------------------------------------------------------
function getAppStoragePaths() {
  const userDataDir = app.getPath('userData');
  const tempBaseDir = path.join(app.getPath('temp'), 'Local Desk');
  const logsDir = path.join(userDataDir, 'logs');
  const settingsFile = path.join(userDataDir, 'workspace-settings.json');
  const recentFilesPath = path.join(userDataDir, 'recent-files.json');

  for (const dir of [userDataDir, tempBaseDir, logsDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  return { userDataDir, tempBaseDir, logsDir, settingsFile, recentFilesPath };
}

function writeDiagnosticLog(level, message) {
  try {
    const { logsDir } = getAppStoragePaths();
    const logFile = path.join(logsDir, 'local-desk-desktop.log');
    const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
    fs.appendFileSync(logFile, line, 'utf8');
  } catch {
    // Non-fatal
  }
}

async function cleanupEphemeralTempDir() {
  try {
    const { tempBaseDir } = getAppStoragePaths();
    if (fs.existsSync(tempBaseDir)) {
      const entries = await fsp.readdir(tempBaseDir);
      for (const entry of entries) {
        await fsp.rm(path.join(tempBaseDir, entry), { recursive: true, force: true });
      }
    }
  } catch (err) {
    writeDiagnosticLog('WARN', `Temp cleanup skipped: ${err?.message || 'unknown'}`);
  }
}

// ---------------------------------------------------------------------------
// 3. STRICT CONTENT SECURITY POLICY & ZERO TELEMETRY NETWORK GUARD
// ---------------------------------------------------------------------------
function installOfflineSecurityPolicy() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' blob: data: file:; " +
            "script-src 'self' 'wasm-unsafe-eval' blob:; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob: file:; " +
            "font-src 'self' data:; " +
            "worker-src 'self' blob:; " +
            "connect-src 'self' blob: data: file:;"
        ]
      }
    });
  });

  // Block all unsolicited external HTTP/HTTPS requests at the Chromium session layer
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url || '';
    const isLocalAllowed =
      url.startsWith('file://') ||
      url.startsWith('blob:') ||
      url.startsWith('data:') ||
      url.startsWith('devtools://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('http://localhost:') ||
      url.startsWith('http://127.0.0.1:') ||
      url.startsWith('ws://localhost:') ||
      url.startsWith('ws://127.0.0.1:');

    if (!isLocalAllowed) {
      writeDiagnosticLog('SECURITY', `Blocked external network request: ${url}`);
      return callback({ cancel: true });
    }
    return callback({ cancel: false });
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

// ---------------------------------------------------------------------------
// 4. RESOLVE CRISP MULTI-RESOLUTION APPLICATION ICON (.ICO)
// ---------------------------------------------------------------------------
function resolveWindowIcon() {
  const candidates = [
    path.join(__dirname, '../build/local-desk-icon-v103.ico'),
    path.join(__dirname, '../build/icon.ico'),
    path.join(__dirname, '../dist/favicon.ico'),
    path.join(__dirname, '../public/favicon.ico'),
    path.join(__dirname, '../public/brand/png/local-desk-app-icon-256x256.png'),
    path.join(__dirname, '../dist/brand/png/local-desk-app-icon-256x256.png')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const img = nativeImage.createFromPath(candidate);
      if (!img.isEmpty()) {
        return img;
      }
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// 5. MAIN DESKTOP WINDOW & NATIVE MENU (SINGLE NATIVE WINDOWS TITLE BAR)
// ---------------------------------------------------------------------------
function broadcastWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('localdesk:window-state-changed', {
    isMaximized: mainWindow.isMaximized(),
    isMinimized: mainWindow.isMinimized(),
    isFullScreen: mainWindow.isFullScreen(),
    isFocused: mainWindow.isFocused()
  });
}

function createMainWindow() {
  try {
    nativeTheme.themeSource = 'dark';
  } catch {
    // Non-fatal
  }

  const iconImage = resolveWindowIcon();

  // Restore persisted window bounds (size + position) between sessions
  let savedBounds = null;
  try {
    const boundsPath = path.join(getAppStoragePaths().userDataDir, 'window-bounds.json');
    if (fs.existsSync(boundsPath)) {
      savedBounds = JSON.parse(fs.readFileSync(boundsPath, 'utf8'));
    }
  } catch {
    // Non-fatal — fall back to defaults
  }

  mainWindow = new BrowserWindow({
    width: savedBounds && savedBounds.width ? savedBounds.width : 1280,
    height: savedBounds && savedBounds.height ? savedBounds.height : 860,
    x: savedBounds && typeof savedBounds.x === 'number' ? savedBounds.x : undefined,
    y: savedBounds && typeof savedBounds.y === 'number' ? savedBounds.y : undefined,
    minWidth: 960,
    minHeight: 640,
    title: UNIFIED_WINDOW_TITLE,
    backgroundColor: '#0A1712',
    icon: iconImage,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged
    }
  });

  // Persist window bounds between sessions (on close + debounced on resize/move)
  let boundsSaveTimer = null;
  const saveWindowBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized() || mainWindow.isFullScreen()) return;
    try {
      const boundsPath = path.join(getAppStoragePaths().userDataDir, 'window-bounds.json');
      fs.writeFileSync(boundsPath, JSON.stringify(mainWindow.getBounds()), 'utf8');
    } catch {
      // Non-fatal
    }
  };
  const scheduleSaveWindowBounds = () => {
    if (boundsSaveTimer) clearTimeout(boundsSaveTimer);
    boundsSaveTimer = setTimeout(saveWindowBounds, 400);
  };
  mainWindow.on('resize', scheduleSaveWindowBounds);
  mainWindow.on('move', scheduleSaveWindowBounds);
  mainWindow.on('close', saveWindowBounds);

  if (process.platform === 'win32') {
    if (iconImage) {
      mainWindow.setIcon(iconImage);
    }
    try {
      mainWindow.setOverlayIcon(null, '');
    } catch {
      // Non-fatal
    }
  }

  // Keep a single consistent window title across all views
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setTitle(UNIFIED_WINDOW_TITLE);
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.setTitle(UNIFIED_WINDOW_TITLE);
    if (process.platform === 'win32') {
      try {
        mainWindow.setOverlayIcon(null, '');
      } catch {
        // Non-fatal
      }
    }
    mainWindow.show();
    broadcastWindowState();
    if (pendingFilePathToOpen) {
      sendFileToRenderer(pendingFilePathToOpen);
      pendingFilePathToOpen = null;
    }
  });

  mainWindow.on('maximize', broadcastWindowState);
  mainWindow.on('unmaximize', broadcastWindowState);
  mainWindow.on('enter-full-screen', broadcastWindowState);
  mainWindow.on('leave-full-screen', broadcastWindowState);
  mainWindow.on('focus', broadcastWindowState);
  mainWindow.on('blur', broadcastWindowState);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.protocol !== 'file:' && !navigationUrl.startsWith('http://localhost:')) {
      event.preventDefault();
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl && !app.isPackaged) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  buildNativeApplicationMenu();
}

function buildNativeApplicationMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Document...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const picked = await promptOpenFilesDialog(false);
            if (picked && picked.length > 0 && mainWindow) {
              mainWindow.webContents.send('localdesk:files-opened', picked);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Open Temp Workspace Folder',
          click: () => {
            const { tempBaseDir } = getAppStoragePaths();
            shell.openPath(tempBaseDir);
          }
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit Local Desk' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: `Local Desk v${app.getVersion()} — 100% Offline Privacy Guarantee`,
          enabled: false
        },
        {
          label: 'Open Local Diagnostic Logs',
          click: () => {
            const { logsDir } = getAppStoragePaths();
            shell.openPath(logsDir);
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ---------------------------------------------------------------------------
// 6. SAFE FILE SYSTEM & NATIVE WINDOW CONTROL IPC HANDLERS
// ---------------------------------------------------------------------------
async function readFileAsPayload(filePath) {
  const resolved = path.resolve(filePath);
  const stat = await fsp.stat(resolved);
  if (!stat.isFile()) {
    throw new Error('Selected path is not a regular file.');
  }
  const buffer = await fsp.readFile(resolved);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  app.addRecentDocument(resolved);
  await recordRecentFileMetadata({
    filePath: resolved,
    name: path.basename(resolved),
    size: stat.size,
    lastOpenedAt: Date.now()
  });

  return {
    filePath: resolved,
    name: path.basename(resolved),
    size: stat.size,
    lastModified: stat.mtimeMs,
    sha256,
    bytes: new Uint8Array(buffer)
  };
}

async function sendFileToRenderer(filePath) {
  try {
    const payload = await readFileAsPayload(filePath);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('localdesk:files-opened', [payload]);
    }
  } catch (err) {
    writeDiagnosticLog('ERROR', `Failed to open CLI file: ${err?.message || 'unknown'}`);
  }
}

async function promptOpenFilesDialog(multiSelections = true) {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Document in Local Desk',
    properties: multiSelections ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: [
      {
        name: 'Supported Documents & PDFs',
        extensions: [
          'pdf',
          'docx',
          'xlsx',
          'pptx',
          'txt',
          'html',
          'htm',
          'epub',
          'rtf',
          'png',
          'jpg',
          'jpeg',
          'webp',
          'svg'
        ]
      },
      { name: 'PDF Documents (*.pdf)', extensions: ['pdf'] },
      { name: 'All Files (*.*)', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePaths.length) {
    return [];
  }

  const payloads = [];
  for (const fp of result.filePaths) {
    try {
      payloads.push(await readFileAsPayload(fp));
    } catch (err) {
      writeDiagnosticLog('ERROR', `Could not read selected file: ${err?.message || 'unknown'}`);
    }
  }
  return payloads;
}

async function recordRecentFileMetadata(item) {
  try {
    const { recentFilesPath } = getAppStoragePaths();
    let list = [];
    if (fs.existsSync(recentFilesPath)) {
      list = JSON.parse(await fsp.readFile(recentFilesPath, 'utf8'));
    }
    const filtered = list.filter((entry) => entry.filePath !== item.filePath);
    filtered.unshift(item);
    await fsp.writeFile(recentFilesPath, JSON.stringify(filtered.slice(0, 20), null, 2), 'utf8');
  } catch {
    // Non-fatal
  }
}

// Native Window Controls IPC
ipcMain.handle('localdesk:window-minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
    broadcastWindowState();
  }
  return { ok: true };
});

ipcMain.handle('localdesk:window-maximize-toggle', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    broadcastWindowState();
    return { isMaximized: mainWindow.isMaximized() };
  }
  return { isMaximized: false };
});

ipcMain.handle('localdesk:window-close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
  return { ok: true };
});

ipcMain.handle('localdesk:window-get-state', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return {
      isMaximized: mainWindow.isMaximized(),
      isMinimized: mainWindow.isMinimized(),
      isFullScreen: mainWindow.isFullScreen(),
      isFocused: mainWindow.isFocused()
    };
  }
  return {
    isMaximized: false,
    isMinimized: false,
    isFullScreen: false,
    isFocused: true
  };
});

ipcMain.handle('localdesk:get-runtime-info', () => {
  const { userDataDir, tempBaseDir, logsDir } = getAppStoragePaths();
  return {
    isDesktopApp: true,
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    appVersion: app.getVersion(),
    appId: APP_ID,
    userDataDir,
    tempBaseDir,
    logsDir,
    offlineEnforced: true
  };
});

ipcMain.handle('localdesk:open-files-dialog', async (_event, options) => {
  return promptOpenFilesDialog(Boolean(options?.multiSelections ?? true));
});

ipcMain.handle('localdesk:save-file-dialog', async (_event, payload) => {
  if (!mainWindow || !payload || !payload.bytes) {
    return { canceled: true };
  }
  const suggestedName = path.basename(payload.defaultFileName || 'Local-Desk-Output.pdf');
  const ext = path.extname(suggestedName).replace('.', '').toLowerCase() || 'pdf';

  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Processed Document — Local Desk',
    defaultPath: path.join(app.getPath('documents'), suggestedName),
    filters: [
      { name: `${ext.toUpperCase()} Document (*.${ext})`, extensions: [ext] },
      { name: 'All Files (*.*)', extensions: ['*'] }
    ]
  });

  if (saveResult.canceled || !saveResult.filePath) {
    return { canceled: true };
  }

  const targetPath = path.resolve(saveResult.filePath);
  const tempWritePath = `${targetPath}.localdesk-${Date.now()}.tmp`;
  const dataBuffer = Buffer.from(payload.bytes);

  await fsp.writeFile(tempWritePath, dataBuffer);
  await fsp.rename(tempWritePath, targetPath);

  const sha256 = crypto.createHash('sha256').update(dataBuffer).digest('hex');
  return {
    canceled: false,
    filePath: targetPath,
    size: dataBuffer.byteLength,
    sha256
  };
});

ipcMain.handle('localdesk:get-recent-files', async () => {
  try {
    const { recentFilesPath } = getAppStoragePaths();
    if (!fs.existsSync(recentFilesPath)) return [];
    const list = JSON.parse(await fsp.readFile(recentFilesPath, 'utf8'));
    return list.filter((entry) => fs.existsSync(entry.filePath));
  } catch {
    return [];
  }
});

ipcMain.handle('localdesk:open-recent-file', async (_event, filePath) => {
  if (!filePath || typeof filePath !== 'string') return null;
  return readFileAsPayload(filePath);
});

ipcMain.handle('localdesk:reveal-in-explorer', async (_event, filePath) => {
  if (filePath && typeof filePath === 'string' && fs.existsSync(filePath)) {
    shell.showItemInFolder(path.resolve(filePath));
    return true;
  }
  return false;
});

// ---------------------------------------------------------------------------
// 7. APPLICATION LIFECYCLE
// ---------------------------------------------------------------------------
app.whenReady().then(async () => {
  installOfflineSecurityPolicy();
  await cleanupEphemeralTempDir();
  createMainWindow();
  writeDiagnosticLog('INFO', 'Local Desk Windows Desktop Application started.');
});

app.on('window-all-closed', async () => {
  await cleanupEphemeralTempDir();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

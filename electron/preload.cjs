const { contextBridge, ipcRenderer } = require('electron');

/**
 * Local Desk — Hardened Preload Context Bridge
 * Exposes strictly typed, permission-scoped desktop IPC methods and native window controls.
 * Raw Node.js file-system and OS process primitives are never exposed to the DOM.
 */
contextBridge.exposeInMainWorld('localDeskEnv', { shell: 'desktop' });

contextBridge.exposeInMainWorld('localDeskNative', {
  getRuntimeInfo: () => ipcRenderer.invoke('localdesk:get-runtime-info'),
  openFilesDialog: (options) => ipcRenderer.invoke('localdesk:open-files-dialog', options),
  saveFileDialog: (payload) => ipcRenderer.invoke('localdesk:save-file-dialog', payload),
  getRecentFiles: () => ipcRenderer.invoke('localdesk:get-recent-files'),
  openRecentFile: (filePath) => ipcRenderer.invoke('localdesk:open-recent-file', filePath),
  revealInExplorer: (filePath) => ipcRenderer.invoke('localdesk:reveal-in-explorer', filePath),

  // Native Desktop Window Controls
  minimizeWindow: () => ipcRenderer.invoke('localdesk:window-minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('localdesk:window-maximize-toggle'),
  closeWindow: () => ipcRenderer.invoke('localdesk:window-close'),
  getWindowState: () => ipcRenderer.invoke('localdesk:window-get-state'),
  onWindowStateChanged: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('localdesk:window-state-changed', listener);
    return () => ipcRenderer.removeListener('localdesk:window-state-changed', listener);
  },

  onFilesOpenedFromOS: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, files) => callback(files);
    ipcRenderer.on('localdesk:files-opened', listener);
    return () => ipcRenderer.removeListener('localdesk:files-opened', listener);
  }
});

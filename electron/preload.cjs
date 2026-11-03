'use strict';

/**
 * Local Desk — Hardened Preload Script (Context Bridge)
 *
 * Exposes ONLY narrowly-scoped, validated desktop operations to the renderer
 * under `window.localDeskNative`. Never exposes raw `ipcRenderer`, `fs`, or `child_process`.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('localDeskNative', {
  isDesktopApp: true,
  isAirGapped: true,
  platform: process.platform,
  arch: process.arch,

  openFileDialog: (options) => ipcRenderer.invoke('localdesk:open-file-dialog', options),
  openRecentPath: (filePath) => ipcRenderer.invoke('localdesk:open-recent-path', filePath),
  saveFileDialog: (payload) => ipcRenderer.invoke('localdesk:save-file-dialog', payload),

  getRecentFiles: () => ipcRenderer.invoke('localdesk:get-recent-files'),
  clearRecentFiles: () => ipcRenderer.invoke('localdesk:clear-recent-files'),

  getPreferences: () => ipcRenderer.invoke('localdesk:get-preferences'),
  setPreferences: (prefs) => ipcRenderer.invoke('localdesk:set-preferences', prefs),

  cleanupTempFiles: () => ipcRenderer.invoke('localdesk:cleanup-temp'),
  getDiagnostics: () => ipcRenderer.invoke('localdesk:get-diagnostics'),
  showItemInFolder: (fullPath) => ipcRenderer.invoke('localdesk:show-item-in-folder', fullPath),

  onOsOpenFile: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, filePath) => callback(filePath);
    ipcRenderer.on('localdesk:os-open-file', handler);
    return () => ipcRenderer.removeListener('localdesk:os-open-file', handler);
  },

  onMenuCommand: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, command) => callback(command);
    ipcRenderer.on('localdesk:menu-command', handler);
    return () => ipcRenderer.removeListener('localdesk:menu-command', handler);
  }
});

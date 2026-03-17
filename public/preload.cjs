const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', filePath, content),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  
  // Runner database sync
  saveRunnerDatabase: (filePath, content) => ipcRenderer.invoke('save-runner-database', filePath, content),
  loadRunnerDatabase: (filePath) => ipcRenderer.invoke('load-runner-database', filePath),
  
  // Shell operations
  openExternal: (path) => ipcRenderer.invoke('open-external', path),
  
  // Platform info
  platform: process.platform,
  isElectron: true
});

// Also expose as 'electron' for compatibility
contextBridge.exposeInMainWorld('electron', {
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', filePath, content),
  openExternal: (path) => ipcRenderer.invoke('open-external', path)
});

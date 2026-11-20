const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', filePath, content),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  
  // Binary file operations
  saveBinaryFile: (filePath, base64Content) => ipcRenderer.invoke('save-binary-file', filePath, base64Content),
  
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

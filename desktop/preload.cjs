const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('roseramDesktop', Object.freeze({
  version: '0.2.0',
  openProject: () => ipcRenderer.invoke('roseram:open-project'),
  saveProject: input => ipcRenderer.invoke('roseram:save-project', input),
  runCommand: input => ipcRenderer.invoke('roseram:run-project-command', input),
  checkUpdates: () => ipcRenderer.invoke('roseram:check-updates'),
}));

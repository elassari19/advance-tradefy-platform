import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => process.platform,

  saveFile: (options: { defaultPath?: string; filters?: Electron.FileFilter[]; content: string }) =>
    ipcRenderer.invoke('file:save', options),
  openFile: (options: { filters?: Electron.FileFilter[] }) =>
    ipcRenderer.invoke('file:open', options),

  showMessageBox: (options: Electron.MessageBoxOptions) =>
    ipcRenderer.invoke('dialog:message', options),
  showSaveDialog: (options: Electron.SaveDialogOptions) =>
    ipcRenderer.invoke('dialog:save', options),
  showOpenDialog: (options: Electron.OpenDialogOptions) =>
    ipcRenderer.invoke('dialog:open', options),

  showNotification: (title: string, body: string) =>
    ipcRenderer.invoke('notification:show', title, body),

  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),

});

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

  // ── 9.1 Custom Titlebar ──
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChanged: (callback: (maximized: boolean) => void) => {
    ipcRenderer.on('window:maximized-changed', (_event, maximized) => callback(maximized));
  },

  // ── 9.6 About Window ──
  openAbout: () => ipcRenderer.invoke('app:open-about'),

  // ── 9.4/9.5 File opened via file association or deep link ──
  onOpenFile: (callback: (filePath: string) => void) => {
    ipcRenderer.on('file:opened', (_event, filePath) => callback(filePath));
  },

  // ── Backtest Report Export ──
  saveHtmlReport: (htmlContent: string) =>
    ipcRenderer.invoke('backtest:save-html', htmlContent),
  savePngGraph: (base64Data: string) =>
    ipcRenderer.invoke('backtest:save-png', base64Data),

  // ── Backtest Data Flow (IPC proxy for HTTP requests only; WebSocket is direct) ──
  prepareBacktestData: (req: any) =>
    ipcRenderer.invoke('backtest:prepare-data', req),
  fetchBacktestHistory: (params: { symbol: string; interval: string; limit: number }) =>
    ipcRenderer.invoke('backtest:fetch-history', params),
});

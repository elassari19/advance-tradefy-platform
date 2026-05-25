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

  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChanged: (callback: (maximized: boolean) => void) => {
    ipcRenderer.on('window:maximized-changed', (_event, maximized) => callback(maximized));
  },

  openAbout: () => ipcRenderer.invoke('app:open-about'),

  onOpenFile: (callback: (filePath: string) => void) => {
    ipcRenderer.on('file:opened', (_event, filePath) => callback(filePath));
  },

  saveHtmlReport: (htmlContent: string) =>
    ipcRenderer.invoke('backtest:save-html', htmlContent),
  savePngGraph: (base64Data: string) =>
    ipcRenderer.invoke('backtest:save-png', base64Data),

  prepareBacktestData: (req: any) =>
    ipcRenderer.invoke('backtest:prepare-data', req),
  fetchBacktestHistory: (params: { symbol: string; interval: string; limit: number }) =>
    ipcRenderer.invoke('backtest:fetch-history', params),

  // ── Strategy Engine API ──
  deployStrategy: (params: { symbol: string; code: string; language?: string }) =>
    ipcRenderer.invoke('strategy:deploy', params),
  removeStrategy: (symbol: string) =>
    ipcRenderer.invoke('strategy:remove', symbol),
  getActiveStrategies: () =>
    ipcRenderer.invoke('strategy:active'),
  submitStrategyOrder: (order: { symbol: string; side: string; quantity: number; stopLoss?: number; takeProfit?: number }) =>
    ipcRenderer.invoke('strategy:submit-order', order),
  onStrategyLogs: (callback: (data: { symbol: string; messages: string[]; timestamp: number }) => void) => {
    ipcRenderer.on('strategy:logs', (_event, data) => callback(data));
  },
  onStrategyVisuals: (callback: (data: { symbol: string; plots: any[]; markers: any[]; drawings: any[] }) => void) => {
    ipcRenderer.on('strategy:visuals', (_event, data) => callback(data));
  },
  onStrategyStatus: (callback: (data: { symbol: string; active: boolean }) => void) => {
    ipcRenderer.on('strategy:status', (_event, data) => callback(data));
  },
});

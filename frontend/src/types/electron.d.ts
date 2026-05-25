interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  getPlatform: () => string;
  saveFile: (options: { defaultPath?: string; filters?: Electron.FileFilter[]; content: string }) => Promise<string | null>;
  openFile: (options: { filters?: Electron.FileFilter[] }) => Promise<{ filePath: string; content: string } | null>;
  showMessageBox: (options: Electron.MessageBoxOptions) => Promise<Electron.MessageBoxReturnValue>;
  showSaveDialog: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>;
  showOpenDialog: (options: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>;
  showNotification: (title: string, body: string) => void;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizedChanged: (callback: (maximized: boolean) => void) => void;
  openAbout: () => Promise<void>;
  onOpenFile: (callback: (filePath: string) => void) => void;
  saveHtmlReport: (htmlContent: string) => Promise<string | null>;
  savePngGraph: (base64Data: string) => Promise<string | null>;
  prepareBacktestData: (req: any) => Promise<any>;
  fetchBacktestHistory: (params: { symbol: string; interval: string; limit: number }) => Promise<any[]>;
  deployStrategy: (params: { symbol: string; code: string; language?: string }) => Promise<{ success: boolean; error?: string }>;
  removeStrategy: (symbol: string) => Promise<{ success: boolean }>;
  getActiveStrategies: () => Promise<string[]>;
  submitStrategyOrder: (order: { symbol: string; side: string; quantity: number; stopLoss?: number; takeProfit?: number }) => Promise<{ success: boolean; error?: string; id?: string }>;
  onStrategyLogs: (callback: (data: { symbol: string; messages: string[]; timestamp: number }) => void) => void;
  onStrategyVisuals: (callback: (data: { symbol: string; plots: any[]; markers: any[]; drawings: any[] }) => void) => void;
  onStrategyStatus: (callback: (data: { symbol: string; active: boolean }) => void) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};

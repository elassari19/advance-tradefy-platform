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
  onOpenFile: (callback: (filePath: string) => void) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

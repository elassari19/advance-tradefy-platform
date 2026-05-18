import { app, BrowserWindow, ipcMain, Menu, Notification, dialog, session } from 'electron';
import path from 'path';
import net from 'net';
import started from 'electron-squirrel-startup';

if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 700,
    title: 'Tradefy',
    backgroundColor: '#09090b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(process.resourcesPath, 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createApplicationMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Tradefy',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'About Tradefy',
              message: 'Tradefy',
              detail: `Version ${app.getVersion()}\nTrading Terminal Desktop App`,
            });
          },
        },
      ],
    },
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpcHandlers() {
  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('file:save', async (_event, options: { defaultPath?: string; filters?: Electron.FileFilter[]; content: string }) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: options.defaultPath,
      filters: options.filters,
    });
    if (!result.canceled && result.filePath) {
      await import('fs').then(fs => fs.promises.writeFile(result.filePath!, options.content, 'utf-8'));
      return result.filePath;
    }
    return null;
  });

  ipcMain.handle('file:open', async (_event, options: { filters?: Electron.FileFilter[] }) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: options.filters,
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const content = await import('fs').then(fs => fs.promises.readFile(result.filePaths[0], 'utf-8'));
      return { filePath: result.filePaths[0], content };
    }
    return null;
  });

  ipcMain.handle('dialog:message', async (_event, options: Electron.MessageBoxOptions) => {
    return dialog.showMessageBox(mainWindow!, options);
  });

  ipcMain.handle('dialog:save', async (_event, options: Electron.SaveDialogOptions) => {
    return dialog.showSaveDialog(mainWindow!, options);
  });

  ipcMain.handle('dialog:open', async (_event, options: Electron.OpenDialogOptions) => {
    return dialog.showOpenDialog(mainWindow!, options);
  });

  ipcMain.handle('notification:show', (_event, title: string, body: string) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  });

  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    mainWindow?.close();
  });
}

async function checkBackend(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(3000, '127.0.0.1');
  });
}

function setupCsp() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "connect-src 'self' http://127.0.0.1:3000 ws://127.0.0.1:3000; " +
          "img-src 'self' data:; " +
          "font-src 'self' data:;",
        ],
      },
    });
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  createWindow();
  createApplicationMenu();
  registerIpcHandlers();
  setupCsp();

  if (!await checkBackend()) {
    dialog.showMessageBox(mainWindow!, {
      type: 'warning',
      title: 'Backend Not Found',
      message: 'Could not connect to the backend at http://127.0.0.1:3000. Please ensure the server is running.',
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

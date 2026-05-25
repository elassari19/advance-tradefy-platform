import { app, BrowserWindow, ipcMain, Menu, Notification, dialog, session, Tray, nativeImage, crashReporter, SaveDialogOptions } from 'electron';
import path from 'path';
import net from 'net';
import WebSocket from 'ws';
import { autoUpdater } from 'electron-updater';
import started from 'electron-squirrel-startup';
import { ElectronStrategyRunner } from './strategy-runner';

if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let aboutWindow: BrowserWindow | null = null;
const strategyRunners = new Map<string, ElectronStrategyRunner>();
let marketDataWs: WebSocket | null = null;

const isDev = !app.isPackaged;

// ── 9.7 Crash Reporter ──
crashReporter.start({
  productName: 'Tradefy',
  companyName: 'Tradefy',
  submitURL: '',
  uploadToServer: false,
});

// ── 9.5 Deep Link Protocol ──
const PROTOCOL = 'tradefy';
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

// ── Single instance + 9.4/9.5 File association / Deep link ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const deepLink = argv.find(arg => arg.startsWith(`${PROTOCOL}://`));
    const filePath = argv.find(arg => !arg.startsWith('-') && arg.endsWith('.tradestrategy'));

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();

      if (deepLink) {
        mainWindow.webContents.send('file:opened', deepLink);
      } else if (filePath) {
        mainWindow.webContents.send('file:opened', filePath);
      }
    }
  });
}

// ── 9.4 macOS: file association open-file ──
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    mainWindow.webContents.send('file:opened', filePath);
    mainWindow.focus();
  }
});

// ── 9.5 macOS: deep link open-url ──
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow) {
    mainWindow.webContents.send('file:opened', url);
    mainWindow.focus();
  }
});

function createWindow(filePath?: string) {
  // ── 9.1 Custom Titlebar ──
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 700,
    title: 'Tradefy',
    backgroundColor: '#09090b',
    frame: false,
    titleBarStyle: 'hidden',
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

  // ── 9.1 Track maximize state for custom titlebar ──
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized-changed', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized-changed', false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (filePath) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow?.webContents.send('file:opened', filePath);
    });
  }
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
          click: () => createAboutWindow(),
        },
      ],
    },
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        {
          label: 'About Tradefy',
          click: () => createAboutWindow(),
        },
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

// ── 9.2 System Tray ──
function createTray() {
  try {
    const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
    const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });

    if (trayIcon.isEmpty()) return;

    tray = new Tray(trayIcon);
    tray.setToolTip('Tradefy');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Tradefy',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        label: 'Hide Tradefy',
        click: () => {
          mainWindow?.hide();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.focus();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
  } catch {
    // Tray not supported on this platform
  }
}

// ── 9.6 About Window ──
function createAboutWindow() {
  if (aboutWindow) {
    aboutWindow.focus();
    return;
  }

  aboutWindow = new BrowserWindow({
    width: 400,
    height: 350,
    resizable: false,
    maximizable: false,
    minimizable: false,
    title: 'About Tradefy',
    backgroundColor: '#09090b',
    parent: mainWindow!,
    modal: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const appVersion = app.getVersion();
  const electronVersion = process.versions.electron;
  const chromeVersion = process.versions.chrome;
  const nodeVersion = process.versions.node;
  const platform = process.platform;
  const year = new Date().getFullYear();

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #09090b;
      color: #e4e4e7;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      padding: 24px;
      text-align: center;
    }
    h1 { font-size: 20px; margin: 0 0 4px; color: #bfff1d; }
    .version { font-size: 13px; color: #a1a1aa; margin-bottom: 20px; }
    .detail { font-size: 12px; color: #71717a; line-height: 1.8; }
    .footer { margin-top: auto; font-size: 11px; color: #52525b; }
  </style>
</head>
<body>
  <h1>Tradefy</h1>
  <div class="version">Version ${appVersion}</div>
  <div class="detail">
    Electron: ${electronVersion}<br>
    Chrome: ${chromeVersion}<br>
    Node.js: ${nodeVersion}<br>
    Platform: ${platform}
  </div>
  <div class="footer">Copyright &copy; ${year}</div>
</body>
</html>`;

  aboutWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  aboutWindow.on('closed', () => {
    aboutWindow = null;
  });
}

// ── 9.3 Auto-Update ──
function setupAutoUpdater() {
  if (isDev) return;

  autoUpdater.logger = console;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Update Available',
      message: `Version ${info.version} is available.`,
      detail: 'Would you like to download the update?',
      buttons: ['Download', 'Later'],
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} has been downloaded.`,
      detail: 'Restart the app to apply the update.',
      buttons: ['Restart Now', 'Later'],
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (error) => {
    console.error('Auto-updater error:', error);
  });

  autoUpdater.checkForUpdates().catch((err) => {
    console.error('Auto-updater check failed:', err);
  });
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

  ipcMain.handle('backtest:save-html', async (_event, htmlContent: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: 'backtest-report.html',
      filters: [{ name: 'HTML', extensions: ['html'] }],
    });
    if (!result.canceled && result.filePath) {
      await import('fs').then(fs => fs.promises.writeFile(result.filePath!, htmlContent, 'utf-8'));
      return result.filePath;
    }
    return null;
  });

  ipcMain.handle('backtest:save-png', async (_event, base64Data: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: 'backtest-chart.png',
      filters: [{ name: 'PNG', extensions: ['png'] }],
    });
    if (!result.canceled && result.filePath) {
      const buffer = Buffer.from(base64Data, 'base64');
      await import('fs').then(fs => fs.promises.writeFile(result.filePath!, buffer));
      return result.filePath;
    }
    return null;
  });

  // ── Backtest Data Flow (proxy HTTP requests to Rust backend) ──
  ipcMain.handle('backtest:prepare-data', async (_event, req: any) => {
    try {
      const res = await fetch('http://127.0.0.1:3000/api/backtest/prepare-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  });

  ipcMain.handle('backtest:fetch-history', async (_event, params: { symbol: string; interval: string; limit: number }) => {
    try {
      const url = `http://127.0.0.1:3000/api/history?symbol=${encodeURIComponent(params.symbol)}&interval=${encodeURIComponent(params.interval)}&limit=${params.limit}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      if (Array.isArray(data)) {
        return data.map((c: any) => ({
          time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
        }));
      }
      return [];
    } catch {
      return [];
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

  // ── 9.1 Custom titlebar: query maximized state ──
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false);

  // ── 9.6 Open About Window ──
  ipcMain.handle('app:open-about', () => createAboutWindow());

  // ── Strategy Engine IPC ──
  ipcMain.handle('strategy:deploy', async (_event, params: { symbol: string; code: string; language?: string }) => {
    const normalizedSymbol = params.symbol.replace('/', '').toUpperCase();
    let runner = strategyRunners.get(normalizedSymbol);
    if (!runner) {
      runner = new ElectronStrategyRunner(mainWindow);
      strategyRunners.set(normalizedSymbol, runner);
    }
    const result = runner.load(normalizedSymbol, params.code);
    if (result.success) {
      startMarketDataConnection();
      mainWindow?.webContents.send('strategy:status', { symbol: normalizedSymbol, active: true });
    }
    return result;
  });

  ipcMain.handle('strategy:remove', async (_event, symbol: string) => {
    const normalized = symbol.replace('/', '').toUpperCase();
    const runner = strategyRunners.get(normalized);
    if (runner) {
      runner.cleanup();
      strategyRunners.delete(normalized);
    }
    mainWindow?.webContents.send('strategy:status', { symbol: normalized, active: false });
    return { success: true };
  });

  ipcMain.handle('strategy:active', async () => {
    return Array.from(strategyRunners.keys());
  });

  ipcMain.handle('strategy:submit-order', async (_event, order: { symbol: string; side: string; quantity: number; stopLoss?: number; takeProfit?: number }) => {
    try {
      const res = await fetch('http://127.0.0.1:3000/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: order.symbol,
          side: order.side,
          quantity: order.quantity,
          stop_loss: order.stopLoss,
          take_profit: order.takeProfit,
        }),
      });
      const data = await res.json().catch(() => ({}));
      return { success: res.ok, ...data };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });
}

function startMarketDataConnection(): void {
  if (marketDataWs && marketDataWs.readyState === WebSocket.OPEN) return;

  try {
    marketDataWs = new WebSocket('ws://127.0.0.1:3000/ws/live');

    marketDataWs.on('open', () => {
      console.log('[strategy-engine] Connected to market data');
    });

    marketDataWs.on('message', (data: WebSocket.Data) => {
      try {
        const tick = JSON.parse(data.toString());
        if (!tick || !tick.symbol) return;

        const runner = strategyRunners.get(tick.symbol);
        if (runner) {
          runner.addTick(tick);
        }
      } catch {}
    });

    marketDataWs.on('close', () => {
      marketDataWs = null;
      setTimeout(() => {
        if (strategyRunners.size > 0) {
          startMarketDataConnection();
        }
      }, 3000);
    });

    marketDataWs.on('error', () => {
      marketDataWs = null;
    });
  } catch {}
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
           "connect-src 'self' http://127.0.0.1:3000 ws://127.0.0.1:3000 http://localhost:3000 ws://localhost:3000; " +
          "img-src 'self' data:; " +
          "font-src 'self' data:; " +
          "worker-src 'self' blob:; " +
          "child-src 'self' blob:;",
        ],
      },
    });
  });
}

app.whenReady().then(async () => {
  createWindow();
  createApplicationMenu();
  registerIpcHandlers();
  setupCsp();
  createTray();
  setupAutoUpdater();

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

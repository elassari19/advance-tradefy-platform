# Electron Desktop App — Implementation Plan

## Overview

Wrap the existing Tradefy web trading terminal (Vite + React 19 + TypeScript + Tailwind CSS v4) into a cross-platform desktop application using Electron. The app communicates with a backend at `http://127.0.0.1:3000` via REST and WebSockets, and currently runs purely in the browser.

---

## 1. Project Structure

```
frontend/                         # existing Vite project (unchanged)
  src/
  public/
  package.json
  vite.config.ts
  ...

electron/                         # new Electron shell
  main.ts                         # Electron main process
  preload.ts                      # context bridge (IPC)
  tsconfig.json                   # Electron TypeScript config
  build/
    icon.icns                     # macOS icon
    icon.ico                      # Windows icon
    icon.png                      # Linux icon

package.json                      # root package orchestrating both
electron-builder.yml              # electron-builder config
```

---

## 2. Setup & Dependencies

### Root `package.json`

```jsonc
{
  "name": "tradefy",
  "private": true,
  "scripts": {
    "dev": "concurrently \"npm run dev:renderer\" \"npm run dev:electron\"",
    "dev:renderer": "vite --config frontend/vite.config.ts",
    "dev:electron": "wait-on http://localhost:5173 && electron electron/main.ts",
    "build": "npm run build:renderer && npm run build:electron",
    "build:renderer": "vite build --config frontend/vite.config.ts",
    "build:electron": "tsc -p electron/tsconfig.json",
    "package": "npm run build && electron-builder",
    "lint": "eslint frontend/ electron/"
  },
  "devDependencies": {
    "electron": "^35.0.0",              // latest stable
    "electron-builder": "^25.0.0",
    "concurrently": "^9.0.0",
    "wait-on": "^8.0.0"
  }
}
```

### Electron `electron/tsconfig.json`

```jsonc
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "../dist-electron",
    "rootDir": ".",
    "types": ["node"]
  },
  "include": ["main.ts", "preload.ts"]
}
```

---

## 3. Main Process (`electron/main.ts`)

Responsibilities:
- Create and manage the BrowserWindow
- Register IPC handlers (file I/O, native dialogs, app lifecycle)
- Set up application menu, tray icon (optional)
- Handle deep links / single-instance lock

```typescript
// electron/main.ts — skeleton
import { app, BrowserWindow, ipcMain, Menu, Tray, Notification, dialog } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

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
      contextIsolation: true,          // required for security
      nodeIntegration: false,          // required for security
      sandbox: false,                  // needed for preload to use Node APIs
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Single instance lock ──
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

app.whenReady().then(() => {
  createWindow();
  createApplicationMenu();
  registerIpcHandlers();
  // createTray();  // optional
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
```

### Key Main-Process Features

| Feature | Implementation |
|---|---|
| **Window management** | Standard BrowserWindow with dark background, min size constraints |
| **Dev/prod loading** | Dev → `http://localhost:5173` (Vite dev server), Prod → `file://` for built files |
| **Single-instance lock** | Prevent multiple app windows via `requestSingleInstanceLock()` |
| **Application menu** | Minimal Mac-style menu (File, Edit, View, Window, Help) |
| **Backend health check** | On startup, probe `http://127.0.0.1:3000` and show a dialog if unreachable |
| **Tray icon** | Optional: system tray with quick actions (show/hide, quit) |

---

## 4. Preload Script (`electron/preload.ts`)

Establishes a secure IPC bridge between renderer and main process using `contextBridge`.

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // ── App info ──
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => process.platform,

  // ── File I/O (for strategy export/import) ──
  saveFile: (options: { defaultPath?: string; filters?: Electron.FileFilter[]; content: string }) =>
    ipcRenderer.invoke('file:save', options),
  openFile: (options: { filters?: Electron.FileFilter[] }) =>
    ipcRenderer.invoke('file:open', options),

  // ── Native dialogs ──
  showMessageBox: (options: Electron.MessageBoxOptions) =>
    ipcRenderer.invoke('dialog:message', options),
  showSaveDialog: (options: Electron.SaveDialogOptions) =>
    ipcRenderer.invoke('dialog:save', options),
  showOpenDialog: (options: Electron.OpenDialogOptions) =>
    ipcRenderer.invoke('dialog:open', options),

  // ── Notifications ──
  showNotification: (title: string, body: string) =>
    ipcRenderer.invoke('notification:show', title, body),

  // ── Window controls ──
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),

  // ── File open from OS (optional) ──
  onOpenFile: (callback: (filePath: string) => void) =>
    ipcRenderer.on('file:opened', (_event, filePath) => callback(filePath)),
});
```

### Type Declaration for Renderer

Add a `src/types/electron.d.ts` file in the frontend:

```typescript
interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  getPlatform: () => string;
  saveFile: (options: { defaultPath?: string; filters?: Electron.FileFilter[]; content: string }) => Promise<string | null>;
  openFile: (options: { filters?: Electron.FileFilter[] }) => Promise<string | null>;
  showMessageBox: (options: Electron.MessageBoxOptions) => Promise<Electron.MessageBoxReturnValue>;
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
```

---

## 5. IPC Channels

| Channel | Direction | Purpose |
|---|---|---|
| `app:get-version` | Renderer → Main | Get app version for UI display |
| `file:save` | Renderer → Main | Save strategy code to `.py`/`.js` file |
| `file:open` | Renderer → Main | Open strategy code from file system |
| `dialog:message` | Renderer → Main | Show native message box |
| `dialog:save` | Renderer → Main | Show native save dialog |
| `dialog:open` | Renderer → Main | Show native open dialog |
| `notification:show` | Renderer → Main | Trigger native OS notification |
| `window:minimize` | Renderer → Main | Minimize window (custom titlebar) |
| `window:maximize` | Renderer → Main | Toggle maximize (custom titlebar) |
| `window:close` | Renderer → Main | Close window (custom titlebar) |
| `file:opened` | Main → Renderer | File opened via OS file association |

---

## 6. Vite Configuration Update

Modify `frontend/vite.config.ts` to support both web and Electron builds:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import electron from 'vite-plugin-electron';  // optional, or manual

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',                    // needed for file:// protocol in production
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
```

**Key change:** `base: './'` ensures assets load correctly with `file://` protocol in the packaged Electron app.

---

## 7. App Features — Electron-Specific Enhancements

### 7.1 Native Notifications

Replace browser `Notification` API with Electron's native notification via IPC:

**Current (App.tsx line 131):**
```typescript
if ('Notification' in window && Notification.permission === 'granted') {
  new Notification(`Alert: ${data.rule_name}`, { body: data.message, icon: '/vite.svg' });
}
```

**Electron version:**
```typescript
if (window.electronAPI) {
  window.electronAPI.showNotification(`Alert: ${data.rule_name}`, data.message);
} else {
  // fallback to browser notification
}
```

### 7.2 Strategy File Export/Import

Replace browser download with native save dialog:

**Current (BacktestResults.tsx):** Creates a blob URL and clicks a hidden anchor.

**Electron version:**
```typescript
// User clicks "Export CSV"
const filePath = await window.electronAPI.saveFile({
  defaultPath: `backtest-${symbol}-${Date.now()}.csv`,
  filters: [{ name: 'CSV', extensions: ['csv'] }],
  content: csvContent,
});
```

### 7.3 Custom Titlebar (Optional)

If desired, hide the native titlebar and render a custom one:

```typescript
// main.ts
const win = new BrowserWindow({
  frame: false,  // hides native titlebar
  titleBarStyle: 'hidden',  // macOS: keep traffic lights
  // ...
});
```

Then in React, render a titlebar component using `window.electronAPI.minimizeWindow()`, etc.

### 7.4 Auto-Update

Electron-builder supports auto-update via:
- **macOS:** `electron-updater` with S3 / GitHub Releases
- **Windows:** NSIS with auto-updater
- **Linux:** AppImage

Configure in `electron-builder.yml` and wire up `autoUpdater` in main process.

### 7.5 Backend Startup Detection

On launch, probe `http://127.0.0.1:3000/api/state`. If unreachable, show a dialog:

```typescript
// main.ts after window creation
import net from 'net';

function checkBackend(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(3000, '127.0.0.1');
  });
}

if (!await checkBackend()) {
  dialog.showMessageBox(mainWindow!, {
    type: 'warning',
    title: 'Backend Not Found',
    message: 'Could not connect to the backend at http://127.0.0.1:3000. Please ensure the server is running.',
  });
}
```

---

## 8. Window Management

| Feature | Detail |
|---|---|
| **Default size** | 1600 × 1000 |
| **Min size** | 1200 × 700 |
| **Background color** | `#09090b` (matches app theme) |
| **Frameless** | Optional — use `frame: false` with custom titlebar |
| **DevTools** | Open automatically in dev mode |
| **WebSecurity** | Keep enabled (do not disable for localhost — use proper CORS) |

---

## 9. Build & Packaging (`electron-builder.yml`)

```yaml
appId: com.tradefy.app
productName: Tradefy
copyright: Copyright © 2024

directories:
  output: release

files:
  - dist-electron
  - frontend/dist

mac:
  category: public.app-category.finance
  target:
    - target: dmg
      arch: [arm64, x64]
    - target: zip
      arch: [arm64, x64]
  icon: electron/build/icon.icns
  hardenedRuntime: true
  gatekeeperAssess: false

win:
  target:
    - target: nsis
      arch: [x64]
  icon: electron/build/icon.ico

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  deleteAppDataOnUninstall: false

linux:
  target:
    - target: AppImage
      arch: [x64]
    - target: deb
      arch: [x64]
  icon: electron/build/icon.png
  category: Finance
```

---

## 10. Development Workflow

```
npm run dev          # starts Vite dev server + Electron concurrently
                     # Vite on :5173, Electron loads :5173
                     # Electron auto-restarts on main process changes

npm run build        # builds renderer + compiles Electron TS
npm run package      # full build + packages .dmg/.exe/.AppImage
```

### Hot Reload Strategy

- **Renderer:** Vite HMR works normally for React changes
- **Main process:** Use `electron-rebuild` or simply restart Electron manually after changes

---

## 11. Security Considerations

| Concern | Mitigation |
|---|---|
| **Node access in renderer** | `contextIsolation: true`, `nodeIntegration: false` |
| **Content Security Policy** | Set CSP header in main process to restrict script sources |
| **Localhost backend** | Use `127.0.0.1` (already hardcoded); do NOT disable webSecurity |
| **File system access** | Only through explicit IPC handlers (no raw `require('fs')` in renderer) |
| **Auto-update** | Sign updates (macOS), use HTTPS for update server |

### Suggested CSP

```typescript
// main.ts
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [
        "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "connect-src 'self' http://127.0.0.1:3000 ws://127.0.0.1:3000; " +
        "img-src 'self' data:; " +
        "font-src 'self' data:;",
      ],
    },
  });
});
```

---

## 12. Implementation Steps (Ordered)

| Step | Description | Est. Effort |
|---|---|---|
| **1** | Create `electron/` directory, add `main.ts`, `preload.ts`, `tsconfig.json` | 2h |
| **2** | Update root `package.json` with Electron deps and scripts, run `npm install` | 1h |
| **3** | Update `vite.config.ts` (set `base: './'`) | 15min |
| **4** | Implement IPC handlers in main process (file dialogs, notifications, app info) | 2h |
| **5** | Create preload script with `contextBridge` API | 1h |
| **6** | Add TypeScript declarations for `window.electronAPI` in frontend | 30min |
| **7** | Update frontend code to use Electron APIs where available (notifications, file save) | 2h |
| **8** | Configure `electron-builder.yml` with icons | 1h |
| **9** | Test dev workflow: `npm run dev` launches both Vite and Electron | 1h |
| **10** | Test production build: `npm run package` creates distributable | 1h |
| **11** | Add backend health check on startup | 1h |
| **12** | Add auto-update support (electron-updater) | 2h |
| **13** | Add custom titlebar (optional) | 2h |
| **14** | Add system tray icon (optional) | 1h |
| **15** | Polish: app icon, About window, deep link support, file association | 2h |

**Total estimated effort:** ~20h

---

## 13. Potential Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Monaco Editor in Electron** | Monaco loads workers via `https://` by default. Configure `@monaco-editor/react` with a local worker source or bundled workers. |
| **Web Workers** (strategy-worker.ts) | Workers work in Electron with `nodeIntegration: false`. Test thoroughly; worker paths must resolve correctly with `file://`. |
| **WebSocket reconnection** | Already handled in frontend code. Test with backend restart. |
| **Tailwind v4 + Electron** | Tailwind v4 uses Vite plugin; works identically in Electron. No special handling needed. |
| **Asset paths in production** | `base: './'` + `loadFile()` ensures all relative asset paths resolve correctly. |
| **Performance** | Trading terminal with real-time WebSocket updates — no Electron-specific perf concerns beyond normal browser usage. |

---

## 14. Monaco Editor in Electron

The app uses `@monaco-editor/react` (CodeEditor.tsx, JsStrategyEditor.tsx). Monaco loads Web Workers from CDN by default. In Electron, workers need to be bundled:

```typescript
// In CodeEditor.tsx — configure loader
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

// Use bundled version instead of CDN
loader.config({ monaco });
```

Alternatively configure Monaco to load workers from local paths:

```typescript
// vite.config.ts — use vite-plugin-monaco-editor for worker bundling
import monacoEditorPlugin from 'vite-plugin-monaco-editor';

plugins: [
  react(),
  tailwindcss(),
  monacoEditorPlugin({
    languageWorkers: ['editorWorkerService', 'typescript', 'json'],
  }),
]
```

---

## 15. File Changes Summary

### New Files

| File | Purpose |
|---|---|
| `electron/main.ts` | Electron main process |
| `electron/preload.ts` | Context bridge / IPC |
| `electron/tsconfig.json` | TypeScript config for Electron |
| `electron/build/icon.icns` | macOS app icon |
| `electron/build/icon.ico` | Windows app icon |
| `electron/build/icon.png` | Linux app icon (512×512) |
| `electron-builder.yml` | Packaging configuration |
| `frontend/src/types/electron.d.ts` | Type declarations for `window.electronAPI` |

### Modified Files

| File | Change |
|---|---|
| `package.json` (root) | Add Electron scripts + dependencies |
| `frontend/vite.config.ts` | Add `base: './'` |
| `frontend/src/App.tsx` | Conditionally use `window.electronAPI` for notifications |
| `frontend/src/components/backtest/BacktestResults.tsx` | Use Electron save dialog for CSV export |
| `frontend/src/components/terminal/CodeEditor.tsx` | Use Electron file open/save for strategy files |
| `frontend/src/components/terminal/JsStrategyEditor.tsx` | Same as above |

---

## 16. Post-Implementation Checklist

- [ ] `npm run dev` launches Vite + Electron together
- [ ] `npm run package` produces a working DMG/EXE/AppImage
- [ ] All IPC channels work (file save/open, notifications, dialogs)
- [ ] Monaco Editor loads correctly (no CDN fetch failures)
- [ ] Web Workers (strategy-worker.ts) execute correctly
- [ ] WebSocket connections to backend work
- [ ] CSP headers don't block any necessary resources
- [ ] App icon renders correctly on all platforms
- [ ] Auto-update flow works (if configured)
- [ ] Backend health check shows dialog when backend is down
- [ ] Single-instance lock prevents duplicate windows

# Electron Desktop App — Task Checklist

## Phase 1: Project Setup

- [x] **1.1** Create `electron/` directory structure
  - [x] `electron/main.ts`
  - [x] `electron/preload.ts`
  - [x] `electron/tsconfig.json`
  - [ ] `electron/build/` (icon placeholder)
- [x] **1.2** Create root `package.json` with Electron scripts
  - [x] Add `dev`, `build`, `package`, `lint` scripts
  - [x] Add `concurrently`, `wait-on` devDeps (using Electron Forge instead of electron-builder)
  - [x] Run `npm install`
- [ ] **1.3** Create `electron-builder.yml` with multi-platform config (skipped — using Electron Forge)
- [ ] **1.4** Generate app icons
  - [ ] `electron/build/icon.icns` (macOS)
  - [ ] `electron/build/icon.ico` (Windows)
  - [ ] `electron/build/icon.png` 512x512 (Linux)

## Phase 2: Vite & TypeScript Configuration

- [x] **2.1** Update `frontend/vite.config.ts`
  - [x] Add `base: './'` for `file://` compatibility
  - [x] Set `server.port: 5173` and `strictPort: true`
- [x] **2.2** Create `electron/tsconfig.json` for main process
  - [x] target ES2023, module ESNext, bundler resolution
  - [x] outDir `../dist-electron`

## Phase 3: Electron Main Process

- [x] **3.1** Implement window creation (`BrowserWindow`)
  - [x] 1600×1000 default, 1200×700 min
  - [x] Background color `#09090b`
  - [x] `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`
- [x] **3.2** Dev/prod loading logic
  - [x] Dev: `loadURL('http://localhost:5173')` + open DevTools
  - [x] Prod: `loadFile(path.join(process.resourcesPath, 'dist', 'index.html'))`
- [x] **3.3** Single-instance lock via `app.requestSingleInstanceLock()`
- [x] **3.4** Application menu (File, Edit, View, Window, Help)
- [x] **3.5** Register IPC handlers
  - [x] `app:get-version` — return app version
  - [x] `file:save` — write file via save dialog
  - [x] `file:open` — read file via open dialog
  - [x] `dialog:message` — native message box
  - [x] `dialog:save` — native save dialog
  - [x] `dialog:open` — native open dialog
  - [x] `notification:show` — native OS notification
  - [x] `window:minimize` — minimize window
  - [x] `window:maximize` — toggle maximize
  - [x] `window:close` — close window
- [x] **3.6** Backend health check on startup
  - [x] Probe `127.0.0.1:3000` with TCP socket (2s timeout)
  - [x] Show warning dialog if unreachable
- [x] **3.7** Content Security Policy via `session.defaultSession.webRequest.onHeadersReceived`

## Phase 4: Preload & IPC Bridge

- [x] **4.1** Create `electron/preload.ts` with `contextBridge.exposeInMainWorld`
  - [x] Expose `electronAPI` with all IPC methods
- [x] **4.2** Create `frontend/src/types/electron.d.ts`
  - [x] `ElectronAPI` interface
  - [x] Global `Window.electronAPI` declaration

## Phase 5: Frontend Integration

- [ ] **5.1** Update `App.tsx` — notifications
  - [ ] Replace browser `Notification` API with `window.electronAPI?.showNotification()`
  - [ ] Keep fallback for web
- [ ] **5.2** Update `BacktestResults.tsx` — CSV export
  - [ ] Use `window.electronAPI?.saveFile()` instead of blob + anchor click
- [ ] **5.3** Update `CodeEditor.tsx` — file open/save for strategy `.py` files
  - [ ] Export strategy code via native save dialog
  - [ ] Import strategy code via native open dialog
- [ ] **5.4** Update `JsStrategyEditor.tsx` — same file open/save for `.js` files

## Phase 6: Monaco Editor in Electron

- [ ] **6.1** Install `vite-plugin-monaco-editor` devDep
- [ ] **6.2** Update `frontend/vite.config.ts` to include Monaco worker plugin
- [ ] **6.3** Configure `@monaco-editor/react` loader to use bundled workers (no CDN)
- [ ] **6.4** Verify Monaco loads in production build without network requests

## Phase 7: Build & Package Testing

- [ ] **7.1** Run `npm run build` — verify renderer + Electron compile
- [ ] **7.2** Run `npm run package` on macOS — verify .dmg output
- [ ] **7.3** Run `npm run package` on Windows — verify .exe output (if possible)
- [ ] **7.4** Test packaged app launches and loads correctly
- [ ] **7.5** Verify all asset paths resolve (favicon, icons, etc.)

## Phase 8: Verification Tests

- [ ] **8.1** `npm run dev` launches Vite + Electron concurrently
- [ ] **8.2** All IPC channels work (file save/open, notifications, dialogs)
- [ ] **8.3** Monaco Editor loads without CDN fetch failures
- [ ] **8.4** Web Workers (`strategy-worker.ts`) execute correctly
- [ ] **8.5** WebSocket connections to backend work
- [ ] **8.6** CSP headers don't block resources
- [ ] **8.7** App icon renders correctly
- [ ] **8.8** Backend health check shows dialog when backend is down
- [ ] **8.9** Single-instance lock prevents duplicate windows
- [ ] **8.10** Cross-platform: verify on macOS, Windows, Linux

## Phase 9: Optional Enhancements

- [ ] **9.1** Custom titlebar (`frame: false` + React Titlebar component)
- [ ] **9.2** System tray icon with quick actions
- [ ] **9.3** Auto-update via `electron-updater`
  - [ ] macOS: code signing + notarization
  - [ ] Windows: NSIS auto-updater
  - [ ] Linux: AppImage update
- [ ] **9.4** File association (`.tradestrategy` files open in app)
- [ ] **9.5** Deep link support (`tradefy://`)
- [ ] **9.6** About window with version info
- [ ] **9.7** Crash reporter

---

**Total tasks:** 72 / **Core required:** 51 / **Optional:** 21

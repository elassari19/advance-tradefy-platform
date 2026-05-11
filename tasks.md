# Task Checklist: Tradefy Live Trading Terminal

- `[x]` **Phase 0: Project Initialization**
  - `[x]` Initialize `frontend/` directory (Vite React + TS)
  - `[x]` Install frontend core libraries (`tailwindcss`, `lucide-react`, `@monaco-editor/react`, `lightweight-charts`)
  - `[x]` Initialize `backend/` directory (Rust Cargo Workspace)
  - `[x]` Install backend core crates (`axum`, `tokio`, `tokio-tungstenite`, `serde`/`serde_json`, `pyo3`, `reqwest`, `sqlx`)

- `[x]` **Phase 1: Foundation & Live Data**
  - `[x]` Build Rust WebSocket client to connect to exchange and parse ticks
  - `[x]` Build Axum WebSocket server endpoint (`/ws/live`) to broadcast ticks
  - `[x]` Build frontend "IDE Terminal" layout grid
  - `[x]` Connect frontend to Rust backend WebSocket and manage state
  - `[x]` Integrate TradingView Lightweight Charts and plot live data

- `[x]` **Phase 2: Paper Trading Simulator (Core Logic)**
  - `[x]` Create `SimulatorEngine` struct in Rust (tracks balance and open positions)
  - `[x]` Expose HTTP/WS endpoints to receive manual buy/sell orders
  - `[x]` Implement internal tick processor to automatically check/trigger TP/SL
  - `[x]` Build "Manual Order Panel" UI (Lot Size, TP, SL, Buy/Sell buttons)
  - `[x]` Wire order buttons to send payloads to the backend API
  - `[x]` Build "Open Positions & History" table component
  - `[x]` Implement interactive chart lines for drag-and-drop TP/SL management
  - `[x]` Add Close/Edit trade functionality (UI & Backend)

- `[/]` **Phase 3: Python Execution Engine & Webhooks**
  - `[ ]` Integrate `pyo3` into the Rust backend to embed Python
  - `[ ]` Create data bridge: call Python `on_tick(price)` on every live tick
  - `[ ]` Expose Rust `buy()` and `sell()` functions to Python
  - `[ ]` Integrate `reqwest` to dispatch JSON payloads to Webhook URLs
  - `[ ]` Integrate Monaco Editor component into the frontend
  - `[ ]` Add "Deploy Strategy" button to send code to Rust backend
  - `[ ]` Build Webhook configuration UI (URL and Secret Token)

- `[ ]` **Phase 4: Persistence & AI**
  - `[ ]` Set up PostgreSQL schema with `sqlx` migrations
  - `[ ]` Implement endpoints to save/load trade histories and backtest results
  - `[ ]` Implement autosave to dump open paper trades state to Postgres
  - `[ ]` Set up API proxy for AI provider (to hide keys)
  - `[ ]` Build AI Chat interface in the left sidebar
  - `[ ]` Wire chat input to the AI API proxy
  - `[ ]` Implement "Apply Code" button logic to inject AI code into Monaco Editor

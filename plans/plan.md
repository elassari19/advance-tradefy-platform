# Implementation Plan: Tradefy Live Trading Terminal

## Goal
Establish a clear, step-by-step technical implementation roadmap for building the Live Paper Trading Terminal & Signal Dispatcher. This plan separates backend and frontend tasks into discrete, AI-actionable units to facilitate smooth autonomous development.

## User Review Required
Please review the proposed tech stack and structural choices. Specifically:
> [!IMPORTANT]
> - **Frontend Framework:** I propose using **Vite (React + TypeScript)**. It is significantly faster and better suited for highly interactive, client-side heavy dashboards/terminals compared to Next.js (which excels at SEO/SSR). 
> - **Styling:** I propose using **Tailwind CSS** with **shadcn/ui** for rapid, gorgeous UI component development.
> - **Database ORM:** I propose using **sqlx** in Rust for database interactions as it provides compile-time checked queries.

## Open Questions
- **Live Data Source:** Which exchange API should we target first for live WebSockets? (e.g., Binance for Crypto, or Polygon.io for Stocks/Forex)?
- **AI Provider:** Do you prefer OpenAI or Anthropic for the chat assistant? Will you be providing the API key in a `.env` file?

---

## Proposed Changes

### Phase 0: Project Initialization
**Goal:** Install core dependencies and establish the monorepo structure.

#### [NEW] `frontend/` (Vite React + TS)
- Initialize Vite project.
- Install core libraries: `tailwindcss`, `lucide-react` (icons), `@monaco-editor/react`, `lightweight-charts`.

#### [NEW] `backend/` (Rust Cargo Workspace)
- Initialize Cargo binary project.
- Install core crates: `axum` (web framework), `tokio` (async runtime), `tokio-tungstenite` (websockets), `serde`/`serde_json`, `pyo3` (Python bindings), `reqwest` (HTTP client), `sqlx` (PostgreSQL).

---

### Phase 1: Foundation & Live Data
**Goal:** Connect to live market data and visualize it on the frontend.

#### Backend Tasks
- Build a WebSocket client to connect to the chosen exchange (e.g., Binance) and parse incoming tick data.
- Build an Axum WebSocket server endpoint (`/ws/live`) to broadcast received ticks to the connected frontend clients.

#### Frontend Tasks
- Build the "IDE Terminal" layout grid using CSS Grid/Flexbox (Left Sidebar, Header, Center Tabs, Right Panel).
- Connect to the Rust backend WebSocket and store live tick data in state.
- Integrate TradingView Lightweight Charts (as a placeholder) in the top-center panel and plot the incoming live data.

---

### Phase 2: Paper Trading Simulator (Core Logic)
**Goal:** Allow users to place manual trades and have the system track PnL and hit TP/SL.

#### Backend Tasks
- Create a `SimulatorEngine` struct in Rust to track `demo_balance` and a list of `open_positions`.
- Expose HTTP/WS endpoints to receive manual buy/sell orders from the frontend.
- Implement an internal tick processor: on every new live price tick, check if any open positions hit their Take Profit (TP) or Stop Loss (SL) and close them automatically.

#### Frontend Tasks
- Build the "Manual Order Panel" UI in the right sidebar (Lot Size, TP, SL inputs, Buy/Sell buttons).
- Wire the order buttons to send payloads to the backend API.
- Build the "Open Positions & History" table component in the bottom-center tabs to display active trades.

---

### Phase 3: Python Execution Engine & Webhooks
**Goal:** Execute custom Python strategies live and dispatch webhook signals.

#### Backend Tasks
- Integrate `pyo3` to embed a Python interpreter.
- Create the data bridge: Rust calls the Python function `on_tick(price)` every time a new live tick arrives.
- Expose Rust functions `buy()` and `sell()` to Python. When Python calls these, route the action to the `SimulatorEngine`.
- Integrate `reqwest`. When a trade executes (manual or bot), construct the JSON payload (defined in PRD) and spawn an async Tokio task to fire an HTTP POST to the configured Webhook URL.

#### Frontend Tasks
- Integrate the Monaco Editor component into the "Code Editor" tab.
- Add a "Deploy Strategy" button to send the Python code string to the Rust backend to be loaded into the PyO3 runtime.
- Build the Webhook configuration UI (URL input, Secret Token input) in the right sidebar.

---

### Phase 4: Persistence & AI
**Goal:** Save data to Postgres and integrate the AI assistant.

#### Backend Tasks
- Set up the PostgreSQL schema (as defined in PRD) using `sqlx` migrations.
- Implement endpoints to save and load trade histories and backtest results.
- Implement an autosave mechanism to dump open paper trades state to Postgres periodically for crash recovery.
- (Optional) Create an API proxy for OpenAI/Anthropic to keep API keys hidden on the backend.

#### Frontend Tasks
- Build the AI Chat interface in the left sidebar.
- Wire the chat input to the AI API (via backend proxy).
- Implement the "Apply Code" button logic to take code blocks from the AI chat and inject them directly into the Monaco editor state.

---

## Verification Plan

### Automated Tests
- **Backend:** Unit tests for `SimulatorEngine` to ensure trades are correctly opened, PnL is calculated accurately, and TP/SL triggers at exact price thresholds.
- **Backend:** Integration tests for the Python `pyo3` bridge to ensure memory safety when continuously passing ticks.

### Manual Verification
- **E2E Flow:** Place a manual trade on the UI, verify it appears in the "Open Positions" table, watch the live chart, and verify it closes automatically when the price hits the defined TP/SL.
- **Webhook Test:** Deploy a dummy Python strategy, point the webhook to a test catcher (e.g., webhook.site), and verify the JSON payload is received perfectly formatted upon signal generation.

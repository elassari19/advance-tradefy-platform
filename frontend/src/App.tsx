import { LayoutPanelLeft, LineChart, Play, Terminal } from "lucide-react";

function App() {
  return (
    <div className="terminal-grid bg-background text-foreground font-sans">
      {/* Header */}
      <header className="col-span-3 border-b border-border flex items-center justify-between px-6 bg-card/50 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground">
            <LineChart size={20} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Tradefy</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-secondary/50 rounded-full border border-border">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Live Connection</span>
          </div>
          <div className="text-sm font-mono bg-secondary px-3 py-1 rounded-md border border-border">
            Demo: <span className="text-green-400">$10,000.00</span>
          </div>
        </div>
      </header>

      {/* Left Sidebar - AI Chat Placeholder */}
      <aside className="border-r border-border p-4 bg-card/30">
        <div className="flex items-center gap-2 mb-6">
          <LayoutPanelLeft size={18} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">AI Assistant</h2>
        </div>
        <div className="flex flex-col gap-4 text-sm text-muted-foreground">
          <p>Initialize project... complete.</p>
          <p>Setting up Tradefy Terminal...</p>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex flex-col overflow-hidden bg-background">
        <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
          <div className="max-w-md space-y-4">
            <h2 className="text-3xl font-bold">Ready for Phase 1</h2>
            <p className="text-muted-foreground text-lg">
              Project initialized with React, TypeScript, Tailwind CSS v4, and core UI libraries.
            </p>
            <div className="flex justify-center gap-4 pt-4">
              <div className="p-3 bg-secondary rounded-xl border border-border">
                <Terminal size={24} />
              </div>
              <div className="p-3 bg-secondary rounded-xl border border-border">
                <Play size={24} />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Right Sidebar - Order Panel Placeholder */}
      <aside className="border-l border-border p-4 bg-card/30">
        <div className="flex items-center gap-2 mb-6">
          <Play size={18} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Order Panel</h2>
        </div>
      </aside>
    </div>
  );
}

export default App;

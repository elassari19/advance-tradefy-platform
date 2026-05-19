import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import type { BacktestEvent } from '../../hooks/useBacktest';

interface TesterJournalProps {
  events: BacktestEvent[];
}

const EVENT_TYPES = ['info', 'signal', 'order_open', 'order_close', 'order_modify', 'tp_hit', 'sl_hit', 'error'];

const EVENT_COLORS: Record<string, string> = {
  info: 'text-blue-400',
  signal: 'text-orange-400',
  order_open: 'text-green-400',
  order_close: 'text-red-400',
  order_modify: 'text-yellow-400',
  tp_hit: 'text-yellow-400',
  sl_hit: 'text-red-400',
  error: 'text-red-500',
};

const EVENT_LABELS: Record<string, string> = {
  info: 'INFO',
  signal: 'SIGNAL',
  order_open: 'ORDER',
  order_close: 'ORDER',
  order_modify: 'MODIFY',
  tp_hit: 'TP',
  sl_hit: 'SL',
  error: 'ERROR',
};

export const TesterJournal: React.FC<TesterJournalProps> = ({ events }) => {
  const [autoScroll, setAutoScroll] = useState(true);
  const [filters, setFilters] = useState<Set<string>>(new Set(EVENT_TYPES));
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; event?: BacktestEvent } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const filteredEvents = useMemo(() => {
    return events.filter(e => filters.has(e.event_type));
  }, [events, filters]);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [filteredEvents.length, autoScroll]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  const toggleFilter = (type: string) => {
    setFilters(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toISOString().slice(0, 16).replace('T', ' ');
  };

  const handleContextMenu = useCallback((e: React.MouseEvent, event: BacktestEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, event });
  }, []);

  const copyEntry = useCallback(async (event?: BacktestEvent) => {
    const ev = event || contextMenu?.event;
    if (!ev) return;
    const text = `[${formatTimestamp(ev.timestamp)}] ${EVENT_LABELS[ev.event_type] || ev.event_type} ${ev.description}`;
    try { await navigator.clipboard.writeText(text); } catch {}
    setContextMenu(null);
  }, [contextMenu]);

  const copyAll = useCallback(async () => {
    const text = filteredEvents.map(e =>
      `[${formatTimestamp(e.timestamp)}] ${EVENT_LABELS[e.event_type] || e.event_type} ${e.description}`
    ).join('\n');
    try { await navigator.clipboard.writeText(text); } catch {}
    setContextMenu(null);
  }, [filteredEvents]);

  const clearAll = useCallback(() => {
    setContextMenu(null);
  }, []);

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {EVENT_TYPES.map(type => (
            <button
              key={type}
              onClick={() => toggleFilter(type)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all border ${
                filters.has(type)
                  ? `${EVENT_COLORS[type]} bg-opacity-10 border-current`
                  : 'text-zinc-600 bg-zinc-900 border-zinc-800'
              }`}
            >
              {type.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={copyAll}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold text-zinc-500 hover:text-zinc-300"
            title="Copy All"
          >
            <Copy size={10} />
            All
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-lg font-mono text-[11px] leading-relaxed"
        style={{ minHeight: 0 }}
      >
        {filteredEvents.length === 0 ? (
          <div className="p-4 text-zinc-600 text-center text-[11px]">
            {events.length === 0 ? 'No events yet. Run a backtest to see the journal.' : 'No events match the current filters.'}
          </div>
        ) : (
          <div className="p-2">
            {filteredEvents.map((event, i) => (
              <div
                key={i}
                className="flex items-start gap-2 px-2 py-1 hover:bg-zinc-900/50 rounded group cursor-context-menu"
                onContextMenu={(e) => handleContextMenu(e, event)}
              >
                <span className="text-zinc-600 shrink-0 w-[90px] text-[10px]">
                  [{formatTimestamp(event.timestamp)}]
                </span>
                <span className={`shrink-0 w-12 text-[10px] font-bold ${EVENT_COLORS[event.event_type] || 'text-zinc-400'}`}>
                  {EVENT_LABELS[event.event_type] || event.event_type.toUpperCase()}
                </span>
                <span className="text-zinc-300">{event.description}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-1.5 shrink-0">
        <label className="flex items-center gap-1.5 text-[10px] text-zinc-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={e => setAutoScroll(e.target.checked)}
            className="accent-blue-500"
          />
          Auto-scroll
        </label>
        <span className="text-[10px] text-zinc-600">
          {filteredEvents.length} events
        </span>
        <button
          onClick={clearAll}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold text-zinc-500 hover:text-red-400 hover:bg-red-900/20 transition-all"
          title="Clear"
        >
          <Trash2 size={10} />
          Clear
        </button>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1 z-50 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => copyEntry(contextMenu.event)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-800 transition-colors text-left"
          >
            <Copy size={12} />
            Copy Entry
          </button>
          <button
            onClick={copyAll}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-800 transition-colors text-left"
          >
            <Copy size={12} />
            Copy All
          </button>
          <div className="h-px bg-zinc-800 my-1" />
          <button
            onClick={clearAll}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-red-400 hover:bg-zinc-800 transition-colors text-left"
          >
            <Trash2 size={12} />
            Clear
          </button>
        </div>
      )}
    </div>
  );
};

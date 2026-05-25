import { useState, useEffect, useRef, useCallback } from 'react';
import type { Candle } from './useMarketData';
import type { Drawing, StrategyPlotSeries, StrategyMarker, ShapeStyle } from '../components/Chart';
import * as ta from '../utils/strategy-dsl';

export interface LiveStrategyAPI {
  candles: Candle[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  time: number[];
  ta: typeof ta;
  plot: (series: number[], title?: string, color?: string, style?: string) => void;
  plotshape: (series: (number | boolean)[], title?: string, location?: string, style?: string, color?: string) => void;
  hline: (price: number, title?: string, color?: string) => void;
  drawRectangle: (id: string, x1Time: number, y1Price: number, x2Time: number, y2Price: number, color: string, fillColor?: string) => void;
  clearDrawings: () => void;
  buy: (qty?: number, sl?: number, tp?: number) => void;
  sell: (qty?: number, sl?: number, tp?: number) => void;
  closePosition: () => void;
  log: (msg: string) => void;
  state: Record<string, unknown>;
}

export interface StrategyOutput {
  drawings: Drawing[];
  plotSeries: StrategyPlotSeries[];
  markers: StrategyMarker[];
  logs: string[];
}

interface StrategySignal {
  action: 'BUY' | 'SELL' | 'CLOSE' | 'EXIT';
  quantity: number;
  takeProfit?: number;
  stopLoss?: number;
  price?: number;
  time?: number;
}

let _state: Record<string, unknown> = {};
export let globalStrategyLogs: string[] = [];
export function clearGlobalStrategyLogs() { globalStrategyLogs = []; }

const SHAPE_STYLE_MAP: Record<string, ShapeStyle> = {
  arrowup: 'arrow-up',
  arrowdown: 'arrow-down',
  circle: 'circle',
  square: 'square',
  diamond: 'diamond',
  cross: 'cross',
  xcross: 'xcross',
  triangleup: 'triangle-up',
  triangledown: 'triangle-down',
  labelup: 'arrow-up',
  labeldown: 'arrow-down',
};

async function submitOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number, stopLoss?: number, takeProfit?: number): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('http://127.0.0.1:3000/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol,
        side,
        quantity,
        stop_loss: stopLoss,
        take_profit: takeProfit,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      return { success: false, error: err.error || 'Order failed' };
    }
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function submitCloseOrder(symbol: string): Promise<{ success: boolean; error?: string }> {
  try {
    const stateRes = await fetch('http://127.0.0.1:3000/api/state');
    if (!stateRes.ok) return { success: false, error: 'Failed to get state' };
    const state = await stateRes.json();
    const position = state.open_positions?.find((p: { id: string; symbol: string }) => p.symbol === symbol);
    if (!position) return { success: true };

    const res = await fetch('http://127.0.0.1:3000/api/position/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: position.id }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      return { success: false, error: err.error || 'Close failed' };
    }
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function useLiveStrategy(code: string | null, candles: Candle[], symbol: string = 'BTCUSDT'): StrategyOutput {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [plotSeries, setPlotSeries] = useState<StrategyPlotSeries[]>([]);
  const [markers, setMarkers] = useState<StrategyMarker[]>([]);
  const [logsState, setLogsState] = useState<string[]>([]);
  const drawingsRef = useRef<Drawing[]>([]);
  const plotSeriesRef = useRef<StrategyPlotSeries[]>([]);
  const markersRef = useRef<StrategyMarker[]>([]);
  const fnRef = useRef<((api: LiveStrategyAPI) => void) | null>(null);
  const prevCandleTimeRef = useRef<number>(0);
  const prevLenRef = useRef<number>(0);
  const pendingSignalsRef = useRef<StrategySignal[]>([]);
  const logsRef = useRef<string[]>([]);

  useEffect(() => {
    _state = {};
    drawingsRef.current = [];
    plotSeriesRef.current = [];
    markersRef.current = [];
    logsRef.current = [];
    pendingSignalsRef.current = [];
    prevCandleTimeRef.current = 0;
    prevLenRef.current = 0;

    if (!code) {
      fnRef.current = null;
      return;
    }
    try {
      const processed = code.trim();

      const setupMatch = processed.match(/setup\s*\(\s*\)\s*\{([\s\S]*?)\n\s*\}/);
      const calculateSignature = processed.match(/calculate\s*\(\s*(\w+)\s*\)\s*\{([\s\S]*)\n\s*\}/);

      const _params: Record<string, unknown> = {};
      const wrapped = `
        'use strict';
        var _setupCode = ${setupMatch ? JSON.stringify(setupMatch[1]) : 'null'};
        var _calculateCode = ${calculateSignature ? JSON.stringify(calculateSignature[2]) : 'null'};
        var _paramName = ${calculateSignature ? JSON.stringify(calculateSignature[1]) : 'null'};
        return {
          setup: _setupCode ? function(params) {
            var fn = new Function('params', _setupCode);
            var result = fn(params) || {};
            if (typeof result === 'object') {
              Object.keys(result).forEach(function(k) { params[k] = result[k]; });
            }
          } : null,
          calculate: _calculateCode ? function(api) {
            var fn = new Function(_paramName || 'api', _calculateCode);
            fn(api);
          } : null,
        };
      `;
      const result = new Function(wrapped)();

      if (result.setup) {
        result.setup(_params);
      }

      fnRef.current = result.calculate;
    } catch (e) {
      console.error('Strategy compile error:', e);
      fnRef.current = null;
    }
  }, [code]);

  const addDrawing = useCallback((d: Drawing) => {
    drawingsRef.current = [...drawingsRef.current.filter(x => x.id !== d.id), d];
    setDrawings([...drawingsRef.current]);
  }, []);

  const clearDrawings = useCallback(() => {
    drawingsRef.current = [];
    setDrawings([]);
  }, []);

  useEffect(() => {
    const fn = fnRef.current;
    if (!fn || candles.length === 0) return;

    const latest = candles[candles.length - 1];
    if (latest.time === prevCandleTimeRef.current && candles.length === prevLenRef.current) return;

    prevCandleTimeRef.current = latest.time;
    prevLenRef.current = candles.length;

    const open = candles.map(c => c.open as number);
    const high = candles.map(c => c.high as number);
    const low = candles.map(c => c.low as number);
    const closePrices = candles.map(c => c.close as number);
    const volume = candles.map(c => c.volume as number);
    const time = candles.map(c => c.time as number);

    const close = new Proxy(() => {
      collectedMarkers.push({ time: time[idx], type: 'sell', price: closePrices[idx], text: 'CLOSE' });
      pendingSignals.push({ action: 'CLOSE', quantity: 0, price: closePrices[idx], time: time[idx] });
      addLog(`CLOSE signal: price=${closePrices[idx]}`);
    }, {
      get(t, prop) {
        return Reflect.get(closePrices, prop, closePrices);
      }
    }) as unknown as number[];

    const idx = candles.length - 1;
    const collectedPlots = new Map<string, { title: string; color: string; values: { time: number; value: number }[] }>();
    const collectedDrawings: Drawing[] = [...drawingsRef.current];
    const collectedMarkers: StrategyMarker[] = [...markersRef.current];

    const addLog = (msg: string) => {
      const entry = `[${new Date(time[idx] * 1000).toISOString()}] ${msg}`;
      logsRef.current = [...logsRef.current.slice(-99), entry];
      globalStrategyLogs = logsRef.current;
    };

    const pendingSignals: StrategySignal[] = [];

    const api: LiveStrategyAPI = {
      candles,
      open, high, low, close, volume, time,
      ta,
      plot: (series, title, color) => {
        if (!title) return;
        const c = color || '#bfff1d';
        const existing = collectedPlots.get(title);
        const filtered = series
          .map((v, i) => ({ time: time[i], value: v }))
          .filter(v => Number.isFinite(v.value));
        if (existing) {
          existing.values = existing.values.length > filtered.length ? existing.values : filtered;
        } else {
          collectedPlots.set(title, { title, color: c, values: filtered });
        }
      },
      plotshape: (series, title, location, style, color) => {
        if (!Array.isArray(series)) series = [series];
        const shapeStyle: ShapeStyle = SHAPE_STYLE_MAP[(style || 'arrowup').toLowerCase().replace(/\s/g, '')] || 'arrow-up';
        const c = color || '#bfff1d';
        const locationOffset = location === 'belowbar' ? 1 : -1;
        for (let i = 0; i < series.length; i++) {
          if (series[i]) {
            const price = closePrices[i] + locationOffset * (high[i] - low[i]) * 0.3;
            collectedDrawings.push({
              id: `shape-${title || 'shape'}-${idx}-${i}`,
              type: 'shape',
              points: [{ time: time[i], price }],
              color: c,
              shapeStyle,
              size: 10,
            });
          }
        }
      },
      hline: (price, title, color) => {
        collectedDrawings.push({
          id: `hline-${title || price}-${idx}`,
          type: 'horizontal-line',
          points: [{ time: 0, price }],
          color: color || '#ef4444',
          borderWidth: 1,
        });
      },
      drawRectangle: (id, x1Time, y1Price, x2Time, y2Price, color, fillColor) => {
        collectedDrawings.push({
          id,
          type: 'rectangle',
          points: [{ time: x1Time, price: y1Price }, { time: x2Time, price: y2Price }],
          color,
          fillColor: fillColor || color + '40',
        });
      },
      clearDrawings,
      buy: (qty, sl, tp) => {
        if (typeof sl === 'object' && sl !== null) { const o = sl as { sl?: number; tp?: number }; tp = o.tp; sl = o.sl; }
        const buyQty = qty || 0.1;
        collectedMarkers.push({ time: time[idx], type: 'buy', price: closePrices[idx], text: `B ${buyQty}` });
        pendingSignals.push({ action: 'BUY', quantity: buyQty, stopLoss: sl, takeProfit: tp, price: closePrices[idx], time: time[idx] });
        addLog(`BUY signal: qty=${buyQty} price=${closePrices[idx]}`);
      },
      sell: (qty, sl, tp) => {
        if (typeof sl === 'object' && sl !== null) { const o = sl as { sl?: number; tp?: number }; tp = o.tp; sl = o.sl; }
        const sellQty = qty || 0.1;
        collectedMarkers.push({ time: time[idx], type: 'sell', price: closePrices[idx], text: `S ${sellQty}` });
        pendingSignals.push({ action: 'SELL', quantity: sellQty, stopLoss: sl, takeProfit: tp, price: closePrices[idx], time: time[idx] });
        addLog(`SELL signal: qty=${sellQty} price=${closePrices[idx]}`);
      },
      closePosition: () => {
        collectedMarkers.push({ time: time[idx], type: 'sell', price: closePrices[idx], text: 'CLOSE' });
        pendingSignals.push({ action: 'CLOSE', quantity: 0, price: closePrices[idx], time: time[idx] });
        addLog(`CLOSE signal: price=${closePrices[idx]}`);
      },
      log: addLog,
      get state() { return _state; },
      set state(v) { _state = v; },
    };

    try {
      fn(api);
    } catch (e: unknown) {
      console.error('Strategy runtime error:', e);
      addLog(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
    }

    drawingsRef.current = collectedDrawings;
    setDrawings([...collectedDrawings]);

    const newPlotSeries = Array.from(collectedPlots.values()).map(p => ({
      id: `strategy-plot-${p.title}`,
      title: p.title,
      color: p.color,
      data: p.values,
    }));
    plotSeriesRef.current = newPlotSeries;
    setPlotSeries(newPlotSeries);

    markersRef.current = collectedMarkers;
    setMarkers([...collectedMarkers]);

    setLogsState([...logsRef.current]);

    const prevSignals = pendingSignalsRef.current;
    pendingSignalsRef.current = pendingSignals;

    for (const sig of pendingSignals) {
      const wasRecent = prevSignals.some(ps => ps.action === sig.action && Math.abs((ps.time || 0) - (sig.time || 0)) < 60);
      if (!wasRecent) {
        if (sig.action === 'CLOSE' || sig.action === 'EXIT') {
          submitCloseOrder(symbol.replace('/', '')).catch(console.error);
        } else {
          submitOrder(symbol.replace('/', ''), sig.action, sig.quantity, sig.stopLoss, sig.takeProfit).catch(console.error);
        }
      }
    }
  }, [candles, addDrawing, clearDrawings, symbol, code]);

  return { drawings, plotSeries, markers, logs: logsState };
}
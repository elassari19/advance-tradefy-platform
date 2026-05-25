import type { Candle } from '../hooks/useMarketData';

export function sma(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    result[i] = sum / period;
  }
  return result;
}

export function ema(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  const multiplier = 2 / (period + 1);
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) continue;
    if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += data[j];
      result[i] = sum / period;
    } else {
      result[i] = (data[i] - result[i - 1]) * multiplier + result[i - 1];
    }
  }
  return result;
}

export function rsi(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  let gains = 0, losses = 0;
  for (let i = 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    if (i <= period) {
      gains += Math.max(diff, 0);
      losses += Math.max(-diff, 0);
      if (i === period) {
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        result[i] = 100 - 100 / (1 + rs);
      }
    } else {
      const gain = Math.max(diff, 0);
      const loss = Math.max(-diff, 0);
      const avgGain = (gains * (period - 1) + gain) / period;
      const avgLoss = (losses * (period - 1) + loss) / period;
      gains = avgGain * period;
      losses = avgLoss * period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result[i] = 100 - 100 / (1 + rs);
    }
  }
  return result;
}

export function macd(data: number[], fast: number, slow: number, signal: number): { macd: number[]; signalLine: number[]; histogram: number[] } {
  const fastEMA = ema(data, fast);
  const slowEMA = ema(data, slow);
  const macdLine: number[] = new Array(data.length).fill(NaN);
  for (let i = 0; i < data.length; i++) {
    if (!isNaN(fastEMA[i]) && !isNaN(slowEMA[i])) {
      macdLine[i] = fastEMA[i] - slowEMA[i];
    }
  }
  const signalLine = ema(macdLine, signal);
  const histogram: number[] = new Array(data.length).fill(NaN);
  for (let i = 0; i < data.length; i++) {
    if (!isNaN(macdLine[i]) && !isNaN(signalLine[i])) {
      histogram[i] = macdLine[i] - signalLine[i];
    }
  }
  return { macd: macdLine, signalLine, histogram };
}

export function bb(data: number[], period: number, stddev: number): { upper: number[]; middle: number[]; lower: number[] } {
  const middle = sma(data, period);
  const upper: number[] = new Array(data.length).fill(NaN);
  const lower: number[] = new Array(data.length).fill(NaN);
  for (let i = period - 1; i < data.length; i++) {
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += (data[j] - middle[i]) ** 2;
    const std = Math.sqrt(sumSq / period);
    upper[i] = middle[i] + stddev * std;
    lower[i] = middle[i] - stddev * std;
  }
  return { upper, middle, lower };
}

export function atr(high: number[], low: number[], close: number[], period: number): number[] {
  const result: number[] = new Array(high.length).fill(NaN);
  const tr: number[] = new Array(high.length).fill(0);
  for (let i = 1; i < high.length; i++) {
    tr[i] = Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1]));
  }
  for (let i = period; i < high.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += tr[j];
    result[i] = sum / period;
  }
  return result;
}

export function stoch(high: number[], low: number[], close: number[], kPeriod: number, dPeriod: number): { k: number[]; d: number[] } {
  const rawK: number[] = new Array(high.length).fill(NaN);
  for (let i = kPeriod - 1; i < high.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (high[j] > hh) hh = high[j];
      if (low[j] < ll) ll = low[j];
    }
    rawK[i] = hh === ll ? 50 : ((close[i] - ll) / (hh - ll)) * 100;
  }
  const k = ema(rawK, 3);
  const d = ema(k, dPeriod);
  return { k, d };
}

export function vwap(high: number[], low: number[], close: number[], volume: number[]): number[] {
  const result: number[] = new Array(high.length).fill(NaN);
  let cumPV = 0, cumVol = 0;
  for (let i = 0; i < high.length; i++) {
    const typical = (high[i] + low[i] + close[i]) / 3;
    cumPV += typical * volume[i];
    cumVol += volume[i];
    result[i] = cumVol > 0 ? cumPV / cumVol : NaN;
  }
  return result;
}

export function crossover(a: number[], b: number[]): boolean[] {
  const result: boolean[] = new Array(a.length).fill(false);
  for (let i = 1; i < a.length; i++) {
    if (!isNaN(a[i - 1]) && !isNaN(b[i - 1]) && !isNaN(a[i]) && !isNaN(b[i])) {
      result[i] = a[i - 1] <= b[i - 1] && a[i] > b[i];
    }
  }
  return result;
}

export function crossunder(a: number[], b: number[]): boolean[] {
  const result: boolean[] = new Array(a.length).fill(false);
  for (let i = 1; i < a.length; i++) {
    if (!isNaN(a[i - 1]) && !isNaN(b[i - 1]) && !isNaN(a[i]) && !isNaN(b[i])) {
      result[i] = a[i - 1] >= b[i - 1] && a[i] < b[i];
    }
  }
  return result;
}

export function highest(data: number[], length: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  for (let i = length - 1; i < data.length; i++) {
    let h = -Infinity;
    for (let j = i - length + 1; j <= i; j++) if (data[j] > h) h = data[j];
    result[i] = h;
  }
  return result;
}

export function lowest(data: number[], length: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  for (let i = length - 1; i < data.length; i++) {
    let l = Infinity;
    for (let j = i - length + 1; j <= i; j++) if (data[j] < l) l = data[j];
    result[i] = l;
  }
  return result;
}

export function change(data: number[], length: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  for (let i = length; i < data.length; i++) {
    result[i] = data[i] - data[i - length];
  }
  return result;
}

export function alma(data: number[], length: number, offset: number, sigma: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  const m = Math.floor(offset * (length - 1));
  const s = length / sigma;
  for (let i = length - 1; i < data.length; i++) {
    let sum = 0, wsum = 0;
    for (let j = 0; j < length; j++) {
      const w = Math.exp(-((j - m) ** 2) / (2 * s * s));
      sum += w * data[i - length + 1 + j];
      wsum += w;
    }
    result[i] = wsum > 0 ? sum / wsum : NaN;
  }
  return result;
}

export function nz(value: number | null | undefined, fallback: number = 0): number {
  return value ?? fallback;
}

export function iff(condition: boolean, a: number, b: number): number {
  return condition ? a : b;
}

const ta = {
  sma, ema, rsi, macd, bb, atr, stoch, vwap,
  crossover, crossunder, highest, lowest, change, alma,
  nz, iff,
};

export interface StrategySignal {
  action: 'BUY' | 'SELL' | 'CLOSE' | 'EXIT';
  quantity: number;
  takeProfit?: number;
  stopLoss?: number;
  price?: number;
  time?: number;
}

export interface StrategyConfig {
  title: string;
  overlay: boolean;
  initialCapital: number;
  commission: number;
  slippage: number;
}

export interface StrategyContext {
  candles: Candle[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  time: number[];
  barIndex: number;
  params: Record<string, number>;
  ta: typeof ta;
  plot: (series: number[], title?: string, color?: string, style?: string) => void;
  plotshape: (series: (number | boolean)[], title?: string, location?: string, style?: string, color?: string) => void;
  hline: (price: number, title?: string, color?: string) => void;
  buy: (qty?: number, sl?: number, tp?: number) => void;
  sell: (qty?: number, sl?: number, tp?: number) => void;
  close: () => void;
  log: (msg: string) => void;
}

const SHAPE_STYLE_MAP: Record<string, string> = {
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

export interface PlotSeries {
  id: string;
  title: string;
  color: string;
  data: { time: number; value: number }[];
}

export interface StrategyMarker {
  time: number;
  type: 'buy' | 'sell';
  price: number;
  text: string;
}

export interface Drawing {
  id: string;
  type: string;
  points: { time: number; price: number }[];
  color: string;
  shapeStyle?: string;
  borderWidth?: number;
  fillColor?: string;
  size?: number;
}

export interface StrategyResult {
  signals: StrategySignal[];
  plots: PlotSeries[];
  drawings: Drawing[];
  markers: StrategyMarker[];
  logs: string[];
  errors: string[];
}

export class StrategyRunner {
  private config: StrategyConfig = {
    title: 'Strategy',
    overlay: true,
    initialCapital: 10000,
    commission: 0.001,
    slippage: 0.0001,
  };
  private params: Record<string, number> = {};
  private lastError: string | null = null;

  load(code: string): { success: boolean; error?: string; config?: StrategyConfig } {
    this.lastError = null;
    try {
      const wrappedCode = `
        'use strict';
        var __strategyConfig__ = ${JSON.stringify(this.config)};
        var __params__ = {};
        ${code}
        return { config: __strategyConfig__, params: __params__ };
      `;
      const fn = new Function('ta', wrappedCode);
      const result = fn(ta);
      if (result.config) {
        this.config = { ...this.config, ...result.config };
      }
      if (result.params) {
        this.params = result.params;
      }
      return { success: true, config: this.config };
    } catch (e: any) {
      this.lastError = e.message;
      return { success: false, error: e.message };
    }
  }

  run(candles: Candle[], params?: Record<string, number>): StrategyResult {
    const result: StrategyResult = {
      signals: [],
      plots: [],
      drawings: [],
      markers: [],
      logs: [],
      errors: [],
    };

    const open = candles.map(c => c.open as number);
    const high = candles.map(c => c.high as number);
    const low = candles.map(c => c.low as number);
    const close = candles.map(c => c.close as number);
    const volume = candles.map(c => c.volume as number);
    const time = candles.map(c => c.time as number);

    const finalParams = { ...this.params, ...params };
    const plotsMap = new Map<string, { title: string; color: string; values: { time: number; value: number }[] }>();

    const positionSize = { current: 0 };
    const positionEntry = { price: 0 };

    const logs: string[] = [];
    const addLog = (msg: string) => logs.push(msg);

    const strategyCode = `
      'use strict';
      var open = __open__;
      var high = __high__;
      var low = __low__;
      var close = __close__;
      var volume = __volume__;
      var time = __time__;
      var bar = __bar__;
      var params = __params__;
      var ta = __ta__;
      var plotsMap = __plotsMap__;
      var positionSize = __positionSize__;
      var positionEntry = __positionEntry__;
      var signals = __signals__;
      var drawings = __drawings__;
      var markers = __markers__;
      var addLog = __addLog__;
      ${this._extractUserCode()}
      for (var i = 0; i < close.length; i++) {
        bar = i;
        try {
          if (typeof calculate === 'function') {
            calculate();
          }
        } catch (e) {
          signals.push({ type: 'error', message: 'Bar ' + i + ': ' + e.message });
        }
      }
    `;

    try {
      const fn = new Function(
        '__open__', '__high__', '__low__', '__close__', '__volume__', '__time__',
        '__bar__', '__params__', '__ta__', '__plotsMap__', '__positionSize__',
        '__positionEntry__', '__signals__', '__drawings__', '__markers__', '__addLog__',
        strategyCode
      );

      const signals: Array<{ type: string; [key: string]: any }> = [];
      const drawings: Drawing[] = [];

      fn(
        open, high, low, close, volume, time,
        0, finalParams, ta, plotsMap, positionSize, positionEntry,
        signals, drawings, markers, addLog
      );

      for (const sig of signals) {
        if (sig.type === 'signal') {
          result.signals.push(sig as StrategySignal);
        } else if (sig.type === 'error') {
          result.errors.push(sig.message as string);
        }
      }

      for (const d of drawings) {
        result.drawings.push(d);
      }

      for (const [title, p] of plotsMap) {
        result.plots.push({
          id: `strategy-plot-${title}`,
          title: p.title || title,
          color: p.color || '#bfff1d',
          data: p.values,
        });
      }

      result.logs = logs;

    } catch (e: any) {
      result.errors.push(e.message);
    }

    return result;
  }

  private _extractUserCode(): string {
    return '';
  }

  runOnCandle(candles: Candle[], onCandle: (ctx: StrategyContext) => void): void {
    const open = candles.map(c => c.open as number);
    const high = candles.map(c => c.high as number);
    const low = candles.map(c => c.low as number);
    const close = candles.map(c => c.close as number);
    const volume = candles.map(c => c.volume as number);
    const time = candles.map(c => c.time as number);

    const signals: StrategySignal[] = [];
    const plotsMap = new Map<string, { title: string; color: string; values: { time: number; value: number }[] }>();
    const drawings: Drawing[] = [];
    const markers: StrategyMarker[] = [];

    for (let i = 0; i < candles.length; i++) {
      const ctx: StrategyContext = {
        candles: candles.slice(0, i + 1),
        open, high, low, close, volume, time,
        barIndex: i,
        params: this.params,
        ta,
        plot: (series, title, color, style) => {
          const t = title || 'plot';
          const c = color || '#bfff1d';
          if (!plotsMap.has(t)) {
            plotsMap.set(t, { title: t, color: c, values: [] });
          }
          const p = plotsMap.get(t)!;
          p.values.push({ time: time[i], value: series[i] });
        },
        plotshape: (series, title, location, style, color) => {
          const shapeStyle = SHAPE_STYLE_MAP[(style || 'arrowup').toLowerCase().replace(/\s/g, '')] || 'arrow-up';
          const c = color || '#bfff1d';
          const locationOffset = location === 'belowbar' ? 1 : -1;
          for (let j = 0; j < series.length; j++) {
            if (series[j]) {
              const price = close[j] + locationOffset * (high[j] - low[j]) * 0.3;
              drawings.push({
                id: `shape-${title || 'shape'}-${j}`,
                type: 'shape',
                points: [{ time: time[j], price }],
                color: c,
                shapeStyle,
                size: 10,
              });
            }
          }
        },
        hline: (price, title, color) => {
          drawings.push({
            id: `hline-${title || price}`,
            type: 'horizontal-line',
            points: [{ time: 0, price }],
            color: color || '#ef4444',
            borderWidth: 1,
          });
        },
        buy: (qty, sl, tp) => {
          signals.push({ action: 'BUY', quantity: qty || 0.1, takeProfit: tp, stopLoss: sl, price: close[i], time: time[i] });
          markers.push({ time: time[i], type: 'buy', price: close[i], text: `B${qty ? ` ${qty}` : ''}` });
        },
        sell: (qty, sl, tp) => {
          signals.push({ action: 'SELL', quantity: qty || 0.1, takeProfit: tp, stopLoss: sl, price: close[i], time: time[i] });
          markers.push({ time: time[i], type: 'sell', price: close[i], text: `S${qty ? ` ${qty}` : ''}` });
        },
        close: () => {
          signals.push({ action: 'CLOSE', quantity: 0, price: close[i], time: time[i] });
        },
        log: (msg) => {},
      };

      try {
        onCandle(ctx);
      } catch (e: any) {
        console.error('Strategy error:', e);
      }
    }
  }

  getConfig(): StrategyConfig {
    return this.config;
  }

  getError(): string | null {
    return this.lastError;
  }

  setParams(params: Record<string, number>): void {
    this.params = { ...this.params, ...params };
  }

  getParams(): Record<string, number> {
    return { ...this.params };
  }
}

export function createStrategyAPI(params: {
  candles: Candle[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  time: number[];
  barIndex: number;
}): {
  api: StrategyContext;
  signals: StrategySignal[];
  plots: PlotSeries[];
  drawings: Drawing[];
  markers: StrategyMarker[];
  logs: string[];
} {
  const { candles, open, high, low, close, volume, time, barIndex } = params;
  const plotsMap = new Map<string, { title: string; color: string; values: { time: number; value: number }[] }>();
  const signals: StrategySignal[] = [];
  const drawings: Drawing[] = [];
  const markers: StrategyMarker[] = [];
  const logs: string[] = [];

  const api: StrategyContext = {
    candles,
    open, high, low, close, volume, time,
    barIndex,
    params: {},
    ta,
    plot: (series, title, color, style) => {
      const t = title || 'plot';
      const c = color || '#bfff1d';
      if (!plotsMap.has(t)) {
        plotsMap.set(t, { title: t, color: c, values: [] });
      }
      plotsMap.get(t)!.values.push({ time: time[barIndex], value: series[barIndex] });
    },
    plotshape: (series, title, location, style, color) => {
      const shapeStyle = SHAPE_STYLE_MAP[(style || 'arrowup').toLowerCase().replace(/\s/g, '')] || 'arrow-up';
      const c = color || '#bfff1d';
      const locationOffset = location === 'belowbar' ? 1 : -1;
      for (let j = 0; j < series.length; j++) {
        if (series[j]) {
          const price = close[j] + locationOffset * (high[j] - low[j]) * 0.3;
          drawings.push({
            id: `shape-${title || 'shape'}-${j}`,
            type: 'shape',
            points: [{ time: time[j], price }],
            color: c,
            shapeStyle,
            size: 10,
          });
        }
      }
    },
    hline: (price, title, color) => {
      drawings.push({
        id: `hline-${title || price}`,
        type: 'horizontal-line',
        points: [{ time: 0, price }],
        color: color || '#ef4444',
        borderWidth: 1,
      });
    },
    buy: (qty, sl, tp) => {
      signals.push({ action: 'BUY', quantity: qty || 0.1, takeProfit: tp, stopLoss: sl, price: close[barIndex], time: time[barIndex] });
      markers.push({ time: time[barIndex], type: 'buy', price: close[barIndex], text: `B${qty ? ` ${qty}` : ''}` });
    },
    sell: (qty, sl, tp) => {
      signals.push({ action: 'SELL', quantity: qty || 0.1, takeProfit: tp, stopLoss: sl, price: close[barIndex], time: time[barIndex] });
      markers.push({ time: time[barIndex], type: 'sell', price: close[barIndex], text: `S${qty ? ` ${qty}` : ''}` });
    },
    close: () => {
      signals.push({ action: 'CLOSE', quantity: 0, price: close[barIndex], time: time[barIndex] });
    },
    log: (msg) => {
      logs.push(`[${new Date(time[barIndex] * 1000).toISOString()}] ${msg}`);
    },
  };

  const plots: PlotSeries[] = Array.from(plotsMap.entries()).map(([title, p]) => ({
    id: `strategy-plot-${title}`,
    title: p.title || title,
    color: p.color || '#bfff1d',
    data: p.values,
  }));

  return { api, signals, plots, drawings, markers, logs };
}
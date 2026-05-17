import type { Candle } from '../hooks/useMarketData';

// ── TA Function Library (PineScript compatible) ──

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

// ── Strategy DSL types ──

export interface StrategyConfig {
  title: string;
  overlay: boolean;
  initialCapital: number;
  commission: number;
  slippage: number;
}

export interface StrategySignal {
  action: 'BUY' | 'SELL' | 'CLOSE' | 'EXIT';
  quantity: number;
  takeProfit?: number;
  stopLoss?: number;
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
  plot: (series: number[], title: string, color?: string, style?: string) => void;
  plotshape: (series: number[], title?: string, location?: string, style?: string) => void;
  hline: (price: number, title?: string, color?: string) => void;
}

const ta = {
  sma, ema, rsi, macd, bb, atr, stoch, vwap,
  crossover, crossunder, highest, lowest, change, alma,
};

// ── Strategy Runner ──

export class StrategyRunner {
  private config: StrategyConfig = {
    title: 'JS Strategy',
    overlay: true,
    initialCapital: 10000,
    commission: 0.001,
    slippage: 0.0001,
  };
  private setupFn: ((ctx: StrategyContext) => Record<string, number>) | null = null;
  private calculateFn: ((ctx: StrategyContext) => void) | null = null;

  load(code: string): { success: boolean; error?: string } {
    try {
      const wrapped = `
        return {
          config: __config,
          setup: ${this.extractSetup(code)},
          calculate: ${this.extractCalculate(code)},
        };
      `;
      const fn = new Function('__config', wrapped);
      const result = fn(this.config);
      if (result.setup) this.setupFn = result.setup;
      if (result.calculate) this.calculateFn = result.calculate;
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  private extractSetup(code: string): string {
    const match = code.match(/setup\s*\(\s*\)\s*\{([^}]*)\}/s);
    return match ? `function() { ${match[1]} }` : 'function() { return {}; }';
  }

  private extractCalculate(code: string): string {
    const match = code.match(/calculate\s*\(\s*ctx\s*\)\s*\{([^}]*)\}/s);
    return match ? `function(ctx) { ${match[1]} }` : 'function(ctx) {}';
  }

  run(candles: Candle[], params?: Record<string, number>): { signals: StrategySignal[]; plots: any[] } {
    if (!this.calculateFn) return { signals: [], plots: [] };

    const open = candles.map(c => c.open);
    const high = candles.map(c => c.high);
    const low = candles.map(c => c.low);
    const close = candles.map(c => c.close);
    const volume = candles.map(c => c.volume);
    const time = candles.map(c => c.time);

    const userParams = this.setupFn ? this.setupFn({
      candles, open, high, low, close, volume, time,
      barIndex: 0, params: params || {}, ta, plot: () => {}, plotshape: () => {}, hline: () => {},
      }) : {};

    const finalParams = { ...userParams, ...params };
    const signals: StrategySignal[] = [];
    const plots: any[] = [];
    let positionSize = 0;
    let positionAvgPrice = 0;

    for (let i = 0; i < candles.length; i++) {
      const ctx: StrategyContext = {
        candles: candles.slice(0, i + 1),
        open, high, low, close, volume, time,
        barIndex: i,
        params: finalParams,
        ta,
        plot: (series, title, color, style) => {
          const val = series[i];
          if (val !== undefined && !isNaN(val)) {
            plots.push({ time: time[i], value: val, title, color, style: style || 'line' });
          }
        },
        plotshape: (series, title, location, style) => {},
        hline: (price, title, color) => {
          plots.push({ type: 'hline', price, title, color });
        },
      };

      try {
        this.calculateFn(ctx);
      } catch {}
    }

    return { signals, plots };
  }

  getConfig(): StrategyConfig {
    return this.config;
  }
}

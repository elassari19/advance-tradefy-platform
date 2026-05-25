import vm from 'vm';
import { BrowserWindow } from 'electron';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  symbol: string;
  is_closed: boolean;
}

export interface Tick {
  symbol: string;
  price: number;
  time: number;
}

export interface StrategySignal {
  action: 'BUY' | 'SELL' | 'CLOSE' | 'EXIT';
  quantity: number;
  takeProfit?: number;
  stopLoss?: number;
  price?: number;
  time?: number;
}

interface StrategyPlot {
  title: string;
  color: string;
  values: { time: number; value: number }[];
}

interface StrategyMarker {
  time: number;
  type: 'buy' | 'sell';
  price: number;
  text: string;
}

interface StrategyDrawing {
  id: string;
  type: string;
  points: { time: number; price: number }[];
  color: string;
  shapeStyle?: string;
  size?: number;
}

const TA_CODE = `
function sma(data, period) {
  const result = new Array(data.length).fill(NaN);
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    result[i] = sum / period;
  }
  return result;
}

function ema(data, period) {
  const result = new Array(data.length).fill(NaN);
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

function rsi(data, period) {
  const result = new Array(data.length).fill(NaN);
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

function macd(data, fast, slow, signal) {
  const fastEMA = ema(data, fast);
  const slowEMA = ema(data, slow);
  const macdLine = new Array(data.length).fill(NaN);
  for (let i = 0; i < data.length; i++) {
    if (!isNaN(fastEMA[i]) && !isNaN(slowEMA[i])) {
      macdLine[i] = fastEMA[i] - slowEMA[i];
    }
  }
  const signalLine = ema(macdLine, signal);
  const histogram = new Array(data.length).fill(NaN);
  for (let i = 0; i < data.length; i++) {
    if (!isNaN(macdLine[i]) && !isNaN(signalLine[i])) {
      histogram[i] = macdLine[i] - signalLine[i];
    }
  }
  return { macd: macdLine, signalLine, histogram };
}

function bb(data, period, stddev) {
  const middle = sma(data, period);
  const upper = new Array(data.length).fill(NaN);
  const lower = new Array(data.length).fill(NaN);
  for (let i = period - 1; i < data.length; i++) {
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += (data[j] - middle[i]) ** 2;
    const std = Math.sqrt(sumSq / period);
    upper[i] = middle[i] + stddev * std;
    lower[i] = middle[i] - stddev * std;
  }
  return { upper, middle, lower };
}

function atr(high, low, close, period) {
  const result = new Array(high.length).fill(NaN);
  const tr = new Array(high.length).fill(0);
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

function stoch(high, low, close, kPeriod, dPeriod) {
  const rawK = new Array(high.length).fill(NaN);
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

function vwap(high, low, close, volume) {
  const result = new Array(high.length).fill(NaN);
  let cumPV = 0, cumVol = 0;
  for (let i = 0; i < high.length; i++) {
    const typical = (high[i] + low[i] + close[i]) / 3;
    cumPV += typical * volume[i];
    cumVol += volume[i];
    result[i] = cumVol > 0 ? cumPV / cumVol : NaN;
  }
  return result;
}

function crossover(a, b) {
  const result = new Array(a.length).fill(false);
  for (let i = 1; i < a.length; i++) {
    if (!isNaN(a[i - 1]) && !isNaN(b[i - 1]) && !isNaN(a[i]) && !isNaN(b[i])) {
      result[i] = a[i - 1] <= b[i - 1] && a[i] > b[i];
    }
  }
  return result;
}

function crossunder(a, b) {
  const result = new Array(a.length).fill(false);
  for (let i = 1; i < a.length; i++) {
    if (!isNaN(a[i - 1]) && !isNaN(b[i - 1]) && !isNaN(a[i]) && !isNaN(b[i])) {
      result[i] = a[i - 1] >= b[i - 1] && a[i] < b[i];
    }
  }
  return result;
}

function highest(data, length) {
  const result = new Array(data.length).fill(NaN);
  for (let i = length - 1; i < data.length; i++) {
    let h = -Infinity;
    for (let j = i - length + 1; j <= i; j++) if (data[j] > h) h = data[j];
    result[i] = h;
  }
  return result;
}

function lowest(data, length) {
  const result = new Array(data.length).fill(NaN);
  for (let i = length - 1; i < data.length; i++) {
    let l = Infinity;
    for (let j = i - length + 1; j <= i; j++) if (data[j] < l) l = data[j];
    result[i] = l;
  }
  return result;
}

function change(data, length) {
  const result = new Array(data.length).fill(NaN);
  for (let i = length; i < data.length; i++) {
    result[i] = data[i] - data[i - length];
  }
  return result;
}

function nz(value, fallback) { return value != null ? value : (fallback || 0); }
function iff(condition, a, b) { return condition ? a : b; }

function alma(data, length, offset, sigma) {
  const result = new Array(data.length).fill(NaN);
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
`;

function getWrappedStrategyCode(userCode: string, symbol: string): string {
  return `
${TA_CODE}

var _candles = [];
var _open = [];
var _high = [];
var _low = [];
var _close = [];
var _volume = [];
var _time = [];
var _symbol = '${symbol}';
var _signals = [];
var _plots = [];
var _drawings = [];
var _markers = [];
var _logs = [];
var _position = { size: 0, entryPrice: 0 };
var _params = {};

var ta = {
  sma: sma,
  ema: ema,
  rsi: rsi,
  macd: macd,
  bb: bb,
  atr: atr,
  stoch: stoch,
  vwap: vwap,
  crossover: crossover,
  crossunder: crossunder,
  highest: highest,
  lowest: lowest,
  change: change,
  nz: nz,
  iff: iff,
  alma: alma,
};

function plot(series, title, color, style) {
  if (!title) return;
  var c = color || '#bfff1d';
  _plots.push({ title: title, color: c, values: series.map(function(v, i) { return { time: _time[i], value: v }; }).filter(function(v) { return isFinite(v.value); }) });
}

function plotshape(series, title, location, style, color) {
  // markers are handled in the renderer
}

function hline(price, title, color) {
  _drawings.push({ id: 'hline-' + (title || price), type: 'hline', points: [{ time: 0, price: price }], color: color || '#ef4444' });
}

function buy(qty, sl, tp) {
  var idx = _close.length - 1;
  _signals.push({ action: 'BUY', quantity: qty || 0.1, stopLoss: sl, takeProfit: tp, price: _close[idx], time: _time[idx] });
  _markers.push({ time: _time[idx], type: 'buy', price: _close[idx], text: 'B' + (qty ? ' ' + qty : '') });
  _logs.push('BUY signal: qty=' + (qty || 0.1) + ' price=' + _close[idx]);
}

function sell(qty, sl, tp) {
  var idx = _close.length - 1;
  _signals.push({ action: 'SELL', quantity: qty || 0.1, stopLoss: sl, takeProfit: tp, price: _close[idx], time: _time[idx] });
  _markers.push({ time: _time[idx], type: 'sell', price: _close[idx], text: 'S' + (qty ? ' ' + qty : '') });
  _logs.push('SELL signal: qty=' + (qty || 0.1) + ' price=' + _close[idx]);
}

function close() {
  _signals.push({ action: 'CLOSE', quantity: 0 });
  _logs.push('CLOSE signal');
}

function log(msg) {
  _logs.push('[' + new Date().toISOString() + '] ' + msg);
}

var __hasSetup = false;
var __hasCalculate = false;

${userCode}

if (typeof setup === 'function') {
  __hasSetup = true;
  try {
    var result = setup(_params) || {};
    if (typeof result === 'object') {
      Object.keys(result).forEach(function(k) { _params[k] = result[k]; });
    }
  } catch(e) {
    _logs.push('Setup error: ' + e.message);
  }
}

if (typeof calculate === 'function') {
  __hasCalculate = true;
}
`;
}

export class ElectronStrategyRunner {
  private symbol: string = '';
  private code: string = '';
  private sandbox: any;
  private candles: Candle[] = [];
  private isActive: boolean = false;
  private mainWindow: BrowserWindow | null = null;
  private lastExecutedBar: number = -1;

  constructor(mainWindow: BrowserWindow | null) {
    this.mainWindow = mainWindow;
    this.candles = [];
  }

  load(symbol: string, code: string): { success: boolean; error?: string } {
    this.symbol = symbol;
    this.code = code;
    this.candles = [];
    this.lastExecutedBar = -1;

    try {
      const wrappedCode = getWrappedStrategyCode(code, symbol);
      this.sandbox = vm.createContext({
        console: {
          log: (...args: any[]) => this.sendLogs(args.join(' ')),
          error: (...args: any[]) => this.sendLogs('ERROR: ' + args.join(' ')),
        },
        Math,
        Date,
        JSON,
        Array,
        Object,
        String,
        Number,
        Boolean,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        Error,
      });

      this.sandbox._candles = this.candles;
      this.sandbox._open = [];
      this.sandbox._high = [];
      this.sandbox._low = [];
      this.sandbox._close = [];
      this.sandbox._volume = [];
      this.sandbox._time = [];
      this.sandbox._symbol = symbol;
      this.sandbox._signals = [];
      this.sandbox._plots = [];
      this.sandbox._drawings = [];
      this.sandbox._markers = [];
      this.sandbox._logs = [];
      this.sandbox._position = { size: 0, entryPrice: 0 };
      this.sandbox._params = {};

      vm.runInContext(wrappedCode, this.sandbox, {
        timeout: 5000,
        displayErrors: true,
      });

      this.isActive = true;
      const logs = this.sandbox._logs || [];
      this.sendLogs(`Strategy loaded: ${symbol}`, ...logs);
      return { success: true };
    } catch (e: any) {
      this.isActive = false;
      return { success: false, error: e.message };
    }
  }

  addCandle(candle: Candle): void {
    if (!this.isActive || !this.sandbox) return;

    this.candles.push(candle);
    const idx = this.candles.length - 1;

    this.sandbox._candles = this.candles.slice(-500);
    this.sandbox._open = this.candles.map(c => c.open).slice(-500);
    this.sandbox._high = this.candles.map(c => c.high).slice(-500);
    this.sandbox._low = this.candles.map(c => c.low).slice(-500);
    this.sandbox._close = this.candles.map(c => c.close).slice(-500);
    this.sandbox._volume = this.candles.map(c => c.volume).slice(-500);
    this.sandbox._time = this.candles.map(c => c.time).slice(-500);

    if (!this.sandbox.__hasCalculate) return;

    try {
      vm.runInContext('calculate()', this.sandbox, {
        timeout: 3000,
        displayErrors: true,
      });
    } catch (e: any) {
      this.sendLogs(`Runtime error at bar ${idx}: ${e.message}`);
    }

    const signals: StrategySignal[] = this.sandbox._signals || [];
    const markers: StrategyMarker[] = this.sandbox._markers || [];
    const drawings: StrategyDrawing[] = this.sandbox._drawings || [];
    const plots: StrategyPlot[] = this.sandbox._plots || [];
    const logs: string[] = this.sandbox._logs || [];

    this.sandbox._signals = [];

    if (signals.length > 0) {
      this.handleSignals(signals);
    }

    if (logs.length > 0) {
      this.sendLogs(...logs);
      this.sandbox._logs = [];
    }

    if (markers.length > 0 || plots.length > 0 || drawings.length > 0) {
      this.sendVisuals({ plots, markers, drawings });
    }

    this.lastExecutedBar = idx;
  }

  addTick(tick: Tick): void {
    if (!this.isActive || !this.sandbox || !this.sandbox.__hasCalculate) return;

    this.sandbox._currentPrice = tick.price;

    try {
      vm.runInContext('onTick(' + tick.price + ')', this.sandbox, {
        timeout: 1000,
        displayErrors: true,
      });
    } catch (e) {}

    const signals: StrategySignal[] = this.sandbox._signals || [];
    this.sandbox._signals = [];

    if (signals.length > 0) {
      this.handleSignals(signals);
    }
  }

  cleanup(): void {
    this.isActive = false;
    this.sandbox = null;
    this.candles = [];
  }

  seedHistory(candles: Candle[]): void {
    if (!this.isActive || !this.sandbox) return;

    this.candles = candles.slice(-500);
    this.sandbox._candles = this.candles;
    this.sandbox._open = this.candles.map(c => c.open);
    this.sandbox._high = this.candles.map(c => c.high);
    this.sandbox._low = this.candles.map(c => c.low);
    this.sandbox._close = this.candles.map(c => c.close);
    this.sandbox._volume = this.candles.map(c => c.volume);
    this.sandbox._time = this.candles.map(c => c.time);
  }

  private async handleSignals(signals: StrategySignal[]): Promise<void> {
    for (const sig of signals) {
      try {
        if (sig.action === 'CLOSE') {
          await fetch(`http://127.0.0.1:3000/api/position/close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: this.symbol }),
          });
        } else {
          await fetch('http://127.0.0.1:3000/api/order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symbol: this.symbol,
              side: sig.action,
              quantity: sig.quantity || 0.1,
              stop_loss: sig.stopLoss,
              take_profit: sig.takeProfit,
            }),
          });
        }
      } catch (e: any) {
        this.sendLogs(`Order error: ${e.message}`);
      }
    }
  }

  private sendLogs(...messages: string[]): void {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('strategy:logs', {
        symbol: this.symbol,
        messages,
        timestamp: Date.now(),
      });
    }
  }

  private sendVisuals(data: {
    plots: StrategyPlot[];
    markers: StrategyMarker[];
    drawings: StrategyDrawing[];
  }): void {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('strategy:visuals', {
        symbol: this.symbol,
        ...data,
      });
    }
  }
}
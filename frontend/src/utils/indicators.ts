import type { Candle } from '../hooks/useMarketData';

export type IndicatorType = 'sma' | 'ema' | 'rsi' | 'macd' | 'bollinger' | 'custom';

export interface IndicatorConfig {
  id: string;
  type: IndicatorType;
  period?: number;
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
  bbPeriod?: number;
  bbStdDev?: number;
  name?: string;
  script?: string;
  color: string;
}

export interface IndicatorValue {
  time: number;
  value: number;
}

export interface IndicatorLine {
  id: string;
  label: string;
  color: string;
  values: IndicatorValue[];
}

export interface CustomIndicatorDef {
  id: string;
  name: string;
  script: string;
  color: string;
}

export function calculateSMA(candles: Candle[], period: number): IndicatorValue[] {
  const result: IndicatorValue[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += candles[j].close;
    }
    result.push({ time: candles[i].time, value: sum / period });
  }
  return result;
}

export function calculateEMA(candles: Candle[], period: number): IndicatorValue[] {
  const result: IndicatorValue[] = [];
  const multiplier = 2 / (period + 1);
  let ema = 0;
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) continue;
    if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += candles[j].close;
      ema = sum / period;
    } else {
      ema = (candles[i].close - ema) * multiplier + ema;
    }
    result.push({ time: candles[i].time, value: ema });
  }
  return result;
}

export function calculateRSI(candles: Candle[], period: number): IndicatorValue[] {
  const result: IndicatorValue[] = [];
  let gains = 0, losses = 0;

  for (let i = 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (i <= period) {
      gains += Math.max(diff, 0);
      losses += Math.max(-diff, 0);
      if (i === period) {
        let avgGain = gains / period;
        let avgLoss = losses / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        result.push({ time: candles[i].time, value: 100 - 100 / (1 + rs) });
      }
    } else {
      const gain = Math.max(diff, 0);
      const loss = Math.max(-diff, 0);
      let avgGain = (gains * (period - 1) + gain) / period;
      let avgLoss = (losses * (period - 1) + loss) / period;
      gains = avgGain * period;
      losses = avgLoss * period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.push({ time: candles[i].time, value: 100 - 100 / (1 + rs) });
    }
  }
  return result;
}

export function calculateMACD(
  candles: Candle[],
  fastPeriod: number,
  slowPeriod: number,
  signalPeriod: number
): { macd: IndicatorValue[]; signal: IndicatorValue[]; histogram: IndicatorValue[] } {
  const fastEMA = calculateEMA(candles, fastPeriod);
  const slowEMA = calculateEMA(candles, slowPeriod);

  const fastMap = new Map<number, number>();
  fastEMA.forEach(v => fastMap.set(v.time, v.value));
  const slowMap = new Map<number, number>();
  slowEMA.forEach(v => slowMap.set(v.time, v.value));

  const macdLine: IndicatorValue[] = [];
  for (const v of fastEMA) {
    const slow = slowMap.get(v.time);
    if (slow !== undefined) {
      macdLine.push({ time: v.time, value: v.value - slow });
    }
  }

  const signal = calculateEMAFromValues(macdLine, signalPeriod);
  const signalMap = new Map<number, number>();
  signal.forEach(v => signalMap.set(v.time, v.value));

  const histogram: IndicatorValue[] = [];
  for (const v of macdLine) {
    const sig = signalMap.get(v.time);
    if (sig !== undefined) {
      histogram.push({ time: v.time, value: v.value - sig });
    }
  }

  return { macd: macdLine, signal, histogram };
}

function calculateEMAFromValues(values: IndicatorValue[], period: number): IndicatorValue[] {
  const result: IndicatorValue[] = [];
  if (values.length < period) return result;
  const multiplier = 2 / (period + 1);
  let ema = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue;
    if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += values[j].value;
      ema = sum / period;
    } else {
      ema = (values[i].value - ema) * multiplier + ema;
    }
    result.push({ time: values[i].time, value: ema });
  }
  return result;
}

export function calculateBollinger(
  candles: Candle[],
  period: number,
  stdDev: number
): { upper: IndicatorValue[]; middle: IndicatorValue[]; lower: IndicatorValue[] } {
  const middle = calculateSMA(candles, period);
  const middleMap = new Map<number, number>();
  middle.forEach(v => middleMap.set(v.time, v.value));

  const upper: IndicatorValue[] = [];
  const lower: IndicatorValue[] = [];

  for (let i = period - 1; i < candles.length; i++) {
    const time = candles[i].time;
    const mid = middleMap.get(time);
    if (mid === undefined) continue;

    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sumSq += (candles[j].close - mid) ** 2;
    }
    const std = Math.sqrt(sumSq / period);

    upper.push({ time, value: mid + stdDev * std });
    lower.push({ time, value: mid - stdDev * std });
  }

  return { upper, middle, lower };
}

export function calculateCustom(candles: Candle[], script: string): IndicatorValue[] {
  try {
    const fn = new Function('candles', script);
    const result = fn(candles);
    if (Array.isArray(result)) {
      return result as IndicatorValue[];
    }
    return [];
  } catch (e) {
    console.error('Custom indicator error:', e);
    return [];
  }
}

export function resolveIndicatorLines(candles: Candle[], config: IndicatorConfig): IndicatorLine[] {
  switch (config.type) {
    case 'sma': {
      const values = calculateSMA(candles, config.period || 20);
      return [{ id: config.id, label: `SMA(${config.period})`, color: config.color, values }];
    }
    case 'ema': {
      const values = calculateEMA(candles, config.period || 20);
      return [{ id: config.id, label: `EMA(${config.period})`, color: config.color, values }];
    }
    case 'rsi': {
      const values = calculateRSI(candles, config.period || 14);
      return [{ id: config.id, label: `RSI(${config.period})`, color: config.color, values }];
    }
    case 'macd': {
      const fp = config.fastPeriod || 12;
      const sp = config.slowPeriod || 26;
      const sigp = config.signalPeriod || 9;
      const { macd, signal, histogram } = calculateMACD(candles, fp, sp, sigp);
      return [
        { id: `${config.id}-macd`, label: `MACD(${fp},${sp})`, color: config.color, values: macd },
        { id: `${config.id}-signal`, label: `Signal(${sigp})`, color: '#f59e0b', values: signal },
        { id: `${config.id}-histogram`, label: `Histogram`, color: '#8b5cf6', values: histogram },
      ];
    }
    case 'bollinger': {
      const period = config.bbPeriod || 20;
      const std = config.bbStdDev || 2;
      const { upper, middle, lower } = calculateBollinger(candles, period, std);
      return [
        { id: `${config.id}-upper`, label: `BB Upper(${period})`, color: '#22c55e', values: upper },
        { id: `${config.id}-middle`, label: `BB Middle(${period})`, color: config.color, values: middle },
        { id: `${config.id}-lower`, label: `BB Lower(${period})`, color: '#ef4444', values: lower },
      ];
    }
    case 'custom': {
      const values = calculateCustom(candles, config.script || '');
      return [{ id: config.id, label: config.name || 'Custom', color: config.color, values }];
    }
  }
}

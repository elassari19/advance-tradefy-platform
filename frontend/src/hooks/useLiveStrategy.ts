import { useState, useEffect, useRef, useCallback } from 'react';
import type { Candle } from './useMarketData';
import type { Drawing, ShapeStyle, StrategyPlotSeries, StrategyMarker } from '../components/Chart';
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
  state: Record<string, any>;
}

export interface StrategyOutput {
  drawings: Drawing[];
  plotSeries: StrategyPlotSeries[];
  markers: StrategyMarker[];
}

let _state: Record<string, any> = {};

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

export function useLiveStrategy(code: string | null, candles: Candle[]): StrategyOutput {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [plotSeries, setPlotSeries] = useState<StrategyPlotSeries[]>([]);
  const [markers, setMarkers] = useState<StrategyMarker[]>([]);
  const drawingsRef = useRef<Drawing[]>([]);
  const plotSeriesRef = useRef<StrategyPlotSeries[]>([]);
  const markersRef = useRef<StrategyMarker[]>([]);
  const fnRef = useRef<((api: LiveStrategyAPI) => void) | null>(null);
  const prevCandleTimeRef = useRef<number>(0);
  const prevLenRef = useRef<number>(0);

  useEffect(() => {
    _state = {};
  }, [code]);

  useEffect(() => {
    if (!code) {
      fnRef.current = null;
      drawingsRef.current = [];
      plotSeriesRef.current = [];
      markersRef.current = [];
      setDrawings([]);
      setPlotSeries([]);
      setMarkers([]);
      return;
    }
    try {
      let processed = code.trim();
      if (processed.includes('export default') || processed.includes('calculate(ctx)')) {
        const match = processed.match(/calculate\s*\(\s*ctx\s*\)\s*\{([\s\S]*)\}/);
        if (match) {
          processed = match[1].replace(/ctx\./g, 'api.');
        }
      }
      const wrapped = `return function(api) { var ta = api.ta; ${processed} }`;
      fnRef.current = new Function(wrapped)() as (api: LiveStrategyAPI) => void;
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
    const close = candles.map(c => c.close as number);
    const volume = candles.map(c => c.volume as number);
    const time = candles.map(c => c.time as number);

    const collectedPlots = new Map<string, { title: string; color: string; values: { time: number; value: number }[] }>();
    const collectedDrawings: Drawing[] = [];
    const collectedMarkers: StrategyMarker[] = [];

    const api: LiveStrategyAPI = {
      candles,
      open, high, low, close, volume, time,
      ta,
      plot: (series, title, color, _style) => {
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
        const shapeStyle = SHAPE_STYLE_MAP[(style || 'arrowup').toLowerCase().replace(/\s/g, '')] || 'arrow-up';
        const c = color || '#bfff1d';
        const locationOffset = location === 'belowbar' ? 1 : -1;
        for (let i = 0; i < series.length; i++) {
          if (series[i]) {
            const price = close[i] + locationOffset * (high[i] - low[i]) * 0.3;
            collectedDrawings.push({
              id: `shape-${title || 'shape'}-${i}`,
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
        const c = color || '#ef4444';
        collectedDrawings.push({
          id: `hline-${title || price}`,
          type: 'horizontal-line',
          points: [{ time: 0, price }],
          color: c,
          borderWidth: 1,
        });
      },
      drawRectangle: (id, x1Time, y1Price, x2Time, y2Price, color, fillColor) => {
        addDrawing({
          id,
          type: 'rectangle',
          points: [{ time: x1Time, price: y1Price }, { time: x2Time, price: y2Price }],
          color,
          fillColor: fillColor || color + '40',
        });
      },
      clearDrawings,
      get state() { return _state; },
      set state(v) { _state = v; },
      buy: (qty, _sl, _tp) => {
        const idx = candles.length - 1;
        collectedMarkers.push({ time: time[idx], type: 'buy', price: close[idx], text: `B${qty ? ` ${qty}` : ''}` });
      },
      sell: (qty, _sl, _tp) => {
        const idx = candles.length - 1;
        collectedMarkers.push({ time: time[idx], type: 'sell', price: close[idx], text: `S${qty ? ` ${qty}` : ''}` });
      },
    };

    try {
      fn(api);
    } catch (e) {
      console.error('Strategy runtime error:', e);
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
    setMarkers(collectedMarkers);
  }, [candles, addDrawing, clearDrawings]);

  return { drawings, plotSeries, markers };
}

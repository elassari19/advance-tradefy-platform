import { useState, useEffect, useRef, useCallback } from 'react';
import type { Candle } from './useMarketData';
import type { Drawing } from '../components/Chart';
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
  hline: (price: number, title?: string, color?: string) => void;
  drawRectangle: (id: string, x1Time: number, y1Price: number, x2Time: number, y2Price: number, color: string, fillColor?: string) => void;
  clearDrawings: () => void;
  state: Record<string, any>;
}

let _state: Record<string, any> = {};

export function useLiveStrategy(code: string | null, candles: Candle[]): Drawing[] {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const drawingsRef = useRef<Drawing[]>([]);
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
      setDrawings([]);
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
      const wrapped = `return function(api) { ${processed} };`;
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

    const api: LiveStrategyAPI = {
      candles,
      open: candles.map(c => c.open),
      high: candles.map(c => c.high),
      low: candles.map(c => c.low),
      close: candles.map(c => c.close),
      volume: candles.map(c => c.volume),
      time: candles.map(c => c.time),
      ta,
      plot: () => {},
      hline: () => {},
      get state() { return _state; },
      set state(v) { _state = v; },
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
    };

    try {
      fn(api);
    } catch (e) {
      console.error('Strategy runtime error:', e);
    }
  }, [candles, addDrawing, clearDrawings]);

  return drawings;
}

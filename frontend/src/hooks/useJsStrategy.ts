import { useState, useCallback, useRef, useEffect } from 'react';
import type { Candle } from './useMarketData';
import type { StrategySignal, StrategyRunner } from '../utils/strategy-dsl';

interface JsStrategyResult {
  signals: StrategySignal[];
  plots: Array<{ time: number; value: number; title?: string; color?: string; style?: string }>;
}

interface JsStrategyState {
  loaded: boolean;
  running: boolean;
  error: string | null;
  result: JsStrategyResult | null;
}

export function useJsStrategy() {
  const [state, setState] = useState<JsStrategyState>({
    loaded: false,
    running: false,
    error: null,
    result: null,
  });
  const workerRef = useRef<Worker | null>(null);
  const pendingResolveRef = useRef<((value: any) => void) | null>(null);

  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  const getWorker = useCallback((): Worker => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../utils/strategy-worker.ts', import.meta.url),
        { type: 'module' }
      );
      workerRef.current.onmessage = (event: MessageEvent) => {
        const { type, payload } = event.data;
        if (pendingResolveRef.current) {
          pendingResolveRef.current(payload);
          pendingResolveRef.current = null;
        }
        switch (type) {
          case 'loaded':
            setState(prev => ({ ...prev, loaded: payload.success, error: payload.error || null }));
            break;
          case 'result':
            setState(prev => ({ ...prev, running: false, result: payload }));
            break;
          case 'error':
            setState(prev => ({ ...prev, running: false, error: payload.error }));
            break;
        }
      };
    }
    return workerRef.current;
  }, []);

  const sendMessage = useCallback((type: string, payload: any): Promise<any> => {
    return new Promise((resolve) => {
      pendingResolveRef.current = resolve;
      getWorker().postMessage({ type, payload });
    });
  }, [getWorker]);

  const loadStrategy = useCallback(async (code: string) => {
    setState(prev => ({ ...prev, loaded: false, error: null }));
    const result = await sendMessage('load', { code });
    return result;
  }, [sendMessage]);

  const runStrategy = useCallback(async (candles: Candle[], params?: Record<string, number>) => {
    setState(prev => ({ ...prev, running: true, error: null }));
    const result = await sendMessage('run', { candles, params });
    return result;
  }, [sendMessage]);

  return {
    ...state,
    loadStrategy,
    runStrategy,
  };
}

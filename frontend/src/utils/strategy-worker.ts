import { StrategyRunner } from './strategy-dsl';
import type { Candle } from '../hooks/useMarketData';

// Web Worker for running JS strategies in a separate thread
let runner: StrategyRunner | null = null;

self.onmessage = (event: MessageEvent) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'load': {
      runner = new StrategyRunner();
      const result = runner.load(payload.code);
      self.postMessage({ type: 'loaded', payload: result });
      break;
    }

    case 'run': {
      if (!runner) {
        self.postMessage({ type: 'error', payload: { error: 'No strategy loaded' } });
        return;
      }
      const candles: Candle[] = payload.candles;
      const params = payload.params || {};
      const result = runner.run(candles, params);
      self.postMessage({ type: 'result', payload: result });
      break;
    }

    case 'config': {
      if (!runner) {
        self.postMessage({ type: 'error', payload: { error: 'No strategy loaded' } });
        return;
      }
      self.postMessage({ type: 'config', payload: runner.getConfig() });
      break;
    }

    default:
      self.postMessage({ type: 'error', payload: { error: `Unknown message type: ${type}` } });
  }
};

import { useState, useEffect, useRef, useCallback } from 'react';

export interface Tick {
  symbol: string;
  price: number;
  time: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

const API_URL = 'http://127.0.0.1:3000';

function formatSymbol(symbol: string): string {
  return symbol.replace('/', '');
}

function useMarketDataForSymbol(symbol: string, timeframe: number) {
  const [lastTick, setLastTick] = useState<Tick | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [updateCount, setUpdateCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const tickWs = useRef<WebSocket | null>(null);
  const candleWs = useRef<WebSocket | null>(null);
  const pendingCandlesRef = useRef<Map<number, Candle>>(new Map());
  const timeframeRef = useRef(timeframe);
  const mountedRef = useRef(true);

  useEffect(() => {
    timeframeRef.current = timeframe;
  }, [timeframe]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchHistory = useCallback(async (sym: string, tf: number) => {
    const binanceSymbol = formatSymbol(sym);
    const interval = tf >= 60 ? `${Math.floor(tf / 60)}h` : `${tf}m`;
    try {
      const res = await fetch(`${API_URL}/api/history?symbol=${binanceSymbol}&interval=${interval}&limit=1000`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0 && mountedRef.current) {
        const historical: Candle[] = data.map((c: any) => ({
          time: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));
        const map = new Map<number, Candle>();
        historical.forEach(c => map.set(c.time, c));
        pendingCandlesRef.current = map;
        const candlesArray = Array.from(pendingCandlesRef.current.values()).sort((a, b) => a.time - b.time);
        setCandles(candlesArray);
        setIsInitializing(false);
      }
    } catch (e) {
      console.error(`Failed to fetch history for ${sym}:`, e);
      if (mountedRef.current) setIsInitializing(false);
    }
  }, []);

  useEffect(() => {
    setIsInitializing(true);
    fetchHistory(symbol, timeframe);

    const connectTick = () => {
      tickWs.current = new WebSocket('ws://127.0.0.1:3000/ws/live');

      tickWs.current.onopen = () => {
        if (mountedRef.current) setIsConnected(true);
      };

      tickWs.current.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const tick: Tick = JSON.parse(event.data);
          if (tick.symbol !== formatSymbol(symbol)) return;
          setLastTick(tick);

          const tf = timeframeRef.current;
          const candleDuration = tf * 60 * 1000;
          const candleStart = Math.floor(tick.time / candleDuration) * candleDuration;
          const candleTime = candleStart / 1000;

          const current = pendingCandlesRef.current.get(candleTime);
          if (current) {
            current.high = Math.max(current.high, tick.price);
            current.low = Math.min(current.low, tick.price);
            current.close = tick.price;
          } else {
            pendingCandlesRef.current.set(candleTime, {
              time: candleTime,
              open: tick.price,
              high: tick.price,
              low: tick.price,
              close: tick.price,
            });
          }

          const candlesArray = Array.from(pendingCandlesRef.current.values())
            .sort((a, b) => a.time - b.time)
            .slice(-1000);
          setCandles(candlesArray);
          setUpdateCount(c => c + 1);
        } catch (e) {
          console.error('Error parsing tick data', e);
        }
      };

      tickWs.current.onclose = () => {
        if (mountedRef.current) {
          setIsConnected(false);
          setTimeout(connectTick, 3000);
        }
      };

      tickWs.current.onerror = () => {
        // Connection will close itself; onclose handles reconnection
      };
    };

    const connectCandle = () => {
      candleWs.current = new WebSocket('ws://127.0.0.1:3000/ws/candles');

      candleWs.current.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const raw: any = JSON.parse(event.data);
          if (raw.symbol !== formatSymbol(symbol)) return;

          const candle: Candle = {
            time: Math.floor(raw.time / 1000),
            open: raw.open,
            high: raw.high,
            low: raw.low,
            close: raw.close,
            volume: raw.volume,
          };

          const map = pendingCandlesRef.current;
          map.set(candle.time, candle);

          const candlesArray = Array.from(map.values())
            .sort((a, b) => a.time - b.time)
            .slice(-1000);
          setCandles(candlesArray);
          setUpdateCount(c => c + 1);
        } catch (e) {
          console.error('Error parsing candle data', e);
        }
      };

      candleWs.current.onclose = () => {
        if (mountedRef.current) {
          setTimeout(connectCandle, 3000);
        }
      };

      candleWs.current.onerror = () => {
        // Connection will close itself; onclose handles reconnection
      };
    };

    connectTick();
    connectCandle();

    return () => {
      mountedRef.current = false;
      tickWs.current?.close();
      candleWs.current?.close();
    };
  }, [symbol, timeframe, fetchHistory]);

  const changeTimeframe = useCallback((tf: number) => {
    fetchHistory(symbol, tf);
  }, [fetchHistory, symbol]);

  return { lastTick, candles, updateCount, isConnected, isInitializing, changeTimeframe };
}

export { useMarketDataForSymbol };

export const useMarketData = (symbol: string = 'BTC/USDT') => {
  const [timeframe, setTimeframe] = useState(5);
  const data = useMarketDataForSymbol(symbol, timeframe);
  return { ...data, timeframe, setTimeframe };
};

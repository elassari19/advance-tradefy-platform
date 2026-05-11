import { useEffect, useState, useRef, useCallback } from 'react';

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
}

const API_URL = 'http://localhost:3000';

function formatSymbol(symbol: string): string {
  return symbol.replace('/', '');
}

export const useMarketData = (symbol: string = 'BTC/USDT') => {
  const [lastTick, setLastTick] = useState<Tick | null>(null);
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [timeframe, setTimeframe] = useState(5);
  const ws = useRef<WebSocket | null>(null);
  const pendingCandlesRef = useRef<Map<number, Candle>>(new Map());
  const lastCandleTimeRef = useRef<number>(0);

  const fetchHistory = useCallback(async (sym: string, tf: number) => {
    const binanceSymbol = formatSymbol(sym);
    const interval = tf >= 60 ? `${Math.floor(tf / 60)}h` : `${tf}m`;
    try {
      const res = await fetch(`${API_URL}/api/history?symbol=${binanceSymbol}&interval=${interval}&limit=200`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
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
        lastCandleTimeRef.current = historical[historical.length - 1].time;
        const candlesArray = Array.from(pendingCandlesRef.current.values()).sort((a, b) => a.time - b.time);
        setCandles(candlesArray);
      }
    } catch (e) {
      console.error('Failed to fetch history:', e);
    }
  }, []);

  const updateCandles = useCallback((tick: Tick) => {
    const tf = timeframe;
    const candleDuration = tf * 60 * 1000;
    const candleStart = Math.floor(tick.time / candleDuration) * candleDuration;
    const candleTime = candleStart / 1000;

    const current = pendingCandlesRef.current.get(candleTime);

    if (current) {
      current.high = Math.max(current.high, tick.price);
      current.low = Math.min(current.low, tick.price);
      current.close = tick.price;
    } else {
      pendingCandlesRef.current.set(candleStart, {
        time: candleTime,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
      });
      lastCandleTimeRef.current = candleTime;
    }

    const candlesArray = Array.from(pendingCandlesRef.current.values())
      .sort((a, b) => a.time - b.time)
      .slice(-200);
    setCandles(candlesArray);
  }, [timeframe]);

  const changeTimeframe = useCallback((tf: number) => {
    setTimeframe(tf);
    fetchHistory(symbol, tf);
  }, [fetchHistory, symbol]);

  useEffect(() => {
    fetchHistory(symbol, timeframe);

    const connect = () => {
      ws.current = new WebSocket('ws://localhost:3000/ws/live');

      ws.current.onopen = () => {
        setIsConnected(true);
      };

      ws.current.onmessage = (event) => {
        try {
          const tick: Tick = JSON.parse(event.data);
          if (tick.symbol !== formatSymbol(symbol)) return;
          setLastTick(tick);
          setTicks((prev) => [...prev.slice(-100), tick]);
          updateCandles(tick);
        } catch (e) {
          console.error('Error parsing tick data', e);
        }
      };

      ws.current.onclose = () => {
        setIsConnected(false);
        setTimeout(connect, 3000);
      };

      ws.current.onerror = (error) => {
        console.error('WS Error:', error);
        ws.current?.close();
      };
    };

    connect();

    return () => {
      ws.current?.close();
    };
  }, [symbol, timeframe, fetchHistory, updateCandles]);

  return { lastTick, ticks, candles, isConnected, timeframe, setTimeframe: changeTimeframe };
};
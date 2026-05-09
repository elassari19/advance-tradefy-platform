import { useEffect, useState, useRef } from 'react';

export interface Tick {
  symbol: string;
  price: number;
  time: number;
}

export const useMarketData = (url: string = 'ws://localhost:3000/ws/live') => {
  const [lastTick, setLastTick] = useState<Tick | null>(null);
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    const connect = () => {
      console.log('Connecting to market data WS...');
      ws.current = new WebSocket(url);

      ws.current.onopen = () => {
        console.log('Connected to market data WS');
        setIsConnected(true);
      };

      ws.current.onmessage = (event) => {
        try {
          const tick: Tick = JSON.parse(event.data);
          setLastTick(tick);
          setTicks((prev) => [...prev.slice(-100), tick]); // Keep last 100 ticks
        } catch (e) {
          console.error('Error parsing tick data', e);
        }
      };

      ws.current.onclose = () => {
        console.log('Disconnected from market data WS');
        setIsConnected(false);
        // Reconnect after 3 seconds
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
  }, [url]);

  return { lastTick, ticks, isConnected };
};

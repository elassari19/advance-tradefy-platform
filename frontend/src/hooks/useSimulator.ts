import { useState, useEffect, useCallback } from 'react';

export type TradeSide = 'Buy' | 'Sell';

export type Position = {
  id: string;
  symbol: string;
  side: TradeSide;
  entry_price: number;
  quantity: number;
  take_profit: number | null;
  stop_loss: number | null;
  current_price: number;
  pnl: number;
  opened_at: number;
};

export type TradeHistory = {
  id: string;
  symbol: string;
  side: TradeSide;
  entry_price: number;
  exit_price: number;
  quantity: number;
  pnl: number;
  opened_at: number;
  closed_at: number;
  exit_reason: string;
};

export type SimulatorState = {
  balance: number;
  equity: number;
  open_positions: Position[];
  history: TradeHistory[];
};

export type OrderRequest = {
  symbol: string;
  side: TradeSide;
  quantity: number;
  take_profit: number | null;
  stop_loss: number | null;
};

export type WebhookConfig = {
  id: string;
  name: string;
  url: string;
  secret_token: string;
  enabled: boolean;
};

export function useSimulator() {
  const [state, setState] = useState<SimulatorState>({
    balance: 0,
    equity: 0,
    open_positions: [],
    history: [],
  });
  const [loading, setLoading] = useState(true);

  const fetchState = useCallback(async () => {
    try {
      const response = await fetch('http://127.0.0.1:3000/api/state');
      if (response.ok) {
        const data = await response.json();
        setState(data);
      }
    } catch {
      // Backend may not be ready yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 1000); // Poll every second
    return () => clearInterval(interval);
  }, [fetchState]);

  const placeOrder = useCallback(async (order: OrderRequest) => {
    try {
      const response = await fetch('http://127.0.0.1:3000/api/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(order),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to place order');
      }
      
      await fetchState();
    } catch (error) {
      console.error('Order error:', error);
      alert(error instanceof Error ? error.message : 'Order failed');
    }
  }, [fetchState]);

  const updatePosition = useCallback(async (id: string, take_profit: number | null, stop_loss: number | null) => {
    console.log('Updating position:', id, { take_profit, stop_loss });
    try {
      const response = await fetch('http://127.0.0.1:3000/api/position/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id, take_profit, stop_loss }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update position');
      }
      
      await fetchState();
    } catch (error) {
      console.error('Update position error:', error);
    }
  }, [fetchState]);

  const closePosition = useCallback(async (id: string) => {
    console.log('Closing position:', id);
    try {
      const response = await fetch('http://127.0.0.1:3000/api/position/close', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to close position');
      }
      
      await fetchState();
    } catch (error) {
      console.error('Close position error:', error);
    }
  }, [fetchState]);

  const deployStrategy = useCallback(async (symbol: string, code: string) => {
    const response = await fetch('http://127.0.0.1:3000/api/strategy/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, code }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to deploy strategy');
    }
  }, []);

  const removeStrategy = useCallback(async (symbol: string) => {
    const response = await fetch('http://127.0.0.1:3000/api/strategy/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to remove strategy');
    }
  }, []);

  const fetchActiveStrategies = useCallback(async (): Promise<string[]> => {
    try {
      const response = await fetch('http://127.0.0.1:3000/api/strategy/active');
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Backend may not be ready yet
    }
    return [];
  }, []);

  const saveWebhooks = useCallback(async (webhooks: WebhookConfig[]) => {
    const response = await fetch('http://127.0.0.1:3000/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhooks),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save webhooks');
    }
  }, []);

  const fetchWebhooks = useCallback(async () => {
    const response = await fetch('http://127.0.0.1:3000/api/webhooks');
    if (response.ok) {
      return await response.json();
    }
    return [];
  }, []);

  return { 
    state, 
    loading, 
    placeOrder, 
    updatePosition, 
    closePosition, 
    deployStrategy,
    removeStrategy,
    fetchActiveStrategies,
    saveWebhooks,
    fetchWebhooks,
    refresh: fetchState 
  };
}

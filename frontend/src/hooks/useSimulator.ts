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
  template?: string;
  retry_count?: number;
  timeout_ms?: number;
};

export type AlertActionConfig = {
  type: string;
  webhook_config_id?: string;
  url?: string;
  email?: string;
  enabled: boolean;
};

export type AlertRule = {
  id: string;
  name: string;
  symbol: string;
  timeframe: string;
  condition_type: string;
  condition_params: Record<string, unknown>;
  frequency: string;
  actions: AlertActionConfig[];
  enabled: boolean;
  created_at: number;
};

export type TriggeredAlert = {
  rule_id: string;
  rule_name: string;
  symbol: string;
  condition_type: string;
  message: string;
  timestamp: number;
};

export type WebhookLog = {
  id: string;
  webhook_config_id: string;
  event_type: string;
  payload: unknown;
  response_status: number | null;
  response_body: string | null;
  error: string | null;
  created_at: string;
};

const BASE_URL = 'http://127.0.0.1:3000';

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
      const response = await fetch(`${BASE_URL}/api/state`);
      if (response.ok) {
        const data = await response.json();
        setState(data);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 1000);
    return () => clearInterval(interval);
  }, [fetchState]);

  const placeOrder = useCallback(async (order: OrderRequest) => {
    try {
      const response = await fetch(`${BASE_URL}/api/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    try {
      const response = await fetch(`${BASE_URL}/api/position/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    try {
      const response = await fetch(`${BASE_URL}/api/position/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    const response = await fetch(`${BASE_URL}/api/strategy/deploy`, {
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
    const response = await fetch(`${BASE_URL}/api/strategy/remove`, {
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
      const response = await fetch(`${BASE_URL}/api/strategy/active`);
      if (response.ok) {
        return await response.json();
      }
    } catch {
    }
    return [];
  }, []);

  const saveWebhooks = useCallback(async (webhooks: WebhookConfig[]) => {
    const response = await fetch(`${BASE_URL}/api/webhooks`, {
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
    const response = await fetch(`${BASE_URL}/api/webhooks`);
    if (response.ok) {
      return await response.json();
    }
    return [];
  }, []);

  // ── Alert API ──

  const fetchAlerts = useCallback(async (): Promise<AlertRule[]> => {
    try {
      const response = await fetch(`${BASE_URL}/api/alerts`);
      if (response.ok) {
        return await response.json();
      }
    } catch {
    }
    return [];
  }, []);

  const saveAlert = useCallback(async (alert: Partial<AlertRule>): Promise<boolean> => {
    try {
      const response = await fetch(`${BASE_URL}/api/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alert),
      });
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  const deleteAlert = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`${BASE_URL}/api/alerts/${id}`, {
        method: 'DELETE',
      });
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  // ── Webhook Logs API ──

  const fetchWebhookLogs = useCallback(async (): Promise<WebhookLog[]> => {
    try {
      const response = await fetch(`${BASE_URL}/api/webhooks/logs`);
      if (response.ok) {
        return await response.json();
      }
    } catch {
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
    fetchAlerts,
    saveAlert,
    deleteAlert,
    fetchWebhookLogs,
    refresh: fetchState 
  };
}

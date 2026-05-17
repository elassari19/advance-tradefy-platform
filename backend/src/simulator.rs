use crate::models::{Candle, OrderRequest, Position, SimulatorState, Tick, TradeHistory, TradeSide};
use std::sync::Mutex;
use uuid::Uuid;

pub struct SimulatorEngine {
    state: Mutex<SimulatorState>,
}

impl SimulatorEngine {
    pub fn new(initial_balance: f64) -> Self {
        Self {
            state: Mutex::new(SimulatorState {
                balance: initial_balance,
                equity: initial_balance,
                open_positions: Vec::new(),
                history: Vec::new(),
            }),
        }
    }

    pub fn place_order(&self, request: OrderRequest, current_price: f64, timestamp: u64) -> Result<String, String> {
        let mut state = self.state.lock().map_err(|_| "Failed to lock state")?;
        
        let position = Position {
            id: Uuid::new_v4().to_string(),
            symbol: request.symbol,
            side: request.side,
            entry_price: current_price,
            quantity: request.quantity,
            take_profit: request.take_profit,
            stop_loss: request.stop_loss,
            current_price,
            pnl: 0.0,
            opened_at: timestamp,
        };

        state.open_positions.push(position.clone());
        Ok(position.id)
    }

    pub fn process_tick(&self, tick: &Tick) {
        let mut state = match self.state.lock() {
            Ok(s) => s,
            Err(_) => return,
        };

        let mut to_close = Vec::new();
        let mut total_pnl = 0.0;

        for (i, pos) in state.open_positions.iter_mut().enumerate() {
            if pos.symbol != tick.symbol {
                total_pnl += pos.pnl;
                continue;
            }

            pos.current_price = tick.price;
            pos.pnl = match pos.side {
                TradeSide::Buy => (tick.price - pos.entry_price) * pos.quantity,
                TradeSide::Sell => (pos.entry_price - tick.price) * pos.quantity,
            };

            total_pnl += pos.pnl;

            // Check TP/SL
            let mut close_reason = None;
            if let Some(tp) = pos.take_profit {
                if (pos.side == TradeSide::Buy && tick.price >= tp) || (pos.side == TradeSide::Sell && tick.price <= tp) {
                    close_reason = Some("Take Profit".to_string());
                }
            }
            if let Some(sl) = pos.stop_loss {
                if (pos.side == TradeSide::Buy && tick.price <= sl) || (pos.side == TradeSide::Sell && tick.price >= sl) {
                    close_reason = Some("Stop Loss".to_string());
                }
            }

            if let Some(reason) = close_reason {
                to_close.push((i, reason));
            }
        }

        // Handle closing in reverse order to keep indices valid
        for (idx, reason) in to_close.into_iter().rev() {
            let pos = state.open_positions.remove(idx);
            state.balance += pos.pnl;
            state.history.push(TradeHistory {
                id: pos.id,
                symbol: pos.symbol,
                side: pos.side,
                entry_price: pos.entry_price,
                exit_price: tick.price,
                quantity: pos.quantity,
                pnl: pos.pnl,
                opened_at: pos.opened_at,
                closed_at: tick.time,
                exit_reason: reason,
            });
        }

        state.equity = state.balance + total_pnl;
    }

    pub fn process_candle(&self, candle: &Candle) {
        let mut state = match self.state.lock() {
            Ok(s) => s,
            Err(_) => return,
        };

        let mut to_close = Vec::new();
        let mut total_pnl = 0.0;

        for (i, pos) in state.open_positions.iter_mut().enumerate() {
            if pos.symbol != candle.symbol {
                total_pnl += pos.pnl;
                continue;
            }

            pos.current_price = candle.close;
            pos.pnl = match pos.side {
                TradeSide::Buy => (candle.close - pos.entry_price) * pos.quantity,
                TradeSide::Sell => (pos.entry_price - candle.close) * pos.quantity,
            };

            total_pnl += pos.pnl;

            let mut close_reason = None;
            let mut exit_price = candle.close;

            match pos.side {
                TradeSide::Buy => {
                    if let Some(sl) = pos.stop_loss {
                        if candle.low <= sl {
                            close_reason = Some("Stop Loss".to_string());
                            exit_price = sl;
                        }
                    }
                    if close_reason.is_none() {
                        if let Some(tp) = pos.take_profit {
                            if candle.high >= tp {
                                close_reason = Some("Take Profit".to_string());
                                exit_price = tp;
                            }
                        }
                    }
                }
                TradeSide::Sell => {
                    if let Some(sl) = pos.stop_loss {
                        if candle.high >= sl {
                            close_reason = Some("Stop Loss".to_string());
                            exit_price = sl;
                        }
                    }
                    if close_reason.is_none() {
                        if let Some(tp) = pos.take_profit {
                            if candle.low <= tp {
                                close_reason = Some("Take Profit".to_string());
                                exit_price = tp;
                            }
                        }
                    }
                }
            }

            if let Some(reason) = close_reason {
                to_close.push((i, reason, exit_price));
            }
        }

        for (idx, reason, exit_price) in to_close.into_iter().rev() {
            let pos = state.open_positions.remove(idx);
            let pnl = match pos.side {
                TradeSide::Buy => (exit_price - pos.entry_price) * pos.quantity,
                TradeSide::Sell => (pos.entry_price - exit_price) * pos.quantity,
            };
            state.balance += pnl;
            state.history.push(TradeHistory {
                id: pos.id,
                symbol: pos.symbol,
                side: pos.side,
                entry_price: pos.entry_price,
                exit_price,
                quantity: pos.quantity,
                pnl,
                opened_at: pos.opened_at,
                closed_at: candle.time,
                exit_reason: reason,
            });
        }

        state.equity = state.balance + total_pnl;
    }

    pub fn update_position(&self, position_id: &str, tp: Option<f64>, sl: Option<f64>) -> Result<(), String> {
        let mut state = self.state.lock().map_err(|_| "Failed to lock state")?;
        if let Some(pos) = state.open_positions.iter_mut().find(|p| p.id == position_id) {
            pos.take_profit = tp;
            pos.stop_loss = sl;
            Ok(())
        } else {
            Err("Position not found".to_string())
        }
    }

    pub fn close_position(&self, position_id: &str, timestamp: u64) -> Result<(), String> {
        let mut state = self.state.lock().map_err(|_| "Failed to lock state")?;
        let pos_idx = state.open_positions.iter().position(|p| p.id == position_id);
        
        if let Some(idx) = pos_idx {
            let pos = state.open_positions.remove(idx);
            state.balance += pos.pnl;
            state.history.push(TradeHistory {
                id: pos.id,
                symbol: pos.symbol,
                side: pos.side,
                entry_price: pos.entry_price,
                exit_price: pos.current_price,
                quantity: pos.quantity,
                pnl: pos.pnl,
                opened_at: pos.opened_at,
                closed_at: timestamp,
                exit_reason: "Manual Close".to_string(),
            });
            Ok(())
        } else {
            Err("Position not found".to_string())
        }
    }

    pub fn get_state(&self) -> SimulatorState {
        self.state.lock().unwrap().clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_initial_state() {
        let engine = SimulatorEngine::new(10000.0);
        let state = engine.get_state();
        assert_eq!(state.balance, 10000.0);
        assert!(state.open_positions.is_empty());
        assert!(state.history.is_empty());
    }

    #[test]
    fn test_place_buy_order() {
        let engine = SimulatorEngine::new(10000.0);
        let order = OrderRequest {
            symbol: "BTCUSDT".into(), side: TradeSide::Buy, quantity: 1.0,
            take_profit: None, stop_loss: None,
        };
        let result = engine.place_order(order, 100.0, 0);
        assert!(result.is_ok());
        let state = engine.get_state();
        assert_eq!(state.open_positions.len(), 1);
        assert_eq!(state.open_positions[0].entry_price, 100.0);
    }

    #[test]
    fn test_tp_sl_within_candle() {
        let engine = SimulatorEngine::new(10000.0);
        let order = OrderRequest {
            symbol: "BTCUSDT".into(), side: TradeSide::Buy, quantity: 1.0,
            take_profit: Some(110.0), stop_loss: Some(90.0),
        };
        engine.place_order(order, 100.0, 0).unwrap();
        let candle = Candle {
            time: 60, open: 105.0, high: 112.0, low: 103.0, close: 108.0,
            volume: 1000.0, symbol: "BTCUSDT".into(), is_closed: true,
        };
        engine.process_candle(&candle);
        let state = engine.get_state();
        assert_eq!(state.open_positions.len(), 0);
        assert!(state.balance > 10000.0);
    }

    #[test]
    fn test_sl_hit_before_tp() {
        let engine = SimulatorEngine::new(10000.0);
        let order = OrderRequest {
            symbol: "BTCUSDT".into(), side: TradeSide::Buy, quantity: 1.0,
            take_profit: Some(110.0), stop_loss: Some(95.0),
        };
        engine.place_order(order, 100.0, 0).unwrap();
        let candle = Candle {
            time: 60, open: 99.0, high: 107.0, low: 94.0, close: 106.0,
            volume: 1000.0, symbol: "BTCUSDT".into(), is_closed: true,
        };
        engine.process_candle(&candle);
        let state = engine.get_state();
        assert_eq!(state.open_positions.len(), 0);
        assert!(state.balance < 10000.0);
    }

    #[test]
    fn test_close_position() {
        let engine = SimulatorEngine::new(10000.0);
        let order = OrderRequest {
            symbol: "BTCUSDT".into(), side: TradeSide::Buy, quantity: 1.0,
            take_profit: None, stop_loss: None,
        };
        let id = engine.place_order(order, 100.0, 0).unwrap();
        let state = engine.get_state();
        assert_eq!(state.open_positions.len(), 1);
        engine.close_position(&id, 100).unwrap();
        let state = engine.get_state();
        assert_eq!(state.open_positions.len(), 0);
        assert_eq!(state.history.len(), 1);
        assert_eq!(state.history[0].exit_reason, "Manual Close");
    }

    #[test]
    fn test_update_position_tp_sl() {
        let engine = SimulatorEngine::new(10000.0);
        let order = OrderRequest {
            symbol: "BTCUSDT".into(), side: TradeSide::Buy, quantity: 1.0,
            take_profit: None, stop_loss: None,
        };
        let id = engine.place_order(order, 100.0, 0).unwrap();
        engine.update_position(&id, Some(110.0), Some(95.0)).unwrap();
        let state = engine.get_state();
        assert_eq!(state.open_positions[0].take_profit, Some(110.0));
        assert_eq!(state.open_positions[0].stop_loss, Some(95.0));
    }

    #[test]
    fn test_process_tick_updates_price() {
        let engine = SimulatorEngine::new(10000.0);
        let order = OrderRequest {
            symbol: "BTCUSDT".into(), side: TradeSide::Buy, quantity: 1.0,
            take_profit: None, stop_loss: None,
        };
        engine.place_order(order, 100.0, 0).unwrap();
        engine.process_tick(&Tick { symbol: "BTCUSDT".into(), price: 105.0, time: 10 });
        let state = engine.get_state();
        assert_eq!(state.open_positions[0].current_price, 105.0);
        assert!(state.open_positions[0].pnl > 0.0);
    }
}

use crate::models::{BacktestEvent, Candle, OrderRequest, Position, SimulatorState, Tick, TradeHistory, TradeSide};
use std::sync::Mutex;
use uuid::Uuid;

fn make_event(timestamp: u64, event_type: &str, description: String, details: Option<serde_json::Value>) -> BacktestEvent {
    BacktestEvent {
        timestamp,
        event_type: event_type.to_string(),
        description,
        details,
    }
}

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

    pub fn place_order(&self, request: OrderRequest, current_price: f64, timestamp: u64) -> Result<(String, BacktestEvent), String> {
        let mut state = self.state.lock().map_err(|_| "Failed to lock state")?;
        
        let position = Position {
            id: Uuid::new_v4().to_string(),
            symbol: request.symbol.clone(),
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

        let side_str = format!("{:?}", request.side);
        let event = make_event(
            timestamp,
            "order_open",
            format!("{} {} @ {:.2}", side_str, request.quantity, current_price),
            Some(serde_json::json!({
                "id": position.id,
                "side": side_str,
                "quantity": request.quantity,
                "price": current_price,
                "symbol": request.symbol,
                "tp": request.take_profit,
                "sl": request.stop_loss,
            })),
        );

        Ok((position.id, event))
    }

    pub fn process_tick(&self, tick: &Tick) -> Vec<BacktestEvent> {
        let mut events = Vec::new();
        let mut state = match self.state.lock() {
            Ok(s) => s,
            Err(_) => return events,
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

            let mut close_reason = None;
            if let Some(tp) = pos.take_profit {
                if (pos.side == TradeSide::Buy && tick.price >= tp) || (pos.side == TradeSide::Sell && tick.price <= tp) {
                    close_reason = Some(("Take Profit".to_string(), "tp_hit".to_string()));
                }
            }
            if let Some(sl) = pos.stop_loss {
                if (pos.side == TradeSide::Buy && tick.price <= sl) || (pos.side == TradeSide::Sell && tick.price >= sl) {
                    close_reason = Some(("Stop Loss".to_string(), "sl_hit".to_string()));
                }
            }

            if let Some((reason, event_type)) = close_reason {
                to_close.push((i, reason, event_type));
            }
        }

        for (idx, reason, event_type) in to_close.into_iter().rev() {
            let pos = state.open_positions.remove(idx);
            let side_str = format!("{:?}", pos.side);
            let pnl = pos.pnl;
            let exit_price = tick.price;
            state.balance += pnl;
            state.history.push(TradeHistory {
                id: pos.id.clone(),
                symbol: pos.symbol.clone(),
                side: pos.side,
                entry_price: pos.entry_price,
                exit_price,
                quantity: pos.quantity,
                pnl,
                opened_at: pos.opened_at,
                closed_at: tick.time,
                exit_reason: reason.clone(),
                take_profit: pos.take_profit,
                stop_loss: pos.stop_loss,
            });

            events.push(make_event(
                tick.time,
                &event_type,
                format!("{} hit: {} {} @ {:.2} PnL: ${:.2}", reason, side_str, pos.quantity, exit_price, pnl),
                Some(serde_json::json!({
                    "id": pos.id,
                    "side": side_str,
                    "quantity": pos.quantity,
                    "entry_price": pos.entry_price,
                    "exit_price": exit_price,
                    "pnl": pnl,
                    "reason": reason,
                })),
            ));
        }

        state.equity = state.balance + total_pnl;
        events
    }

    pub fn process_candle(&self, candle: &Candle) -> Vec<BacktestEvent> {
        let mut events = Vec::new();
        let mut state = match self.state.lock() {
            Ok(s) => s,
            Err(_) => return events,
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

            let mut close_reason: Option<(String, String)> = None;
            let mut exit_price = candle.close;

            match pos.side {
                TradeSide::Buy => {
                    if let Some(sl) = pos.stop_loss {
                        if candle.low <= sl {
                            close_reason = Some(("Stop Loss".to_string(), "sl_hit".to_string()));
                            exit_price = sl;
                        }
                    }
                    if close_reason.is_none() {
                        if let Some(tp) = pos.take_profit {
                            if candle.high >= tp {
                                close_reason = Some(("Take Profit".to_string(), "tp_hit".to_string()));
                                exit_price = tp;
                            }
                        }
                    }
                }
                TradeSide::Sell => {
                    if let Some(sl) = pos.stop_loss {
                        if candle.high >= sl {
                            close_reason = Some(("Stop Loss".to_string(), "sl_hit".to_string()));
                            exit_price = sl;
                        }
                    }
                    if close_reason.is_none() {
                        if let Some(tp) = pos.take_profit {
                            if candle.low <= tp {
                                close_reason = Some(("Take Profit".to_string(), "tp_hit".to_string()));
                                exit_price = tp;
                            }
                        }
                    }
                }
            }

            if let Some((reason, event_type)) = close_reason {
                to_close.push((i, reason, event_type, exit_price));
            }
        }

        for (idx, reason, event_type, exit_price) in to_close.into_iter().rev() {
            let pos = state.open_positions.remove(idx);
            let side_str = format!("{:?}", pos.side);
            let pnl = match pos.side {
                TradeSide::Buy => (exit_price - pos.entry_price) * pos.quantity,
                TradeSide::Sell => (pos.entry_price - exit_price) * pos.quantity,
            };
            state.balance += pnl;
            state.history.push(TradeHistory {
                id: pos.id.clone(),
                symbol: pos.symbol.clone(),
                side: pos.side,
                entry_price: pos.entry_price,
                exit_price,
                quantity: pos.quantity,
                pnl,
                opened_at: pos.opened_at,
                closed_at: candle.time,
                exit_reason: reason.clone(),
                take_profit: pos.take_profit,
                stop_loss: pos.stop_loss,
            });

            events.push(make_event(
                candle.time,
                &event_type,
                format!("{} hit: {} {} @ {:.2} PnL: ${:.2}", reason, side_str, pos.quantity, exit_price, pnl),
                Some(serde_json::json!({
                    "id": pos.id,
                    "side": side_str,
                    "quantity": pos.quantity,
                    "entry_price": pos.entry_price,
                    "exit_price": exit_price,
                    "pnl": pnl,
                    "reason": reason,
                })),
            ));
        }

        state.equity = state.balance + total_pnl;
        events
    }

    pub fn update_position(&self, position_id: &str, tp: Option<f64>, sl: Option<f64>, timestamp: u64) -> Result<BacktestEvent, String> {
        let mut state = self.state.lock().map_err(|_| "Failed to lock state")?;
        if let Some(pos) = state.open_positions.iter_mut().find(|p| p.id == position_id) {
            pos.take_profit = tp;
            pos.stop_loss = sl;
            let event = make_event(
                timestamp,
                "order_modify",
                format!("Position {}: TP={:?} SL={:?}", position_id, tp, sl),
                Some(serde_json::json!({
                    "id": position_id,
                    "tp": tp,
                    "sl": sl,
                })),
            );
            Ok(event)
        } else {
            Err("Position not found".to_string())
        }
    }

    pub fn close_position(&self, position_id: &str, timestamp: u64) -> Result<BacktestEvent, String> {
        let mut state = self.state.lock().map_err(|_| "Failed to lock state")?;
        let pos_idx = state.open_positions.iter().position(|p| p.id == position_id);
        
        if let Some(idx) = pos_idx {
            let pos = state.open_positions.remove(idx);
            let side_str = format!("{:?}", pos.side);
            let pnl = pos.pnl;
            state.balance += pnl;
            state.history.push(TradeHistory {
                id: pos.id.clone(),
                symbol: pos.symbol.clone(),
                side: pos.side,
                entry_price: pos.entry_price,
                exit_price: pos.current_price,
                quantity: pos.quantity,
                pnl,
                opened_at: pos.opened_at,
                closed_at: timestamp,
                exit_reason: "Manual Close".to_string(),
                take_profit: pos.take_profit,
                stop_loss: pos.stop_loss,
            });

            let event = make_event(
                timestamp,
                "order_close",
                format!("Close {} {} @ {:.2} PnL: ${:.2}", side_str, pos.quantity, pos.current_price, pnl),
                Some(serde_json::json!({
                    "id": pos.id,
                    "side": side_str,
                    "quantity": pos.quantity,
                    "entry_price": pos.entry_price,
                    "exit_price": pos.current_price,
                    "pnl": pnl,
                })),
            );
            Ok(event)
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
        let (id, event) = result.unwrap();
        assert!(!id.is_empty());
        assert_eq!(event.event_type, "order_open");
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
        let events = engine.process_candle(&candle);
        assert!(!events.is_empty());
        assert_eq!(events[0].event_type, "tp_hit");
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
        let events = engine.process_candle(&candle);
        assert!(!events.is_empty());
        assert_eq!(events[0].event_type, "sl_hit");
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
        let (id, _) = engine.place_order(order, 100.0, 0).unwrap();
        let state = engine.get_state();
        assert_eq!(state.open_positions.len(), 1);
        let event = engine.close_position(&id, 100).unwrap();
        assert_eq!(event.event_type, "order_close");
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
        let (id, _) = engine.place_order(order, 100.0, 0).unwrap();
        engine.update_position(&id, Some(110.0), Some(95.0), 100).unwrap();
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
        let events = engine.process_tick(&Tick { symbol: "BTCUSDT".into(), price: 105.0, time: 10 });
        assert!(events.is_empty()); // No TP/SL hit
        let state = engine.get_state();
        assert_eq!(state.open_positions[0].current_price, 105.0);
        assert!(state.open_positions[0].pnl > 0.0);
    }

    #[test]
    fn test_process_tick_tp_hit() {
        let engine = SimulatorEngine::new(10000.0);
        let order = OrderRequest {
            symbol: "BTCUSDT".into(), side: TradeSide::Buy, quantity: 1.0,
            take_profit: Some(106.0), stop_loss: None,
        };
        engine.place_order(order, 100.0, 0).unwrap();
        let events = engine.process_tick(&Tick { symbol: "BTCUSDT".into(), price: 107.0, time: 10 });
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, "tp_hit");
        let state = engine.get_state();
        assert_eq!(state.open_positions.len(), 0);
    }
}

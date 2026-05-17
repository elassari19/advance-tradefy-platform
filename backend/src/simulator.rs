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

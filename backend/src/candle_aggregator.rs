use std::collections::VecDeque;
use crate::models::{Candle, Tick};

const MAX_COMPLETED_CANDLES: usize = 500;

pub struct CandleAggregator {
    pub timeframe: u32,
    pub current: Option<Candle>,
    pub completed: VecDeque<Candle>,
    pub symbol: String,
}

impl CandleAggregator {
    pub fn new(symbol: &str, timeframe_minutes: u32) -> Self {
        Self {
            timeframe: timeframe_minutes,
            current: None,
            completed: VecDeque::with_capacity(MAX_COMPLETED_CANDLES),
            symbol: symbol.to_string(),
        }
    }

    pub fn process_tick(&mut self, tick: &Tick) -> Vec<Candle> {
        let interval_ms = (self.timeframe as u64) * 60 * 1000;
        let candle_time = (tick.time / interval_ms) * interval_ms;

        let mut newly_completed = Vec::new();

        match &self.current {
            None => {
                self.current = Some(Candle {
                    time: candle_time,
                    open: tick.price,
                    high: tick.price,
                    low: tick.price,
                    close: tick.price,
                    volume: 0.0,
                    symbol: self.symbol.clone(),
                    is_closed: false,
                });
            }
            Some(current) => {
                if candle_time > current.time {
                    let mut closed = self.current.take().unwrap();
                    closed.is_closed = true;
                    self.completed.push_back(closed.clone());
                    if self.completed.len() > MAX_COMPLETED_CANDLES {
                        self.completed.pop_front();
                    }
                    newly_completed.push(closed);

                    self.current = Some(Candle {
                        time: candle_time,
                        open: tick.price,
                        high: tick.price,
                        low: tick.price,
                        close: tick.price,
                        volume: 0.0,
                        symbol: self.symbol.clone(),
                        is_closed: false,
                    });
                }
            }
        }

        if let Some(ref mut current) = self.current {
            if tick.price > current.high {
                current.high = tick.price;
            }
            if tick.price < current.low {
                current.low = tick.price;
            }
            current.close = tick.price;
        }

        newly_completed
    }

    pub fn get_history(&self) -> Vec<&Candle> {
        self.completed.iter().collect()
    }

    pub fn load_history(&mut self, candles: Vec<Candle>) {
        self.completed.clear();
        self.current = None;
        for candle in candles {
            let mut c = candle;
            c.is_closed = true;
            self.completed.push_back(c);
        }
    }

    pub fn get_latest_candle(&self) -> Option<Candle> {
        self.current.clone()
    }

    pub fn get_current_candle(&self) -> Option<&Candle> {
        self.current.as_ref()
    }
}

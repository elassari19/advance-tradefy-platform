use std::collections::VecDeque;
use crate::models::{Candle, Tick};

const MAX_COMPLETED_CANDLES: usize = 500;

#[derive(Clone)]
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

#[cfg(test)]
mod tests {
    use super::*;

    fn make_tick(price: f64, time: u64) -> Tick {
        Tick { symbol: "BTCUSDT".into(), price, time }
    }

    #[test]
    fn test_empty_start() {
        let agg = CandleAggregator::new("BTCUSDT", 5);
        assert!(agg.get_current_candle().is_none());
        assert!(agg.get_history().is_empty());
    }

    #[test]
    fn test_single_tick_creates_candle() {
        let mut agg = CandleAggregator::new("BTCUSDT", 5);
        agg.process_tick(&make_tick(50000.0, 0));
        let candle = agg.get_current_candle().unwrap();
        assert_eq!(candle.open, 50000.0);
        assert_eq!(candle.high, 50000.0);
        assert_eq!(candle.close, 50000.0);
    }

    #[test]
    fn test_timeframe_boundary_rollover() {
        let mut agg = CandleAggregator::new("BTCUSDT", 5);
        agg.process_tick(&make_tick(50000.0, 0));
        let completed = agg.process_tick(&make_tick(50100.0, 300_000));
        assert_eq!(completed.len(), 1);
        assert_eq!(completed[0].close, 50000.0);
    }

    #[test]
    fn test_load_history() {
        let mut agg = CandleAggregator::new("BTCUSDT", 5);
        agg.load_history(vec![
            Candle { time: 0, open: 100.0, high: 110.0, low: 90.0, close: 105.0, volume: 1000.0, symbol: "BTCUSDT".into(), is_closed: true },
        ]);
        assert_eq!(agg.get_history().len(), 1);
    }

    #[test]
    fn test_max_completed_candles() {
        let mut agg = CandleAggregator::new("BTCUSDT", 1);
        for i in 0..600u64 {
            agg.process_tick(&make_tick(50000.0, i * 60_000));
        }
        assert!(agg.get_history().len() <= 500);
        assert_eq!(agg.get_history().len(), 500);
    }

    #[test]
    fn test_multiple_ticks_same_candle() {
        let mut agg = CandleAggregator::new("BTCUSDT", 5);
        agg.process_tick(&make_tick(50000.0, 0));
        agg.process_tick(&make_tick(50100.0, 60_000));
        agg.process_tick(&make_tick(49900.0, 120_000));
        let candle = agg.get_current_candle().unwrap();
        assert_eq!(candle.high, 50100.0);
        assert_eq!(candle.low, 49900.0);
        assert_eq!(candle.close, 49900.0);
    }
}

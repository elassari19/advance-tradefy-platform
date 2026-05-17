use crate::models::{BinanceTicker, Candle, Tick};
#[allow(unused_imports)]
use futures_util::Stream;
#[allow(unused_imports)]
use std::pin::Pin;

pub trait ExchangeStream: Send + Sync {
    fn name(&self) -> &str;
    fn connect(&self) -> Result<String, String>;
    fn fetch_history(
        &self,
        symbol: &str,
        interval: &str,
        start_time: u64,
        end_time: u64,
    ) -> Result<Vec<Candle>, String>;
    fn parse_tick(&self, raw: &str) -> Option<Tick>;
}

pub struct BinanceStream;

impl BinanceStream {
    pub fn new() -> Self {
        Self
    }
}

impl ExchangeStream for BinanceStream {
    fn name(&self) -> &str {
        "binance"
    }

    fn connect(&self) -> Result<String, String> {
        Ok("wss://stream.binance.com:9443/ws/btcusdt@ticker".to_string())
    }

    fn fetch_history(
        &self,
        symbol: &str,
        interval: &str,
        start_time: u64,
        end_time: u64,
    ) -> Result<Vec<Candle>, String> {
        let url = format!(
            "https://api.binance.com/api/v3/klines?symbol={}&interval={}&startTime={}&endTime={}&limit=1000",
            symbol,
            interval,
            start_time * 1000,
            end_time * 1000
        );

        let resp = reqwest::blocking::get(&url)
            .map_err(|e| format!("Failed to fetch from Binance: {}", e))?;

        let klines: Vec<Vec<serde_json::Value>> = resp
            .json()
            .map_err(|e| format!("Failed to parse Binance klines: {}", e))?;

        let candles: Vec<Candle> = klines
            .iter()
            .filter_map(|k| {
                let open_time = k.get(0)?.as_i64()?;
                let open = k.get(1)?.as_str()?.parse().ok()?;
                let high = k.get(2)?.as_str()?.parse().ok()?;
                let low = k.get(3)?.as_str()?.parse().ok()?;
                let close = k.get(4)?.as_str()?.parse().ok()?;
                let volume = k.get(5)?.as_str()?.parse().ok()?;
                let close_time = k.get(6)?.as_i64()?;
                Some(Candle {
                    time: (open_time / 1000) as u64,
                    open,
                    high,
                    low,
                    close,
                    volume,
                    symbol: symbol.to_string(),
                    is_closed: close_time <= (end_time * 1000) as i64,
                })
            })
            .collect();

        Ok(candles)
    }

    fn parse_tick(&self, raw: &str) -> Option<Tick> {
        let binance_tick: BinanceTicker = serde_json::from_str(raw).ok()?;
        Some(Tick {
            symbol: binance_tick.symbol,
            price: binance_tick.price.parse().ok()?,
            time: binance_tick.time,
        })
    }
}

pub struct BybitStream;

impl BybitStream {
    pub fn new() -> Self {
        Self
    }
}

impl ExchangeStream for BybitStream {
    fn name(&self) -> &str {
        "bybit"
    }

    fn connect(&self) -> Result<String, String> {
        tracing::warn!("Bybit not yet implemented");
        Err("Bybit not yet implemented".to_string())
    }

    fn fetch_history(
        &self,
        _symbol: &str,
        _interval: &str,
        _start_time: u64,
        _end_time: u64,
    ) -> Result<Vec<Candle>, String> {
        tracing::warn!("Bybit not yet implemented");
        Err("Bybit not yet implemented".to_string())
    }

    fn parse_tick(&self, _raw: &str) -> Option<Tick> {
        tracing::warn!("Bybit not yet implemented");
        None
    }
}

pub struct CoinbaseStream;

impl CoinbaseStream {
    pub fn new() -> Self {
        Self
    }
}

impl ExchangeStream for CoinbaseStream {
    fn name(&self) -> &str {
        "coinbase"
    }

    fn connect(&self) -> Result<String, String> {
        tracing::warn!("Coinbase not yet implemented");
        Err("Coinbase not yet implemented".to_string())
    }

    fn fetch_history(
        &self,
        _symbol: &str,
        _interval: &str,
        _start_time: u64,
        _end_time: u64,
    ) -> Result<Vec<Candle>, String> {
        tracing::warn!("Coinbase not yet implemented");
        Err("Coinbase not yet implemented".to_string())
    }

    fn parse_tick(&self, _raw: &str) -> Option<Tick> {
        tracing::warn!("Coinbase not yet implemented");
        None
    }
}

pub enum ExchangeType {
    Binance,
    Bybit,
    Coinbase,
}

pub struct ExchangeFactory;

impl ExchangeFactory {
    pub fn create(exchange: ExchangeType) -> Box<dyn ExchangeStream> {
        match exchange {
            ExchangeType::Binance => Box::new(BinanceStream::new()),
            ExchangeType::Bybit => Box::new(BybitStream::new()),
            ExchangeType::Coinbase => Box::new(CoinbaseStream::new()),
        }
    }
}

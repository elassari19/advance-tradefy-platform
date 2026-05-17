use crate::models::{AlertRule, Candle, TriggeredAlert};
use crate::candle_aggregator::CandleAggregator;
use std::collections::HashMap;
use std::sync::Mutex;

pub struct AlertEngine {
    pub rules: Mutex<Vec<AlertRule>>,
    last_fired: Mutex<HashMap<String, u64>>,
}

impl AlertEngine {
    pub fn new() -> Self {
        Self {
            rules: Mutex::new(Vec::new()),
            last_fired: Mutex::new(HashMap::new()),
        }
    }

    pub fn evaluate(
        &self,
        candle: &Candle,
        aggregator: &CandleAggregator,
    ) -> Vec<TriggeredAlert> {
        let rules = match self.rules.lock() {
            Ok(r) => r,
            Err(_) => return Vec::new(),
        };

        if rules.is_empty() {
            return Vec::new();
        }

        let mut last_fired = match self.last_fired.lock() {
            Ok(l) => l,
            Err(_) => return Vec::new(),
        };

        let mut triggered = Vec::new();

        for rule in rules.iter() {
            if !rule.enabled {
                continue;
            }
            if rule.symbol != candle.symbol {
                continue;
            }

            let met = evaluate_condition(&rule.condition_type, &rule.condition_params, candle, aggregator);

            if !met {
                continue;
            }

            if !should_fire(rule, &last_fired, candle.time) {
                continue;
            }

            last_fired.insert(rule.id.clone(), candle.time);

            let message = generate_alert_message(rule, candle);

            triggered.push(TriggeredAlert {
                rule_id: rule.id.clone(),
                rule_name: rule.name.clone(),
                symbol: candle.symbol.clone(),
                condition_type: rule.condition_type.clone(),
                message,
                timestamp: candle.time,
                candle: Some(candle.clone()),
            });
        }

        triggered
    }

    pub fn add_rule(&self, rule: AlertRule) {
        if let Ok(mut rules) = self.rules.lock() {
            if let Some(existing) = rules.iter_mut().find(|r| r.id == rule.id) {
                *existing = rule;
            } else {
                rules.push(rule);
            }
        }
    }

    pub fn remove_rule(&self, id: &str) -> bool {
        if let Ok(mut rules) = self.rules.lock() {
            let len_before = rules.len();
            rules.retain(|r| r.id != id);
            rules.len() < len_before
        } else {
            false
        }
    }

    pub fn get_rules(&self) -> Vec<AlertRule> {
        self.rules.lock().map(|guard| guard.clone()).unwrap_or_default()
    }
}

fn evaluate_condition(
    condition_type: &str,
    params: &serde_json::Value,
    candle: &Candle,
    _aggregator: &CandleAggregator,
) -> bool {
    match condition_type {
        "crossing" => {
            let series1 = params.get("series1").and_then(|v| v.as_str()).unwrap_or("");
            let series2 = params.get("series2").and_then(|v| v.as_str()).unwrap_or("");
            let prev1 = params.get("prev1").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let prev2 = params.get("prev2").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let curr1 = get_series_value(series1, candle);
            let curr2 = get_series_value(series2, candle);
            (prev1 < prev2 && curr1 >= curr2) || (prev1 > prev2 && curr1 <= curr2)
        }
        "crossing_up" => {
            let series1 = params.get("series1").and_then(|v| v.as_str()).unwrap_or("");
            let series2 = params.get("series2").and_then(|v| v.as_str()).unwrap_or("");
            let prev1 = params.get("prev1").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let prev2 = params.get("prev2").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let curr1 = get_series_value(series1, candle);
            let curr2 = get_series_value(series2, candle);
            prev1 < prev2 && curr1 >= curr2
        }
        "crossing_down" => {
            let series1 = params.get("series1").and_then(|v| v.as_str()).unwrap_or("");
            let series2 = params.get("series2").and_then(|v| v.as_str()).unwrap_or("");
            let prev1 = params.get("prev1").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let prev2 = params.get("prev2").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let curr1 = get_series_value(series1, candle);
            let curr2 = get_series_value(series2, candle);
            prev1 > prev2 && curr1 <= curr2
        }
        "greater_than" => {
            let series = params.get("series").and_then(|v| v.as_str()).unwrap_or("");
            let value = params.get("value").and_then(|v| v.as_f64()).unwrap_or(0.0);
            get_series_value(series, candle) > value
        }
        "less_than" => {
            let series = params.get("series").and_then(|v| v.as_str()).unwrap_or("");
            let value = params.get("value").and_then(|v| v.as_f64()).unwrap_or(0.0);
            get_series_value(series, candle) < value
        }
        "greater_than_or_equal" => {
            let series = params.get("series").and_then(|v| v.as_str()).unwrap_or("");
            let value = params.get("value").and_then(|v| v.as_f64()).unwrap_or(0.0);
            get_series_value(series, candle) >= value
        }
        "less_than_or_equal" => {
            let series = params.get("series").and_then(|v| v.as_str()).unwrap_or("");
            let value = params.get("value").and_then(|v| v.as_f64()).unwrap_or(0.0);
            get_series_value(series, candle) <= value
        }
        "range" => {
            let series = params.get("series").and_then(|v| v.as_str()).unwrap_or("");
            let upper = params.get("upper").and_then(|v| v.as_f64()).unwrap_or(f64::MAX);
            let lower = params.get("lower").and_then(|v| v.as_f64()).unwrap_or(f64::MIN);
            let val = get_series_value(series, candle);
            val >= lower && val <= upper
        }
        _ => false,
    }
}

fn get_series_value(series: &str, candle: &Candle) -> f64 {
    match series {
        "open" => candle.open,
        "high" => candle.high,
        "low" => candle.low,
        "close" => candle.close,
        "volume" => candle.volume,
        _ => {
            if let Ok(val) = series.parse::<f64>() {
                val
            } else {
                0.0
            }
        }
    }
}

fn should_fire(rule: &AlertRule, last_fired: &HashMap<String, u64>, current_time: u64) -> bool {
    match rule.frequency.as_str() {
        "OncePerBarClose" => true,
        "OncePerBar" => {
            if let Some(last) = last_fired.get(&rule.id) {
                if *last == current_time {
                    return false;
                }
            }
            true
        }
        "OnEveryTick" => true,
        _ => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_candle(close: f64, high: f64, low: f64, time: u64) -> Candle {
        Candle { time, open: close, high, low, close, volume: 1000.0, symbol: "BTCUSDT".into(), is_closed: true }
    }

    fn make_rule(id: &str, condition_type: &str, params: serde_json::Value) -> AlertRule {
        AlertRule {
            id: id.to_string(),
            name: format!("Test {}", id),
            symbol: "BTCUSDT".to_string(),
            timeframe: "5m".to_string(),
            condition_type: condition_type.to_string(),
            condition_params: params,
            frequency: "OncePerBarClose".to_string(),
            actions: vec![],
            enabled: true,
            created_at: 0,
        }
    }

    #[test]
    fn test_crossover_detection() {
        let engine = AlertEngine::new();
        let rule = make_rule("r1", "crossing", serde_json::json!({
            "series1": "close", "series2": "open",
            "prev1": 100.0, "prev2": 110.0,
        }));
        engine.add_rule(rule);
        let candle = make_candle(105.0, 110.0, 100.0, 100);
        let agg = CandleAggregator::new("BTCUSDT", 5);
        let triggered = engine.evaluate(&candle, &agg);
        assert_eq!(triggered.len(), 1);
        assert_eq!(triggered[0].condition_type, "crossing");
    }

    #[test]
    fn test_threshold_greater_than() {
        let engine = AlertEngine::new();
        let rule = make_rule("r2", "greater_than", serde_json::json!({
            "series": "close", "value": 100.0,
        }));
        engine.add_rule(rule);
        let candle = make_candle(150.0, 160.0, 140.0, 100);
        let agg = CandleAggregator::new("BTCUSDT", 5);
        assert_eq!(engine.evaluate(&candle, &agg).len(), 1);
        let candle2 = make_candle(50.0, 60.0, 40.0, 200);
        assert_eq!(engine.evaluate(&candle2, &agg).len(), 0);
    }

    #[test]
    fn test_frequency_limiting() {
        let engine = AlertEngine::new();
        let mut rule = make_rule("r3", "greater_than", serde_json::json!({
            "series": "close", "value": 100.0,
        }));
        rule.frequency = "OncePerBar".into();
        engine.add_rule(rule);
        let agg = CandleAggregator::new("BTCUSDT", 5);
        let c1 = make_candle(150.0, 160.0, 140.0, 100);
        assert_eq!(engine.evaluate(&c1, &agg).len(), 1);
        let c2 = make_candle(150.0, 160.0, 140.0, 100);
        assert_eq!(engine.evaluate(&c2, &agg).len(), 0);
        let c3 = make_candle(150.0, 160.0, 140.0, 200);
        assert_eq!(engine.evaluate(&c3, &agg).len(), 1);
    }

    #[test]
    fn test_disabled_rule() {
        let engine = AlertEngine::new();
        let mut rule = make_rule("r4", "greater_than", serde_json::json!({
            "series": "close", "value": 100.0,
        }));
        rule.enabled = false;
        engine.add_rule(rule);
        let candle = make_candle(150.0, 160.0, 140.0, 100);
        let agg = CandleAggregator::new("BTCUSDT", 5);
        assert_eq!(engine.evaluate(&candle, &agg).len(), 0);
    }

    #[test]
    fn test_range_condition() {
        let engine = AlertEngine::new();
        let rule = make_rule("r5", "range", serde_json::json!({
            "series": "close", "upper": 200.0, "lower": 100.0,
        }));
        engine.add_rule(rule);
        let agg = CandleAggregator::new("BTCUSDT", 5);
        assert_eq!(engine.evaluate(&make_candle(150.0, 160.0, 140.0, 100), &agg).len(), 1);
        assert_eq!(engine.evaluate(&make_candle(50.0, 60.0, 40.0, 200), &agg).len(), 0);
    }

    #[test]
    fn test_rule_removal() {
        let engine = AlertEngine::new();
        engine.add_rule(make_rule("r6", "greater_than", serde_json::json!({
            "series": "close", "value": 100.0,
        })));
        assert_eq!(engine.get_rules().len(), 1);
        assert!(engine.remove_rule("r6"));
        assert_eq!(engine.get_rules().len(), 0);
    }
}

fn generate_alert_message(rule: &AlertRule, candle: &Candle) -> String {
    let condition_desc = match rule.condition_type.as_str() {
        "crossing" => "crossed",
        "crossing_up" => "crossed above",
        "crossing_down" => "crossed below",
        "greater_than" => "exceeded",
        "less_than" => "fell below",
        "greater_than_or_equal" => "reached or exceeded",
        "less_than_or_equal" => "reached or fell below",
        "range" => "entered range",
        _ => "triggered",
    };

    format!(
        "{} {}: {} {} at {}",
        rule.symbol, rule.timeframe, rule.name, condition_desc, candle.close
    )
}

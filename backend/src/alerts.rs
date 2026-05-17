use crate::models::{AlertActionConfig, AlertRule, Candle, TriggeredAlert};
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

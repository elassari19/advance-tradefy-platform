use pyo3::{prelude::*, types::PyDict, types::PyList};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct EvaluateRequest {
    pub script: String,
    pub candles: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IndicatorValue {
    pub time: u64,
    pub value: f64,
}

#[derive(Debug, Serialize)]
pub struct EvaluateResponse {
    pub values: Vec<IndicatorValue>,
}

pub fn evaluate_indicator(script: &str, candles: &[serde_json::Value]) -> Result<EvaluateResponse, String> {
    Python::with_gil(|py| -> Result<EvaluateResponse, String> {
        let globals = PyDict::new(py);

        let candle_list = PyList::empty(py);
        for c in candles {
            let time = c.get("time").and_then(|v| v.as_u64()).unwrap_or(0);
            let open = c.get("open").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let high = c.get("high").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let low = c.get("low").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let close = c.get("close").and_then(|v| v.as_f64()).unwrap_or(0.0);

            let d = PyDict::new(py);
            d.set_item("time", time).map_err(|e| e.to_string())?;
            d.set_item("open", open).map_err(|e| e.to_string())?;
            d.set_item("high", high).map_err(|e| e.to_string())?;
            d.set_item("low", low).map_err(|e| e.to_string())?;
            d.set_item("close", close).map_err(|e| e.to_string())?;
            candle_list.append(d).map_err(|e| e.to_string())?;
        }
        globals.set_item("candles", candle_list).map_err(|e| e.to_string())?;

        let wrapped = format!(
            "{}\n__result = run(candles)\n",
            script
        );

        py.run(&wrapped, Some(&globals), None)
            .map_err(|e| format!("Python error: {}", e))?;

        globals.get_item("__result").map_err(|e| e.to_string())?
            .ok_or("Indicator did not return a result")?;

        let json_str = py.eval(
            "__import__('json').dumps(__result)",
            Some(&globals),
            None,
        ).map_err(|e| format!("Failed to serialize result: {}", e))?
        .extract::<String>()
        .map_err(|e| format!("Failed to extract JSON string: {}", e))?;

        let values: Vec<IndicatorValue> = serde_json::from_str(&json_str)
            .map_err(|e| format!("Result must be array of {{time, value}}. Parse error: {}", e))?;

        Ok(EvaluateResponse { values })
    })
    .map_err(|e: String| e)
}

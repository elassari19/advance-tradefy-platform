use std::collections::{HashMap, VecDeque};

const DEFAULT_MAX_LEN: usize = 500;

pub struct TimeSeries {
    buffers: HashMap<String, VecDeque<f64>>,
    max_len: usize,
}

impl TimeSeries {
    pub fn new() -> Self {
        Self {
            buffers: HashMap::new(),
            max_len: DEFAULT_MAX_LEN,
        }
    }

    pub fn with_max_len(max_len: usize) -> Self {
        Self {
            buffers: HashMap::new(),
            max_len,
        }
    }

    pub fn push(&mut self, name: &str, value: f64) {
        let buffer = self.buffers.entry(name.to_string()).or_insert_with(|| VecDeque::with_capacity(self.max_len));
        buffer.push_back(value);
        if buffer.len() > self.max_len {
            buffer.pop_front();
        }
    }

    pub fn get(&self, name: &str, offset: usize) -> Option<f64> {
        self.buffers.get(name).and_then(|buffer| {
            let len = buffer.len();
            if offset < len {
                Some(buffer[len - 1 - offset])
            } else {
                None
            }
        })
    }

    pub fn get_current(&self, name: &str) -> f64 {
        self.get(name, 0).unwrap_or(0.0)
    }

    pub fn len(&self, name: &str) -> usize {
        self.buffers.get(name).map_or(0, |b| b.len())
    }

    pub fn has(&self, name: &str) -> bool {
        self.buffers.contains_key(name)
    }

    pub fn all_names(&self) -> Vec<String> {
        self.buffers.keys().cloned().collect()
    }

    pub fn get_all(&self, name: &str) -> Vec<f64> {
        self.buffers.get(name).map(|b| b.iter().copied().collect()).unwrap_or_default()
    }

    pub fn latest_values(&self) -> HashMap<String, f64> {
        self.buffers.iter().map(|(k, v)| (k.clone(), v.back().copied().unwrap_or(0.0))).collect()
    }

    pub fn clear(&mut self, name: &str) {
        self.buffers.remove(name);
    }

    pub fn clear_all(&mut self) {
        self.buffers.clear();
    }
}

impl Default for TimeSeries {
    fn default() -> Self {
        Self::new()
    }
}

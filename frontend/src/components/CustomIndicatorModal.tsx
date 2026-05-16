import React, { useState, useEffect } from 'react';
import { X, Save, Play, AlertCircle, CheckCircle } from 'lucide-react';
import type { CustomIndicatorDef } from '../utils/indicators';

const API_URL = 'http://localhost:3000';

interface CustomIndicatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (def: CustomIndicatorDef) => void;
  editDef?: CustomIndicatorDef | null;
}

const DEFAULT_SCRIPT = `def run(candles):
    """candles: list of {time, open, high, low, close}
    Return list of {time, value}
    """
    result = []
    for i, c in enumerate(candles):
        prev = candles[i-1] if i > 0 else None
        value = c["close"] - prev["close"] if prev else 0
        result.append({"time": c["time"], "value": value})
    return result
`;

export const CustomIndicatorModal: React.FC<CustomIndicatorModalProps> = ({ isOpen, onClose, onSave, editDef }) => {
  const [name, setName] = useState('');
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState<string>('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (editDef) {
      setName(editDef.name);
      setScript(editDef.script);
    } else {
      setName('');
      setScript(DEFAULT_SCRIPT);
    }
    setError('');
    setTestResult('');
  }, [editDef, isOpen]);

  if (!isOpen) return null;

  const handleTest = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!script.trim()) { setError('Script is required'); return; }

    const mockCandles = Array.from({ length: 50 }, (_, i) => ({
      time: 1700000000 + i * 60,
      open: 65000 + Math.random() * 100,
      high: 65100 + Math.random() * 100,
      low: 64900 + Math.random() * 100,
      close: 65000 + Math.random() * 100,
    }));

    setTesting(true);
    setError('');
    setTestResult('');

    try {
      const res = await fetch(`${API_URL}/api/indicator/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: script.trim(),
          candles: mockCandles,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const values = data.values || [];
        setTestResult(`✓ Returns ${values.length} values (${values.length > 0 ? 'valid' : 'empty'})`);
      } else {
        setTestResult(`✗ Error: ${data.error}`);
        setError(data.error);
      }
    } catch (e: any) {
      setTestResult(`✗ Error: ${e.message}`);
      setError(e.message);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!script.trim()) { setError('Script is required'); return; }

    onSave({
      id: editDef?.id || `custom-${Date.now()}`,
      name: name.trim(),
      script: script.trim(),
      color: editDef?.color || '#8b5cf6',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[600px] max-h-[80vh] bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-bold text-white">
            {editDef ? 'Edit Custom Indicator' : 'New Custom Indicator'}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
              Indicator Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Momentum Oscillator"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">
              Script (Python)
            </label>
            <div className="relative">
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                className="w-full h-48 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-none"
                placeholder="# Write your indicator logic here..."
                spellCheck={false}
              />
            </div>
            <p className="mt-1 text-[10px] text-zinc-600">
              Define a <code className="text-zinc-400">def run(candles):</code> function that returns a list of <code className="text-zinc-400">&#123;"time": ..., "value": ...&#125;</code>.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle size={12} className="text-red-400 shrink-0" />
              <span className="text-[11px] text-red-400">{error}</span>
            </div>
          )}

          {testResult && !error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
              <CheckCircle size={12} className="text-green-400 shrink-0" />
              <span className="text-[11px] text-green-400">{testResult}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-800">
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold text-zinc-300 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
          >
            <Play size={12} />
            {testing ? 'Running...' : 'Test'}
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 transition-colors"
          >
            <Save size={12} />
            {editDef ? 'Update' : 'Save'} Indicator
          </button>
        </div>
      </div>
    </div>
  );
};

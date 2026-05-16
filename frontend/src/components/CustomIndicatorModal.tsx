import React, { useState, useEffect } from 'react';
import { X, Save, Play, AlertCircle, CheckCircle } from 'lucide-react';
import type { CustomIndicatorDef } from '../utils/indicators';

interface CustomIndicatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (def: CustomIndicatorDef) => void;
  editDef?: CustomIndicatorDef | null;
}

const DEFAULT_SCRIPT = `// Return array of {time, value}
// candles: [{time: number, open, high, low, close}]
const result = [];
for (let i = 0; i < candles.length; i++) {
  const c = candles[i];
  // Example: price delta
  const prev = candles[i - 1];
  result.push({
    time: c.time,
    value: prev ? c.close - prev.close : 0,
  });
}
return result;
`;

export const CustomIndicatorModal: React.FC<CustomIndicatorModalProps> = ({ isOpen, onClose, onSave, editDef }) => {
  const [name, setName] = useState('');
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState<string>('');

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

  const handleTest = () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!script.trim()) { setError('Script is required'); return; }

    const mockCandles = Array.from({ length: 50 }, (_, i) => ({
      time: 1700000000 + i * 60,
      open: 65000 + Math.random() * 100,
      high: 65100 + Math.random() * 100,
      low: 64900 + Math.random() * 100,
      close: 65000 + Math.random() * 100,
    }));

    try {
      const fn = new Function('candles', script);
      const result = fn(mockCandles);
      if (Array.isArray(result)) {
        setTestResult(`✓ Returns ${result.length} values (${result.length > 0 ? 'valid' : 'empty'})`);
        setError('');
      } else {
        setTestResult('✗ Script did not return an array');
        setError('Return value must be an array of {time, value}');
      }
    } catch (e: any) {
      setTestResult(`✗ Error: ${e.message}`);
      setError(e.message);
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
              Script (JavaScript)
            </label>
            <div className="relative">
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                className="w-full h-48 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-none"
                placeholder="// Write your indicator logic here..."
                spellCheck={false}
              />
            </div>
            <p className="mt-1 text-[10px] text-zinc-600">
              Receives <code className="text-zinc-400">candles</code> (array of &#123;time, open, high, low, close&#125;). Return an array of &#123;time, value&#125;.
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-colors"
          >
            <Play size={12} />
            Test
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

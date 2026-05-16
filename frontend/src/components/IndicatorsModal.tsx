import React, { useState } from 'react';
import { BarChart3, Plus, Check, Code2, X, FileCode, Minus } from 'lucide-react';
import type { IndicatorConfig, CustomIndicatorDef } from '../utils/indicators';

interface IndicatorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeIndicators: IndicatorConfig[];
  customIndicators: CustomIndicatorDef[];
  onToggleIndicator: (config: IndicatorConfig) => void;
  onRemoveIndicator: (id: string) => void;
  onOpenStrategy: () => void;
  onOpenCustomModal: () => void;
  onEditCustomIndicator: (def: CustomIndicatorDef) => void;
}

const INDICATOR_COLORS = ['#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#10b981'];

function getNextColor(used: string[]): string {
  return INDICATOR_COLORS.find(c => !used.includes(c)) || INDICATOR_COLORS[0];
}

export const IndicatorsModal: React.FC<IndicatorsModalProps> = ({
  isOpen, onClose,
  activeIndicators, customIndicators,
  onToggleIndicator, onRemoveIndicator,
  onOpenStrategy, onOpenCustomModal, onEditCustomIndicator,
}) => {
  const [periodInputs, setPeriodInputs] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const usedColors = activeIndicators.map(i => i.color);

  const handleAdd = (type: IndicatorConfig['type'], params: Record<string, number>) => {
    const color = getNextColor(usedColors);
    let config: IndicatorConfig;

    switch (type) {
      case 'sma':
        config = { id: `sma-${params.period}-${Date.now()}`, type: 'sma', period: params.period, color };
        break;
      case 'ema':
        config = { id: `ema-${params.period}-${Date.now()}`, type: 'ema', period: params.period, color };
        break;
      case 'rsi':
        config = { id: `rsi-${params.period}-${Date.now()}`, type: 'rsi', period: params.period, color };
        break;
      case 'macd':
        config = {
          id: `macd-${params.fastPeriod}-${params.slowPeriod}-${params.signalPeriod}-${Date.now()}`,
          type: 'macd', fastPeriod: params.fastPeriod, slowPeriod: params.slowPeriod, signalPeriod: params.signalPeriod, color,
        };
        break;
      case 'bollinger':
        config = {
          id: `bb-${params.bbPeriod}-${params.bbStdDev}-${Date.now()}`,
          type: 'bollinger', bbPeriod: params.bbPeriod, bbStdDev: params.bbStdDev, color,
        };
        break;
      default:
        return;
    }
    onToggleIndicator(config);
  };

  const toggleBuiltIn = (type: IndicatorConfig['type'], id: string) => {
    const existing = activeIndicators.find(i => i.type === type);
    if (existing) {
      onRemoveIndicator(existing.id);
      return;
    }
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const isBuiltInActive = (type: IndicatorConfig['type']) => activeIndicators.some(i => i.type === type);

  const getActiveConfig = (type: IndicatorConfig['type']) => activeIndicators.find(i => i.type === type);

  const closeAndOpenStrategy = () => {
    onClose();
    onOpenStrategy();
  };

  const builtIns: { id: string; type: IndicatorConfig['type']; label: string; desc: string }[] = [
    { id: 'sma', type: 'sma', label: 'SMA', desc: 'Simple Moving Average' },
    { id: 'ema', type: 'ema', label: 'EMA', desc: 'Exponential Moving Average' },
    { id: 'rsi', type: 'rsi', label: 'RSI', desc: 'Relative Strength Index' },
    { id: 'macd', type: 'macd', label: 'MACD', desc: 'Moving Average Convergence Divergence' },
    { id: 'bollinger', type: 'bollinger', label: 'Bollinger Bands', desc: 'Volatility bands around a moving average' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[500px] max-h-[80vh] bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <BarChart3 size={18} className="text-blue-400" />
            <h2 className="text-sm font-bold text-white">Indicators & Strategy</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 space-y-5">

          {/* Strategy */}
          <section>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Strategy</div>
            <button
              onClick={closeAndOpenStrategy}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 transition-colors text-left"
            >
              <Code2 size={16} className="text-blue-400 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-zinc-200">Deploy Strategy</div>
                <div className="text-[10px] text-zinc-500">Write a Python trading script</div>
              </div>
            </button>
          </section>

          {/* Built-in Indicators */}
          <section>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Built-in Indicators</div>
            <div className="space-y-1.5">
              {builtIns.map(({ id, type, label, desc }) => {
                const active = isBuiltInActive(type);
                const activeConfig = getActiveConfig(type);
                const isExpanded = expanded[id];

                return (
                  <div key={id} className="rounded-lg border border-zinc-800 overflow-hidden">
                    <button
                      onClick={() => toggleBuiltIn(type, id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors text-left"
                    >
                      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        active ? 'border-green-500 bg-green-500' : 'border-zinc-600'
                      }`}>
                        {active && <Check size={10} className="text-white" />}
                      </span>
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-zinc-200">{label}</div>
                        <div className="text-[10px] text-zinc-500">{desc}</div>
                      </div>
                      {active && activeConfig && (
                        <span className="text-[10px] text-green-500 font-bold">
                          Active
                        </span>
                      )}
                      {!active && <Plus size={14} className="text-zinc-500" />}
                    </button>

                    {isExpanded && type === 'sma' && (
                      <PeriodForm
                        label="Period" defaultValue="20"
                        onAdd={(p) => { handleAdd('sma', { period: p }); setExpanded(prev => ({ ...prev, [id]: false })); }}
                        onCancel={() => setExpanded(prev => ({ ...prev, [id]: false }))}
                      />
                    )}
                    {isExpanded && type === 'ema' && (
                      <PeriodForm
                        label="Period" defaultValue="20"
                        onAdd={(p) => { handleAdd('ema', { period: p }); setExpanded(prev => ({ ...prev, [id]: false })); }}
                        onCancel={() => setExpanded(prev => ({ ...prev, [id]: false }))}
                      />
                    )}
                    {isExpanded && type === 'rsi' && (
                      <PeriodForm
                        label="Period" defaultValue="14"
                        onAdd={(p) => { handleAdd('rsi', { period: p }); setExpanded(prev => ({ ...prev, [id]: false })); }}
                        onCancel={() => setExpanded(prev => ({ ...prev, [id]: false }))}
                      />
                    )}
                    {isExpanded && type === 'macd' && (
                      <MultiParamForm
                        fields={[
                          { key: 'fast', label: 'Fast', defaultValue: '12' },
                          { key: 'slow', label: 'Slow', defaultValue: '26' },
                          { key: 'signal', label: 'Signal', defaultValue: '9' },
                        ]}
                        onAdd={(vals) => {
                          handleAdd('macd', { fastPeriod: parseInt(vals.fast), slowPeriod: parseInt(vals.slow), signalPeriod: parseInt(vals.signal) });
                          setExpanded(prev => ({ ...prev, [id]: false }));
                        }}
                        onCancel={() => setExpanded(prev => ({ ...prev, [id]: false }))}
                      />
                    )}
                    {isExpanded && type === 'bollinger' && (
                      <MultiParamForm
                        fields={[
                          { key: 'period', label: 'Period', defaultValue: '20' },
                          { key: 'stddev', label: 'Std Dev', defaultValue: '2' },
                        ]}
                        onAdd={(vals) => {
                          handleAdd('bollinger', { bbPeriod: parseInt(vals.period), bbStdDev: parseFloat(vals.stddev) });
                          setExpanded(prev => ({ ...prev, [id]: false }));
                        }}
                        onCancel={() => setExpanded(prev => ({ ...prev, [id]: false }))}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Custom Indicators */}
          <section>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Custom Indicators</div>

            {customIndicators.length === 0 && (
              <p className="text-[11px] text-zinc-600 italic mb-2">No custom indicators saved yet.</p>
            )}

            <div className="space-y-1">
              {customIndicators.map(def => {
                const active = activeIndicators.some(i => i.id === def.id);
                return (
                  <div key={def.id} className="group flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-800/30 border border-zinc-800">
                    <button
                      onClick={() => {
                        if (active) {
                          onRemoveIndicator(def.id);
                        } else {
                          onToggleIndicator({
                            id: def.id,
                            type: 'custom',
                            name: def.name,
                            script: def.script,
                            color: def.color,
                          });
                        }
                      }}
                      className="flex items-center gap-3 flex-1 text-left"
                    >
                      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        active ? 'border-green-500 bg-green-500' : 'border-zinc-600'
                      }`}>
                        {active && <Check size={10} className="text-white" />}
                      </span>
                      <FileCode size={14} className="text-zinc-400 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-zinc-200">{def.name}</div>
                      </div>
                      {active && <span className="text-[10px] text-green-500 font-bold">Active</span>}
                    </button>
                    <button
                      onClick={() => onEditCustomIndicator(def)}
                      className="text-zinc-600 hover:text-zinc-300 text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Edit
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => { onClose(); onOpenCustomModal(); }}
              className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-zinc-700 text-xs text-blue-400 hover:bg-zinc-800/50 transition-colors"
            >
              <Plus size={14} />
              New Custom Indicator
            </button>
          </section>

        </div>
      </div>
    </div>
  );
};

function PeriodForm({
  label, defaultValue, onAdd, onCancel,
}: {
  label: string; defaultValue: string; onAdd: (period: number) => void; onCancel: () => void;
}) {
  const [val, setVal] = useState(defaultValue);
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-zinc-800/50 border-t border-zinc-800">
      <span className="text-[10px] text-zinc-500">{label}:</span>
      <input
        type="number" min="2" max="200" value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { const p = parseInt(val); if (!isNaN(p) && p >= 2) onAdd(p); } }}
        className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 text-center"
        autoFocus
      />
      <button
        onClick={() => { const p = parseInt(val); if (!isNaN(p) && p >= 2) onAdd(p); }}
        className="px-2.5 py-1 rounded text-[10px] font-bold text-green-500 hover:bg-green-500/10 transition-colors"
      >
        Add
      </button>
      <button onClick={onCancel} className="px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-400 transition-colors">
        Cancel
      </button>
    </div>
  );
}

function MultiParamForm({
  fields, onAdd, onCancel,
}: {
  fields: { key: string; label: string; defaultValue: string }[];
  onAdd: (vals: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    fields.forEach(f => init[f.key] = f.defaultValue);
    return init;
  });

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-zinc-800/50 border-t border-zinc-800 flex-wrap">
      {fields.map(f => (
        <div key={f.key} className="flex items-center gap-1">
          <span className="text-[10px] text-zinc-500">{f.label}:</span>
          <input
            type="number" min="1" max="200" step={f.key === 'stddev' ? '0.1' : '1'} value={vals[f.key]}
            onChange={(e) => setVals(prev => ({ ...prev, [f.key]: e.target.value }))}
            className="w-14 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-zinc-200 text-center"
            autoFocus={f === fields[0]}
          />
        </div>
      ))}
      <button onClick={() => onAdd(vals)} className="px-2.5 py-1 rounded text-[10px] font-bold text-green-500 hover:bg-green-500/10 transition-colors">
        Add
      </button>
      <button onClick={onCancel} className="px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-400 transition-colors">
        Cancel
      </button>
    </div>
  );
}

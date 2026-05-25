import React, { useState, useMemo } from 'react';
import { BarChart3, Plus, Check, Code2, X, FileCode, Search, Star, ChevronRight, Palette } from 'lucide-react';
import type { IndicatorConfig, CustomIndicatorDef } from '../../utils/indicators';

interface IndicatorPanelProps {
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

const INDICATOR_COLORS = ['#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#10b981', '#3b82f6', '#22c55e', '#ef4444'];

const BUILTIN_DEFS: {
  id: string; type: IndicatorConfig['type']; label: string; category: string;
  params: { key: string; label: string; default: string; step?: string; min?: number; max?: number }[];
}[] = [
  {
    id: 'sma', type: 'sma', label: 'SMA', category: 'trend',
    params: [{ key: 'period', label: 'Period', default: '20', min: 2, max: 200 }],
  },
  {
    id: 'ema', type: 'ema', label: 'EMA', category: 'trend',
    params: [{ key: 'period', label: 'Period', default: '20', min: 2, max: 200 }],
  },
  {
    id: 'bollinger', type: 'bollinger', label: 'Bollinger Bands', category: 'trend',
    params: [
      { key: 'bbPeriod', label: 'Period', default: '20', min: 2, max: 200 },
      { key: 'bbStdDev', label: 'Std Dev', default: '2', step: '0.1', min: 0.1, max: 10 },
    ],
  },
  {
    id: 'vwap', type: 'custom', label: 'VWAP', category: 'volume',
    params: [],
  },
  {
    id: 'rsi', type: 'rsi', label: 'RSI', category: 'oscillators',
    params: [{ key: 'period', label: 'Period', default: '14', min: 2, max: 200 }],
  },
  {
    id: 'macd', type: 'macd', label: 'MACD', category: 'oscillators',
    params: [
      { key: 'fastPeriod', label: 'Fast', default: '12', min: 2, max: 200 },
      { key: 'slowPeriod', label: 'Slow', default: '26', min: 2, max: 200 },
      { key: 'signalPeriod', label: 'Signal', default: '9', min: 2, max: 200 },
    ],
  },
  {
    id: 'stochastic', type: 'custom', label: 'Stochastic', category: 'oscillators',
    params: [],
  },
];

const INDICATOR_DESCRIPTIONS: Record<string, string> = {
  sma: 'Simple Moving Average',
  ema: 'Exponential Moving Average',
  rsi: 'Relative Strength Index',
  macd: 'Moving Average Convergence Divergence',
  bollinger: 'Volatility bands around a moving average',
  vwap: 'Volume-Weighted Average Price',
  stochastic: '%K and %D lines overbought/oversold',
};

function getNextColor(used: string[]): string {
  return INDICATOR_COLORS.find(c => !used.includes(c)) || INDICATOR_COLORS[0];
}

export const IndicatorPanel: React.FC<IndicatorPanelProps> = ({
  isOpen, onClose,
  activeIndicators, customIndicators,
  onToggleIndicator, onRemoveIndicator,
  onOpenStrategy, onOpenCustomModal, onEditCustomIndicator,
}) => {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [expandedConfig, setExpandedConfig] = useState<Record<string, boolean>>({});
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('indicatorFavorites') || '[]'); }
    catch { return []; }
  });
  const [paramValues, setParamValues] = useState<Record<string, Record<string, string>>>({});
  const [selectedColors, setSelectedColors] = useState<Record<string, string>>({});

  const filteredBuiltIns = useMemo(() => {
    if (!search) return BUILTIN_DEFS;
    const q = search.toLowerCase();
    return BUILTIN_DEFS.filter(d =>
      d.label.toLowerCase().includes(q) ||
      (INDICATOR_DESCRIPTIONS[d.id] || '').toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q)
    );
  }, [search]);

  const filteredCustom = useMemo(() => {
    if (!search) return customIndicators;
    const q = search.toLowerCase();
    return customIndicators.filter(d => d.name.toLowerCase().includes(q));
  }, [search, customIndicators]);

  const categoryOrder = ['favorites', 'trend', 'oscillators', 'volume', 'custom'];
  const categoryLabels: Record<string, string> = {
    favorites: 'Favorites', trend: 'Trend', oscillators: 'Oscillators', volume: 'Volume', custom: 'Custom',
  };

  const groupedByCategory: Record<string, typeof BUILTIN_DEFS> = {};
  for (const d of filteredBuiltIns) {
    if (!groupedByCategory[d.category]) groupedByCategory[d.category] = [];
    groupedByCategory[d.category].push(d);
  }

  if (filteredCustom.length > 0 || categoryOrder.includes('custom')) {
    if (!groupedByCategory.custom) groupedByCategory.custom = [];
  }

  if (!isOpen) return null;

  const toggleCollapse = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  const isActive = (id: string) => activeIndicators.some(i => i.id === id || i.type === id);

  const handleToggleFavorite = (indicatorId: string) => {
    setFavorites(prev => {
      const next = prev.includes(indicatorId)
        ? prev.filter(id => id !== indicatorId)
        : [...prev, indicatorId];
      localStorage.setItem('indicatorFavorites', JSON.stringify(next));
      return next;
    });
  };

  const handleAddIndicator = (def: typeof BUILTIN_DEFS[number], params: Record<string, number>) => {
    const usedColors = activeIndicators.map(i => i.color);
    const color = selectedColors[def.id] || getNextColor(usedColors);
    let config: IndicatorConfig;

    switch (def.type) {
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
    setExpandedConfig(prev => ({ ...prev, [def.id]: false }));
  };

  const handleAddCustom = (def: CustomIndicatorDef) => {
    const usedColors = activeIndicators.map(i => i.color);
    const color = def.color || getNextColor(usedColors);
    onToggleIndicator({
      id: def.id,
      type: 'custom',
      name: def.name,
      script: def.script,
      color,
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedConfig(prev => ({ ...prev, [id]: !prev[id] }));
    if (!paramValues[id]) {
      const def = BUILTIN_DEFS.find(d => d.id === id);
      if (def) {
        const init: Record<string, string> = {};
        def.params.forEach(p => { init[p.key] = p.default; });
        setParamValues(prev => ({ ...prev, [id]: init }));
      }
    }
  };

  const setParam = (indicatorId: string, key: string, value: string) => {
    setParamValues(prev => ({
      ...prev,
      [indicatorId]: { ...(prev[indicatorId] || {}), [key]: value },
    }));
  };

  const closeAndOpenStrategy = () => {
    onClose();
    onOpenStrategy();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[520px] max-h-[85vh] bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
              <BarChart3 size={18} className="text-primary" />
            <h2 className="text-sm font-bold text-white">Indicators & Strategy</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pt-3 pb-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search indicators..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 pb-5 space-y-4">

          {/* Strategy */}
          <section>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Strategy</div>
            <button
              onClick={closeAndOpenStrategy}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 transition-colors text-left"
            >
              <Code2 size={16} className="text-primary shrink-0" />
              <div>
                <div className="text-xs font-semibold text-zinc-200">Deploy Strategy</div>
                <div className="text-[10px] text-zinc-500">Write a Python trading script</div>
              </div>
            </button>
          </section>

          {/* Indicators by Category */}
          {categoryOrder.map(cat => {
            if (cat === 'favorites') {
              const favDefs = BUILTIN_DEFS.filter(d => favorites.includes(d.id));
              if (favDefs.length === 0 && search) return null;
              if (favDefs.length === 0 && !search) return null;
              return (
                <CategorySection
                  key="favorites"
                  label="Favorites"
                  isCollapsed={collapsed.favorites ?? false}
                  onToggle={() => toggleCollapse('favorites')}
                >
                  {favDefs.map(def => (
                    <IndicatorRow
                      key={def.id} def={def}
                      active={isActive(def.id)}
                      isExpanded={expandedConfig[def.id] ?? false}
                      onToggle={() => {
                        const existing = activeIndicators.find(i => i.type === def.type);
                        if (existing) { onRemoveIndicator(existing.id); return; }
                        toggleExpand(def.id);
                      }}
                      onExpand={() => toggleExpand(def.id)}
                      paramValues={paramValues[def.id] || {}}
                      onParamChange={(key, val) => setParam(def.id, key, val)}
                      selectedColor={selectedColors[def.id]}
                      onColorChange={(c) => setSelectedColors(prev => ({ ...prev, [def.id]: c }))}
                      onAdd={() => {
                        const vals = paramValues[def.id] || {};
                        const numeric: Record<string, number> = {};
                        def.params.forEach(p => { numeric[p.key] = parseFloat(vals[p.key] || p.default); });
                        handleAddIndicator(def, numeric);
                      }}
                    />
                  ))}
                </CategorySection>
              );
            }

            if (cat === 'custom') {
              if (filteredCustom.length === 0 && search) return null;
              return (
                <CategorySection
                  key="custom"
                  label="Custom (Python)"
                  isCollapsed={collapsed.custom ?? false}
                  onToggle={() => toggleCollapse('custom')}
                >
                  {filteredCustom.map(def => {
                    const active = activeIndicators.some(i => i.id === def.id);
                    return (
                      <div key={def.id} className="group flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-800/30 border border-zinc-800">
                        <button
                          onClick={() => active ? onRemoveIndicator(def.id) : handleAddCustom(def)}
                          className="flex items-center gap-3 flex-1 text-left"
                        >
                          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? 'border-green-500 bg-green-500' : 'border-zinc-600'}`}>
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
                  <button
                    onClick={() => { onClose(); onOpenCustomModal(); }}
                    className="mt-1.5 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-zinc-700 text-xs text-primary hover:bg-zinc-800/50 transition-colors"
                  >
                    <Plus size={14} />
                    New Custom Indicator
                  </button>
                </CategorySection>
              );
            }

            const items = groupedByCategory[cat] || [];
            if (items.length === 0) return null;

            return (
              <CategorySection
                key={cat}
                label={categoryLabels[cat] || cat}
                isCollapsed={collapsed[cat] ?? false}
                onToggle={() => toggleCollapse(cat)}
              >
                {items.map(def => (
                  <IndicatorRow
                    key={def.id} def={def}
                    isFavorite={favorites.includes(def.id)}
                    onToggleFavorite={() => handleToggleFavorite(def.id)}
                    active={isActive(def.id)}
                    isExpanded={expandedConfig[def.id] ?? false}
                    onToggle={() => {
                      const existing = activeIndicators.find(i => i.type === def.type);
                      if (existing) { onRemoveIndicator(existing.id); return; }
                      toggleExpand(def.id);
                    }}
                    onExpand={() => toggleExpand(def.id)}
                    paramValues={paramValues[def.id] || {}}
                    onParamChange={(key, val) => setParam(def.id, key, val)}
                    selectedColor={selectedColors[def.id]}
                    onColorChange={(c) => setSelectedColors(prev => ({ ...prev, [def.id]: c }))}
                    onAdd={() => {
                      const vals = paramValues[def.id] || {};
                      const numeric: Record<string, number> = {};
                      def.params.forEach(p => { numeric[p.key] = parseFloat(vals[p.key] || p.default); });
                      handleAddIndicator(def, numeric);
                    }}
                  />
                ))}
              </CategorySection>
            );
          })}

          {!search && activeIndicators.length > 0 && (
            <section>
              <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Active on Chart</div>
              <div className="flex flex-wrap gap-1.5">
                {activeIndicators.map(config => (
                  <span
                    key={config.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium"
                    style={{ backgroundColor: config.color + '20', color: config.color, border: `1px solid ${config.color}40` }}
                  >
                    {config.name || config.type}
                    <button onClick={() => onRemoveIndicator(config.id)} className="hover:opacity-70">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

function CategorySection({
  label, isCollapsed, onToggle, children,
}: {
  label: string; isCollapsed: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <section>
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 w-full text-left"
      >
        <ChevronRight size={12} className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
        {label}
      </button>
      {!isCollapsed && <div className="space-y-1">{children}</div>}
    </section>
  );
}

const PRESET_COLORS = ['#3b82f6', '#f59e0b', '#22c55e', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#10b981'];

function ColorPicker({ selected, onChange }: { selected?: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <Palette size={10} className="text-zinc-500" />
      <div className="flex gap-1">
        {PRESET_COLORS.map(c => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={`w-3.5 h-3.5 rounded-full border transition-all ${selected === c ? 'ring-1 ring-white ring-offset-1 ring-offset-zinc-900 scale-110' : 'border-zinc-600'}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  );
}

function IndicatorRow({
  def, active, isExpanded, onToggle, onExpand, paramValues, onParamChange, selectedColor, onColorChange, onAdd, isFavorite, onToggleFavorite,
}: {
  def: typeof BUILTIN_DEFS[number]; active: boolean; isExpanded: boolean;
  onToggle: () => void; onExpand: () => void;
  paramValues: Record<string, string>; onParamChange: (key: string, value: string) => void;
  selectedColor?: string; onColorChange: (c: string) => void; onAdd: () => void;
  isFavorite?: boolean; onToggleFavorite?: () => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden">
      <div className="flex items-center gap-1">
        <button
          onClick={onToggle}
          className="flex items-center gap-3 px-3 py-2.5 bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors text-left flex-1"
        >
          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
            active ? 'border-green-500 bg-green-500' : 'border-zinc-600'
          }`}>
            {active && <Check size={10} className="text-white" />}
          </span>
          <div className="flex-1">
            <div className="text-xs font-semibold text-zinc-200">{def.label}</div>
            <div className="text-[10px] text-zinc-500">{INDICATOR_DESCRIPTIONS[def.id] || ''}</div>
          </div>
          {active && <span className="text-[10px] text-green-500 font-bold mr-1">Active</span>}
        </button>
        {onToggleFavorite && (
          <button
            onClick={onToggleFavorite}
            className={`p-1.5 mr-1 rounded transition-colors ${isFavorite ? 'text-yellow-400' : 'text-zinc-600 hover:text-zinc-400'}`}
          >
            <Star size={12} />
          </button>
        )}
        {!active && (
          <button
            onClick={onExpand}
            className="p-2 mr-1 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {isExpanded && def.params.length > 0 && (
        <div className="px-4 py-3 bg-zinc-800/50 border-t border-zinc-800 space-y-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            {def.params.map(p => (
              <div key={p.key} className="flex items-center gap-1">
                <span className="text-[10px] text-zinc-500">{p.label}:</span>
                <input
                  type="number"
                  min={p.min ?? 1}
                  max={p.max ?? 999}
                  step={p.step ?? '1'}
                  value={paramValues[p.key] ?? p.default}
                  onChange={(e) => onParamChange(p.key, e.target.value)}
                  className="w-14 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-[10px] text-zinc-200 text-center"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <ColorPicker selected={selectedColor} onChange={onColorChange} />
            <div className="flex gap-2">
              <button onClick={onAdd} className="px-3 py-1 rounded text-[10px] font-bold text-green-500 hover:bg-green-500/10 transition-colors">
                Add
              </button>
              <button onClick={() => onExpand()} className="px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-400 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import type { AlertRule, AlertActionConfig } from '../../hooks/useSimulator';

interface AlertCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (alert: Partial<AlertRule>) => void;
  editAlert?: AlertRule | null;
}

const CONDITION_TYPES = [
  { value: 'crossing', label: 'Crossing' },
  { value: 'crossing_up', label: 'Crossing Up' },
  { value: 'crossing_down', label: 'Crossing Down' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'greater_than_or_equal', label: '>= Greater or Equal' },
  { value: 'less_than_or_equal', label: '<= Less or Equal' },
  { value: 'range', label: 'Range' },
];

const FREQUENCY_OPTIONS = [
  { value: 'OncePerBarClose', label: 'Once Per Bar Close' },
  { value: 'OncePerBar', label: 'Once Per Bar' },
  { value: 'OnEveryTick', label: 'On Every Tick' },
];

const SERIES_OPTIONS = [
  { value: 'close', label: 'Close' },
  { value: 'open', label: 'Open' },
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Low' },
  { value: 'volume', label: 'Volume' },
];

export function AlertCreator({ isOpen, onClose, onSave, editAlert }: AlertCreatorProps) {
  const [name, setName] = useState(editAlert?.name ?? '');
  const [symbol, setSymbol] = useState(editAlert?.symbol ?? 'BTCUSDT');
  const [timeframe, setTimeframe] = useState(editAlert?.timeframe ?? '5m');
  const [conditionType, setConditionType] = useState(editAlert?.condition_type ?? 'crossing');
  const [conditionParams, setConditionParams] = useState<Record<string, unknown>>(
    editAlert?.condition_params ?? { series1: 'close', series2: 'open', prev1: 0, prev2: 0 }
  );
  const [frequency, setFrequency] = useState(editAlert?.frequency ?? 'OncePerBarClose');
  const [actions, setActions] = useState<AlertActionConfig[]>(
    editAlert?.actions ?? []
  );
  const [enabled, setEnabled] = useState(editAlert?.enabled ?? true);

  if (!isOpen) return null;

  const handleAddAction = () => {
    setActions([...actions, { type: 'webhook', enabled: true }]);
  };

  const handleRemoveAction = (idx: number) => {
    setActions(actions.filter((_, i) => i !== idx));
  };

  const handleUpdateAction = (idx: number, field: string, value: string | boolean) => {
    setActions(actions.map((a, i) => i === idx ? { ...a, [field]: value } : a));
  };

  const handleSave = () => {
    onSave({
      id: editAlert?.id,
      name,
      symbol,
      timeframe,
      condition_type: conditionType,
      condition_params: conditionParams,
      frequency,
      actions,
      enabled,
    });
    onClose();
  };

  const getPreviewText = () => {
    const typeLabel = CONDITION_TYPES.find(t => t.value === conditionType)?.label ?? conditionType;
    const s1 = conditionParams.series1 as string ?? '';
    const s2 = conditionParams.series2 as string ?? '';
    const val = conditionParams.value as number ?? 0;
    if (['crossing', 'crossing_up', 'crossing_down'].includes(conditionType)) {
      return `${symbol} ${timeframe}: ${s1} ${typeLabel} ${s2}`;
    }
    return `${symbol} ${timeframe}: ${s1} ${typeLabel} ${val}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-zinc-700">
          <h2 className="text-lg font-bold">{editAlert ? 'Edit Alert' : 'Create Alert'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="SMA Crossover Alert"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Symbol</label>
              <select
                value={symbol}
                onChange={e => setSymbol(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white"
              >
                <option value="BTCUSDT">BTC/USDT</option>
                <option value="ETHUSDT">ETH/USDT</option>
                <option value="SOLUSDT">SOL/USDT</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Timeframe</label>
              <select
                value={timeframe}
                onChange={e => setTimeframe(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white"
              >
                <option value="1m">1m</option>
                <option value="5m">5m</option>
                <option value="15m">15m</option>
                <option value="1h">1h</option>
                <option value="4h">4h</option>
                <option value="1d">1d</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Condition</label>
              <select
                value={conditionType}
                onChange={e => setConditionType(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white"
              >
                {CONDITION_TYPES.map(ct => (
                  <option key={ct.value} value={ct.value}>{ct.label}</option>
                ))}
              </select>
            </div>
          </div>

          {['crossing', 'crossing_up', 'crossing_down'].includes(conditionType) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Series 1</label>
                <select
                  value={conditionParams.series1 as string ?? 'close'}
                  onChange={e => setConditionParams({ ...conditionParams, series1: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white"
                >
                  {SERIES_OPTIONS.map(so => (
                    <option key={so.value} value={so.value}>{so.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Series 2</label>
                <select
                  value={conditionParams.series2 as string ?? 'open'}
                  onChange={e => setConditionParams({ ...conditionParams, series2: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white"
                >
                  {SERIES_OPTIONS.map(so => (
                    <option key={so.value} value={so.value}>{so.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {['greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal'].includes(conditionType) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Series</label>
                <select
                  value={conditionParams.series as string ?? 'close'}
                  onChange={e => setConditionParams({ ...conditionParams, series: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white"
                >
                  {SERIES_OPTIONS.map(so => (
                    <option key={so.value} value={so.value}>{so.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Value</label>
                <input
                  type="number"
                  value={conditionParams.value as number ?? 0}
                  onChange={e => setConditionParams({ ...conditionParams, value: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
          )}

          {conditionType === 'range' && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Series</label>
                <select
                  value={conditionParams.series as string ?? 'close'}
                  onChange={e => setConditionParams({ ...conditionParams, series: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white"
                >
                  {SERIES_OPTIONS.map(so => (
                    <option key={so.value} value={so.value}>{so.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Upper</label>
                <input
                  type="number"
                  value={conditionParams.upper as number ?? 0}
                  onChange={e => setConditionParams({ ...conditionParams, upper: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Lower</label>
                <input
                  type="number"
                  value={conditionParams.lower as number ?? 0}
                  onChange={e => setConditionParams({ ...conditionParams, lower: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Frequency</label>
            <select
              value={frequency}
              onChange={e => setFrequency(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white"
            >
              {FREQUENCY_OPTIONS.map(fo => (
                <option key={fo.value} value={fo.value}>{fo.label}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-zinc-400">Actions</label>
              <button
                onClick={handleAddAction}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
              >
                <Plus size={12} /> Add Action
              </button>
            </div>
            <div className="space-y-2">
              {actions.map((action, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-zinc-800 rounded p-2">
                  <select
                    value={action.type}
                    onChange={e => handleUpdateAction(idx, 'type', e.target.value)}
                    className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs text-white"
                  >
                    <option value="webhook">Webhook</option>
                    <option value="email">Email</option>
                    <option value="push">Push Notification</option>
                    <option value="sound">Sound</option>
                  </select>
                  {action.type === 'webhook' && (
                    <input
                      value={action.url ?? ''}
                      onChange={e => handleUpdateAction(idx, 'url', e.target.value)}
                      placeholder="https://..."
                      className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs text-white placeholder-zinc-500"
                    />
                  )}
                  {action.type === 'email' && (
                    <input
                      value={action.email ?? ''}
                      onChange={e => handleUpdateAction(idx, 'email', e.target.value)}
                      placeholder="email@example.com"
                      className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs text-white placeholder-zinc-500"
                    />
                  )}
                  <label className="flex items-center gap-1 text-xs text-zinc-400">
                    <input
                      type="checkbox"
                      checked={action.enabled}
                      onChange={e => handleUpdateAction(idx, 'enabled', e.target.checked)}
                      className="rounded"
                    />
                    On
                  </label>
                  <button onClick={() => handleRemoveAction(idx)} className="p-1 hover:bg-zinc-700 rounded text-zinc-500 hover:text-red-400">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={enabled}
                onChange={e => setEnabled(e.target.checked)}
                className="rounded"
              />
              Enabled
            </label>
          </div>

          <div className="bg-zinc-800 border border-zinc-700 rounded p-3">
            <span className="text-xs text-zinc-500">Preview: </span>
            <span className="text-sm text-zinc-300">{getPreviewText()}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-zinc-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors"
          >
            {editAlert ? 'Update Alert' : 'Create Alert'}
          </button>
        </div>
      </div>
    </div>
  );
}

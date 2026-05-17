import { useState } from 'react';
import { Plus, Pencil, Trash2, Bell, BellOff, History } from 'lucide-react';
import type { AlertRule, WebhookLog } from '../../hooks/useSimulator';

interface AlertsListProps {
  alerts: AlertRule[];
  webhookLogs: WebhookLog[];
  onAdd: () => void;
  onEdit: (alert: AlertRule) => void;
  onDelete: (id: string) => void;
  onToggle: (alert: AlertRule) => void;
}

const CONDITION_LABELS: Record<string, string> = {
  crossing: 'Crossing',
  crossing_up: 'Crossing Up',
  crossing_down: 'Crossing Down',
  greater_than: '>',
  less_than: '<',
  greater_than_or_equal: '>=',
  less_than_or_equal: '<=',
  range: 'Range',
};

export function AlertsList({ alerts, webhookLogs, onAdd, onEdit, onDelete, onToggle }: AlertsListProps) {
  const [showLogs, setShowLogs] = useState(false);

  return (
    <div className="h-full flex flex-col bg-[#09090b]">
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <h2 className="text-lg font-bold text-white">Alerts</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              showLogs
                ? 'bg-zinc-700 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            <History size={14} />
            Logs
          </button>
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold transition-colors"
          >
            <Plus size={14} />
            New Alert
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {showLogs ? (
          <div className="p-4 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">Webhook Delivery Logs</h3>
            {webhookLogs.length === 0 ? (
              <p className="text-sm text-zinc-600">No webhook deliveries yet.</p>
            ) : (
              webhookLogs.slice().reverse().map((log) => (
                <div key={log.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-zinc-500">{log.event_type}</span>
                    <span className={`text-xs font-mono ${
                      log.response_status && log.response_status >= 200 && log.response_status < 300
                        ? 'text-green-500'
                        : 'text-red-500'
                    }`}>
                      {log.response_status ?? 'N/A'}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500">{log.created_at}</div>
                  {log.error && <div className="text-xs text-red-400 mt-1">{log.error}</div>}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Bell size={48} className="text-zinc-700 mb-3" />
                <p className="text-zinc-500 text-sm mb-1">No alert rules configured</p>
                <p className="text-zinc-600 text-xs">Create your first alert to get notified about market conditions.</p>
              </div>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`bg-zinc-900 border border-zinc-800 rounded-lg p-3 transition-opacity ${
                    alert.enabled ? 'opacity-100' : 'opacity-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-white truncate">{alert.name}</h4>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                          {alert.symbol.replace('USDT', '/USDT')}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                          {alert.timeframe}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {CONDITION_LABELS[alert.condition_type] ?? alert.condition_type}
                        {' › '}
                        {alert.condition_type === 'crossing' && (
                          <span className="text-zinc-400">
                            {alert.condition_params.series1 as string} × {alert.condition_params.series2 as string}
                          </span>
                        )}
                        {['greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal'].includes(alert.condition_type) && (
                          <span className="text-zinc-400">
                            {alert.condition_params.series as string} {CONDITION_LABELS[alert.condition_type]} {alert.condition_params.value as number}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-[10px] text-zinc-600">{alert.frequency}</span>
                        {alert.actions.length > 0 && (
                          <span className="text-[10px] text-zinc-600">
                            {alert.actions.filter(a => a.enabled).length} action(s)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => onToggle(alert)}
                        className={`p-1.5 rounded transition-colors ${
                          alert.enabled
                            ? 'text-green-500 hover:bg-green-500/10'
                            : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800'
                        }`}
                        title={alert.enabled ? 'Disable' : 'Enable'}
                      >
                        {alert.enabled ? <Bell size={14} /> : <BellOff size={14} />}
                      </button>
                      <button
                        onClick={() => onEdit(alert)}
                        className="p-1.5 rounded text-zinc-600 hover:text-white hover:bg-zinc-800 transition-colors"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => onDelete(alert.id)}
                        className="p-1.5 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

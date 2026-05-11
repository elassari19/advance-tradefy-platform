import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Pencil, Check } from "lucide-react";
import type { WebhookConfig } from "../../hooks/useSimulator";

interface WebhookSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  webhooks: WebhookConfig[];
  onSaveWebhooks: (webhooks: WebhookConfig[]) => Promise<void>;
}

export function WebhookSettings({ isOpen, onClose, webhooks, onSaveWebhooks }: WebhookSettingsProps) {
  const [localWebhooks, setLocalWebhooks] = useState<WebhookConfig[]>(webhooks);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalWebhooks(webhooks);
  }, [webhooks]);

  if (!isOpen) return null;

  const generateId = () => Math.random().toString(36).substring(2, 15);

  const handleAdd = () => {
    const newWebhook: WebhookConfig = {
      id: generateId(),
      name: 'New Webhook',
      url: '',
      secret_token: '',
      enabled: true,
    };
    setLocalWebhooks([...localWebhooks, newWebhook]);
    setEditingId(newWebhook.id);
  };

  const handleDelete = (id: string) => {
    setLocalWebhooks(localWebhooks.filter(w => w.id !== id));
  };

  const handleToggle = (id: string) => {
    setLocalWebhooks(localWebhooks.map(w => 
      w.id === id ? { ...w, enabled: !w.enabled } : w
    ));
  };

  const handleUpdate = (id: string, field: keyof WebhookConfig, value: string | boolean) => {
    setLocalWebhooks(localWebhooks.map(w => 
      w.id === id ? { ...w, [field]: value } : w
    ));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveWebhooks(localWebhooks);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">Webhook Settings</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
          {localWebhooks.map((webhook) => (
            <div key={webhook.id} className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                {editingId === webhook.id ? (
                  <input
                    type="text"
                    value={webhook.name}
                    onChange={(e) => handleUpdate(webhook.id, 'name', e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                ) : (
                  <span className="text-sm font-medium text-white">{webhook.name}</span>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(webhook.id)}
                    className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                      webhook.enabled 
                        ? 'bg-green-500/20 text-green-500' 
                        : 'bg-zinc-800 text-zinc-500'
                    }`}
                  >
                    {webhook.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  {editingId === webhook.id ? (
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1 rounded text-green-500 hover:bg-zinc-800"
                    >
                      <Check size={16} />
                    </button>
                  ) : (
                    <button
                      onClick={() => setEditingId(webhook.id)}
                      className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(webhook.id)}
                    className="p-1 rounded text-red-500 hover:bg-zinc-800"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">URL</label>
                  <input
                    type="text"
                    value={webhook.url}
                    onChange={(e) => handleUpdate(webhook.id, 'url', e.target.value)}
                    placeholder="https://webhook.site/..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Secret Token</label>
                  <input
                    type="password"
                    value={webhook.secret_token}
                    onChange={(e) => handleUpdate(webhook.id, 'secret_token', e.target.value)}
                    placeholder="Verification Key"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          ))}
          
          <button
            onClick={handleAdd}
            className="w-full py-3 border border-dashed border-zinc-700 rounded-lg text-zinc-400 hover:text-white hover:border-zinc-600 flex items-center justify-center gap-2 text-sm transition-colors"
          >
            <Plus size={16} />
            Add Webhook
          </button>
        </div>
        
        <div className="flex justify-end gap-3 p-4 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
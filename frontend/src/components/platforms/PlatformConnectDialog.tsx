import { useState, useEffect } from 'react';
import { X, Loader2, CheckCircle, AlertTriangle, Wallet } from "lucide-react";
import type { PlatformConnection, PlatformDef, TestConnectionResponse } from "../../types/platforms";
import { AVAILABLE_PLATFORMS } from "../../types/platforms";

interface PlatformConnectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (connection: Partial<PlatformConnection>) => Promise<void>;
  editingConnection: PlatformConnection | null;
  preselectedPlatformId: string | null;
}

export function PlatformConnectDialog({
  isOpen,
  onClose,
  onSave,
  editingConnection,
  preselectedPlatformId,
}: PlatformConnectDialogProps) {
  const [platformId, setPlatformId] = useState('');
  const [connectionName, setConnectionName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [isTestnet, setIsTestnet] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResponse | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (editingConnection) {
      setPlatformId(editingConnection.platform_id);
      setConnectionName(editingConnection.connection_name);
      setApiKey(editingConnection.api_key);
      setSecretKey(editingConnection.secret_key);
      setIsTestnet(editingConnection.is_testnet);
    } else {
      setPlatformId(preselectedPlatformId ?? '');
      setConnectionName('');
      setApiKey('');
      setSecretKey('');
      setIsTestnet(false);
    }
    setTestResult(null);
  }, [editingConnection, preselectedPlatformId, isOpen]);

  if (!isOpen) return null;

  const platformDef = AVAILABLE_PLATFORMS.find(p => p.id === platformId);
  const isValid = platformId && connectionName.trim() && apiKey.trim() && secretKey.trim();

  const handleTest = async () => {
    if (!isValid) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('http://127.0.0.1:3000/api/platforms/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform_id: platformId, api_key: apiKey, secret_key: secretKey, is_testnet: isTestnet }),
      });
      const data: TestConnectionResponse = await res.json();
      setTestResult(data);
      if (data.success) {
        const total = data.balance ? Object.values(data.balance as Record<string, number>).reduce((a, b) => a + b, 0) : 0;
        const nonZero = data.balance ? Object.entries(data.balance as Record<string, number>).filter(([, v]) => v > 0).length : 0;
        setTestResult({ ...data, balance: { total_assets: total, non_zero_assets: nonZero } as any });
      }
    } catch {
      setTestResult({ success: false, balance: null, error: 'Connection failed' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!isValid) return;
    setIsSaving(true);
    try {
      await onSave({
        id: editingConnection?.id,
        platform_id: platformId,
        connection_name: connectionName.trim(),
        api_key: apiKey.trim(),
        secret_key: secretKey.trim(),
        is_testnet: isTestnet,
        status: testResult?.success ? 'connected' : 'unknown',
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg max-h-[85vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <Wallet size={20} className="text-zinc-400 shrink-0" />
            <h2 className="text-lg font-semibold text-white">
              {editingConnection ? 'Edit Connection' : 'New Connection'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto max-h-[65vh]">
          <div>
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Platform</label>
            {editingConnection ? (
              <div className="mt-1 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg">
                <span className="text-sm text-white font-medium">{platformDef?.name ?? platformId}</span>
              </div>
            ) : (
              <select
                value={platformId}
                onChange={e => setPlatformId(e.target.value)}
                className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-lime-500"
              >
                <option value="">Select a platform...</option>
                {AVAILABLE_PLATFORMS.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Connection Name</label>
            <input
              type="text"
              value={connectionName}
              onChange={e => setConnectionName(e.target.value)}
              placeholder="e.g. Spot Trading Bot #1"
              className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-lime-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">API Key</label>
            <input
              type="text"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Enter your API key"
              className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-lime-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Secret Key</label>
            <input
              type="password"
              value={secretKey}
              onChange={e => setSecretKey(e.target.value)}
              placeholder="Enter your secret key"
              className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-lime-500"
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                checked={isTestnet}
                onChange={e => setIsTestnet(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-zinc-700 rounded-full peer-checked:bg-lime-600 transition-colors" />
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${isTestnet ? 'translate-x-4' : ''}`} />
            </div>
            <span className="text-sm text-zinc-300">Use Testnet / Sandbox</span>
          </label>

          <button
            onClick={handleTest}
            disabled={!isValid || isTesting}
            className="w-full py-2.5 border border-zinc-700 rounded-lg text-sm font-medium text-zinc-300 hover:text-white hover:border-zinc-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isTesting ? (
              <><Loader2 size={14} className="animate-spin" /> Testing...</>
            ) : (
              'Test Connection'
            )}
          </button>

          {testResult && (
            <div className={`p-3 rounded-lg border text-sm ${
              testResult.success
                ? 'bg-green-500/10 border-green-500/20 text-green-400'
                : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}>
              <div className="flex items-center gap-2 font-medium">
                {testResult.success ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                {testResult.success ? 'Connection Successful' : 'Connection Failed'}
              </div>
              {testResult.success && testResult.balance && (
                <div className="mt-1 text-xs text-zinc-400">
                  Non-zero assets: {(testResult.balance as any).non_zero_assets ?? 0}
                </div>
              )}
              {testResult.error && (
                <div className="mt-1 text-xs text-red-400/80 break-all">{testResult.error}</div>
              )}
            </div>
          )}
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
            disabled={!isValid || isSaving}
            className="px-4 py-2 bg-lime-600 text-white rounded-lg text-sm font-medium hover:bg-lime-500 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : (editingConnection ? 'Save Changes' : 'Connect')}
          </button>
        </div>
      </div>
    </div>
  );
}

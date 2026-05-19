import { useState, useMemo } from 'react';
import { Search, Plug, Cable } from "lucide-react";
import { AVAILABLE_PLATFORMS } from "../../types/platforms";
import type { PlatformConnection } from "../../types/platforms";
import { PlatformCard } from "./PlatformCard";
import { ConnectedPlatformCard } from "./ConnectedPlatformCard";
import { PlatformConnectDialog } from "./PlatformConnectDialog";

interface PlatformsPageProps {
  connections: PlatformConnection[];
  onSaveConnection: (connection: Partial<PlatformConnection>) => Promise<void>;
  onDeleteConnection: (id: string) => Promise<void>;
  onTestConnection: (connection: PlatformConnection) => Promise<void>;
  testingConnectionId: string | null;
}

export function PlatformsPage({
  connections,
  onSaveConnection,
  onDeleteConnection,
  onTestConnection,
  testingConnectionId,
}: PlatformsPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editingConnection, setEditingConnection] = useState<PlatformConnection | null>(null);
  const [preselectedPlatformId, setPreselectedPlatformId] = useState<string | null>(null);

  const filteredPlatforms = useMemo(() => {
    if (!searchQuery.trim()) return AVAILABLE_PLATFORMS;
    const q = searchQuery.toLowerCase();
    return AVAILABLE_PLATFORMS.filter(
      p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.ccxtId.includes(q)
    );
  }, [searchQuery]);

  const handleConnect = (platformId: string) => {
    setEditingConnection(null);
    setPreselectedPlatformId(platformId);
    setShowDialog(true);
  };

  const handleEdit = (connection: PlatformConnection) => {
    setEditingConnection(connection);
    setPreselectedPlatformId(null);
    setShowDialog(true);
  };

  const handleDialogSave = async (connection: Partial<PlatformConnection>) => {
    await onSaveConnection(connection);
    setShowDialog(false);
    setEditingConnection(null);
    setPreselectedPlatformId(null);
  };

  const handleDelete = async (id: string) => {
    await onDeleteConnection(id);
  };

  const handleTest = async (connection: PlatformConnection) => {
    await onTestConnection(connection);
  };

  const connectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of connections) {
      counts[c.platform_id] = (counts[c.platform_id] ?? 0) + 1;
    }
    return counts;
  }, [connections]);

  return (
    <div className="h-[calc(100vh-56px)] overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-lime-600/20 border border-lime-500/30 flex items-center justify-center shrink-0">
            <Cable size={20} className="text-lime-400 shrink-0" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Platforms</h1>
            <p className="text-xs text-zinc-500">Connect your exchange API keys</p>
          </div>
        </div>

        {connections.length > 0 && (
          <section>
            <h2 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3">
              Connected Connections ({connections.length})
            </h2>
            <div className="space-y-2">
              {connections.map(conn => (
                <ConnectedPlatformCard
                  key={conn.id}
                  connection={conn}
                  platformDef={AVAILABLE_PLATFORMS.find(p => p.id === conn.platform_id)}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onTest={handleTest}
                  isTesting={testingConnectionId === conn.id}
                />
              ))}
            </div>
          </section>
        )}

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search platforms..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-lime-500"
          />
        </div>

        <section>
          <h2 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3">
            Available Platforms
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredPlatforms.map(platform => (
              <PlatformCard
                key={platform.id}
                platform={platform}
                connectionCount={connectionCounts[platform.id] ?? 0}
                onConnect={handleConnect}
              />
            ))}
          </div>
          {filteredPlatforms.length === 0 && (
            <div className="text-center py-12 text-zinc-500">
              <Plug size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">No platforms match "{searchQuery}"</p>
            </div>
          )}
        </section>
      </div>

      <PlatformConnectDialog
        isOpen={showDialog}
        onClose={() => { setShowDialog(false); setEditingConnection(null); setPreselectedPlatformId(null); }}
        onSave={handleDialogSave}
        editingConnection={editingConnection}
        preselectedPlatformId={preselectedPlatformId}
      />
    </div>
  );
}

import { Code, Bell, FileCode } from "lucide-react";

export type RightPanel = 'script' | 'strategy' | 'alerts' | null;

interface RightSidebarProps {
  activePanel: RightPanel;
  onPanelChange: (panel: RightPanel) => void;
  alertCount?: number;
}

export function RightSidebar({ activePanel, onPanelChange, alertCount }: RightSidebarProps) {
  const navItems = [
    { id: 'script' as const, icon: Code, label: 'Pen Script' },
    { id: 'strategy' as const, icon: FileCode, label: 'Strategy' },
    { id: 'alerts' as const, icon: Bell, label: 'Alerts', badge: alertCount },
  ];

  return (
    <nav className="fixed right-0 top-0 h-full w-14 flex flex-col items-center pt-14 gap-1 border-l border-zinc-800 bg-[#09090b] z-40">
      {navItems.map(({ id, icon: Icon, label, badge }) => (
        <button
          key={id}
          onClick={() => onPanelChange(activePanel === id ? null : id)}
          className={`relative flex items-center justify-center w-9 h-9 rounded-lg transition-all ${
            activePanel === id
              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
          }`}
          title={label}
        >
          <Icon size={18} />
          {badge !== undefined && badge > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-red-500 text-[8px] font-bold text-white flex items-center justify-center">
              {badge}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}

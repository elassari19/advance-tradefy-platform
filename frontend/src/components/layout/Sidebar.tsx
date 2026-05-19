import { LineChart, FlaskConical, Code, Bell, Cable } from "lucide-react";

type View = 'trade' | 'backtest' | 'script' | 'alerts' | 'platforms';

interface SidebarProps {
  view: View;
  onViewChange: (view: View) => void;
  isOpen: boolean;
  alertCount?: number;
}

export function Sidebar({ view, onViewChange, isOpen, alertCount }: SidebarProps) {
  const navItems = [
    { id: 'trade' as const, icon: LineChart, label: 'Trade' },
    { id: 'backtest' as const, icon: FlaskConical, label: 'Backtest' },
    { id: 'script' as const, icon: Code, label: 'Pen Script' },
    { id: 'alerts' as const, icon: Bell, label: 'Alerts', badge: alertCount },
    { id: 'platforms' as const, icon: Cable, label: 'Platforms' },
  ];

  return (
    <nav className={`fixed left-0 top-0 h-full w-14 flex flex-col items-center pt-14 gap-1 border-r border-zinc-800 bg-[#09090b] z-40 transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      {navItems.map(({ id, icon: Icon, label, badge }) => (
        <button
          key={id}
          onClick={() => onViewChange(id)}
          className={`relative flex items-center justify-center w-9 h-9 rounded-lg transition-all ${
            view === id
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

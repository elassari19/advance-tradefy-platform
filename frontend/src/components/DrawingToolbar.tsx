import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Minus, TrendingUp, Square, MousePointer2, Trash2, GripVertical } from 'lucide-react';

export type DrawingTool = 'pointer' | 'trend-line' | 'horizontal-line' | 'rectangle';

const POSITION_KEY = 'drawingToolbarPosition';

function loadPosition() {
  try {
    const saved = localStorage.getItem(POSITION_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return { x: 74, y: 74 };
}

function savePosition(pos: { x: number; y: number }) {
  try { localStorage.setItem(POSITION_KEY, JSON.stringify(pos)); } catch {}
}

interface DrawingToolbarProps {
  activeTool: DrawingTool;
  onToolChange: (tool: DrawingTool) => void;
  onClearAll: () => void;
}

export const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
  activeTool,
  onToolChange,
  onClearAll,
}) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(loadPosition);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const posRef = useRef(position);
  posRef.current = position;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    const rect = toolbarRef.current?.getBoundingClientRect();
    if (rect) {
      dragOffset.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    };
    const handleMouseUp = () => {
      setDragging(false);
      savePosition(posRef.current);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging]);

  const tools: { tool: DrawingTool; icon: React.ReactNode; label: string }[] = [
    { tool: 'pointer', icon: <MousePointer2 size={14} />, label: 'Pointer' },
    { tool: 'trend-line', icon: <TrendingUp size={14} />, label: 'Trend Line' },
    { tool: 'horizontal-line', icon: <Minus size={14} />, label: 'Horizontal Line' },
    { tool: 'rectangle', icon: <Square size={14} />, label: 'Rectangle' },
  ];

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 flex items-center gap-0.5 bg-zinc-900/95 border border-zinc-700 rounded-lg shadow-2xl px-1.5 py-1 select-none backdrop-blur-sm"
      style={{ left: position.x, top: position.y }}
    >
      <div
        className="cursor-grab active:cursor-grabbing p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
        onMouseDown={handleMouseDown}
      >
        <GripVertical size={14} />
      </div>

      <div className="w-px h-5 bg-zinc-700 mx-1" />

      {tools.map(({ tool, icon, label }) => (
        <button
          key={tool}
          onClick={() => onToolChange(tool)}
          className={`p-1.5 rounded transition-colors ${
            activeTool === tool
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
          title={label}
        >
          {icon}
        </button>
      ))}

      <div className="w-px h-5 bg-zinc-700 mx-1" />

      <button
        onClick={onClearAll}
        className="p-1.5 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
        title="Clear All Drawings"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
};

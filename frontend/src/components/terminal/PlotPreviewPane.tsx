import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, LineSeries } from 'lightweight-charts';

interface PlotEntry {
  time: number;
  value: number;
  title?: string;
  color?: string;
  style?: string;
  type?: string;
  price?: number;
}

interface PlotPreviewPaneProps {
  plots: PlotEntry[];
}

export const PlotPreviewPane: React.FC<PlotPreviewPaneProps> = ({ plots }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);

  useEffect(() => {
    if (!containerRef.current || plots.length === 0) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#09090b' },
        textColor: '#a1a1aa',
      },
      grid: {
        vertLines: { color: '#27272a' },
        horzLines: { color: '#27272a' },
      },
      width: containerRef.current.clientWidth,
      height: 120,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: false,
      handleScale: false,
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: '#27272a' },
    });

    chartRef.current = chart;

    const lineSeries = chart.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const lineData = plots
      .filter(p => p.type !== 'hline')
      .filter(p => Number.isFinite(p.value))
      .map(p => ({ time: p.time as any, value: p.value }));

    if (lineData.length > 0) {
      lineSeries.setData(lineData);
    }

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [plots]);

  if (plots.length === 0) return null;

  return (
    <div className="border-t border-zinc-800 bg-zinc-900/30">
      <div className="px-4 py-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        Plot Preview
      </div>
      <div ref={containerRef} className="w-full" />
    </div>
  );
};

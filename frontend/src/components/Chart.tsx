import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, AreaSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { Tick } from '../hooks/useMarketData';

interface ChartProps {
  ticks: Tick[];
}

export const Chart: React.FC<ChartProps> = ({ ticks }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#09090b' },
        textColor: '#a1a1aa',
      },
      grid: {
        vertLines: { color: '#27272a' },
        horzLines: { color: '#27272a' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
      },
    });

    const lineSeries = chart.addSeries(AreaSeries, {
      lineColor: '#3b82f6',
      topColor: 'rgba(59, 130, 246, 0.4)',
      bottomColor: 'rgba(59, 130, 246, 0.0)',
      lineWidth: 2,
    });

    chartRef.current = chart;
    lineSeriesRef.current = lineSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  const lastTimestampRef = useRef<number>(0);
  const initializedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!lineSeriesRef.current || ticks.length === 0) return;

    if (!initializedRef.current) {
      // Initial load
      const seenTimes = new Set();
      const data = ticks
        .map(t => ({
          time: Math.floor(t.time / 1000) as any,
          value: t.price,
        }))
        .filter(p => {
          if (seenTimes.has(p.time)) return false;
          seenTimes.add(p.time);
          return true;
        });

      try {
        lineSeriesRef.current.setData(data);
        if (data.length > 0) {
          lastTimestampRef.current = data[data.length - 1].time;
        }
        initializedRef.current = true;
      } catch (e) {
        console.error("Chart initial setData error:", e);
      }
    } else {
      // Live update
      const latestTick = ticks[ticks.length - 1];
      const roundedTime = Math.floor(latestTick.time / 1000);

      if (roundedTime > lastTimestampRef.current) {
        try {
          lineSeriesRef.current.update({
            time: roundedTime as any,
            value: latestTick.price,
          });
          lastTimestampRef.current = roundedTime;
        } catch (e) {
          console.error("Chart update error:", e);
        }
      }
    }
  }, [ticks]);

  return (
    <div className="w-full bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="p-3 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
        <h3 className="text-sm font-medium text-zinc-200">BTC/USDT Live</h3>
        <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-xs text-zinc-400">Live</span>
        </div>
      </div>
      <div ref={chartContainerRef} className="w-full h-[400px]" />
    </div>
  );
};

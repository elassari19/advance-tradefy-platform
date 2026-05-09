import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, AreaSeries, LineStyle } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, IPriceLine } from 'lightweight-charts';
import type { Tick } from '../hooks/useMarketData';
import type { Position } from '../hooks/useSimulator';

interface ChartProps {
  ticks: Tick[];
  positions: Position[];
  onUpdatePosition: (id: string, tp: number | null, sl: number | null) => void;
}

export const Chart: React.FC<ChartProps> = ({ ticks, positions, onUpdatePosition }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  const draggingRef = useRef<{ id: string; type: 'tp' | 'sl'; price: number } | null>(null);
  const positionsRef = useRef<Position[]>(positions);

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

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
      handleScroll: true,
      handleScale: true,
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

    // Drag and drop implementation
    const container = chartContainerRef.current;
    
    const onMouseDown = (e: MouseEvent) => {
      if (!lineSeriesRef.current || !chartRef.current) return;
      
      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const price = lineSeriesRef.current.coordinateToPrice(y);
      if (price === null) return;

      const tolerance = (lineSeriesRef.current.coordinateToPrice(y - 5) ?? price) - (lineSeriesRef.current.coordinateToPrice(y + 5) ?? price);
      const absTolerance = Math.abs(tolerance) || 5;

      for (const pos of positionsRef.current) {
        if (pos.take_profit && Math.abs(pos.take_profit - price) < absTolerance) {
          draggingRef.current = { id: pos.id, type: 'tp', price: pos.take_profit };
          chart.applyOptions({ handleScroll: false, handleScale: false });
          return;
        }
        if (pos.stop_loss && Math.abs(pos.stop_loss - price) < absTolerance) {
          draggingRef.current = { id: pos.id, type: 'sl', price: pos.stop_loss };
          chart.applyOptions({ handleScroll: false, handleScale: false });
          return;
        }
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current || !lineSeriesRef.current) return;
      
      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const price = lineSeriesRef.current.coordinateToPrice(y);
      if (price === null) return;

      draggingRef.current.price = price;
      
      const lineKey = `${draggingRef.current.id}-${draggingRef.current.type}`;
      const line = priceLinesRef.current.get(lineKey);
      if (line) {
        line.applyOptions({ price });
      }
    };

    const onMouseUp = () => {
      if (draggingRef.current) {
        const { id, type, price } = draggingRef.current;
        const pos = positionsRef.current.find(p => p.id === id);
        if (pos) {
          const newTp = type === 'tp' ? price : pos.take_profit;
          const newSl = type === 'sl' ? price : pos.stop_loss;
          onUpdatePosition(id, newTp, newSl);
        }
        draggingRef.current = null;
        chart.applyOptions({ handleScroll: true, handleScale: true });
      }
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      chart.remove();
    };
  }, [onUpdatePosition]);

  // Handle price lines for positions
  useEffect(() => {
    if (!lineSeriesRef.current) return;

    const series = lineSeriesRef.current;
    const currentKeys = new Set<string>();

    positions.forEach(pos => {
      // Entry Line
      const entryKey = `${pos.id}-entry`;
      currentKeys.add(entryKey);
      if (!priceLinesRef.current.has(entryKey)) {
        const line = series.createPriceLine({
          price: pos.entry_price,
          color: '#3b82f6',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: `Entry ${pos.side}`,
        });
        priceLinesRef.current.set(entryKey, line);
      }

      // TP Line
      if (pos.take_profit) {
        const tpKey = `${pos.id}-tp`;
        currentKeys.add(tpKey);
        if (!priceLinesRef.current.has(tpKey)) {
          const line = series.createPriceLine({
            price: pos.take_profit,
            color: '#22c55e',
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'TP',
          });
          priceLinesRef.current.set(tpKey, line);
        } else {
          // Update if not dragging
          if (draggingRef.current?.id !== pos.id || draggingRef.current?.type !== 'tp') {
            priceLinesRef.current.get(tpKey)?.applyOptions({ price: pos.take_profit });
          }
        }
      }

      // SL Line
      if (pos.stop_loss) {
        const slKey = `${pos.id}-sl`;
        currentKeys.add(slKey);
        if (!priceLinesRef.current.has(slKey)) {
          const line = series.createPriceLine({
            price: pos.stop_loss,
            color: '#ef4444',
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'SL',
          });
          priceLinesRef.current.set(slKey, line);
        } else {
          // Update if not dragging
          if (draggingRef.current?.id !== pos.id || draggingRef.current?.type !== 'sl') {
            priceLinesRef.current.get(slKey)?.applyOptions({ price: pos.stop_loss });
          }
        }
      }
    });

    // Remove old lines
    priceLinesRef.current.forEach((line, key) => {
      if (!currentKeys.has(key)) {
        series.removePriceLine(line);
        priceLinesRef.current.delete(key);
      }
    });
  }, [positions]);

  const lastTimestampRef = useRef<number>(0);
  const initializedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!lineSeriesRef.current || ticks.length === 0) return;

    if (!initializedRef.current) {
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
      <div ref={chartContainerRef} className="w-full h-[400px] relative cursor-crosshair" />
    </div>
  );
};

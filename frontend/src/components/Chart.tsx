import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, AreaSeries, LineSeries, CandlestickSeries, LineStyle } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, IPriceLine } from 'lightweight-charts';
import { ChevronDown, TrendingUp, TrendingDown } from 'lucide-react';
import type { Candle } from '../hooks/useMarketData';
import type { Position } from '../hooks/useSimulator';
import { TimeframeModal } from './settings/TimeframeModal';

type ChartType = 'area' | 'line' | 'candle';

interface ChartProps {
  candles: Candle[];
  positions: Position[];
  onUpdatePosition: (id: string, tp: number | null, sl: number | null) => void;
  timeframe: number;
  onTimeframeChange: (tf: number) => void;
  pairName?: string;
  price?: number;
  change24h?: number;
}

interface DropdownProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

function Dropdown({ value, options, onChange }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1.5 bg-zinc-800/50 hover:bg-zinc-700 rounded text-xs font-mono text-zinc-300 transition-colors border border-zinc-700"
      >
        {value}
        <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded shadow-xl z-20 min-w-[60px]">
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setIsOpen(false); }}
                className={`w-full px-3 py-1.5 text-xs font-mono text-left hover:bg-zinc-700 transition-colors ${
                  value === opt.value ? 'text-blue-400 bg-zinc-700/50' : 'text-zinc-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function formatTimeframe(minutes: number): string {
  if (minutes >= 10080) return `${Math.floor(minutes / 10080)}W`;
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)}D`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}H`;
  return `${minutes}m`;
}

export const Chart: React.FC<ChartProps> = ({ candles, positions, onUpdatePosition, timeframe, onTimeframeChange, pairName = 'BTC/USDT', price, change24h }) => {
  const [chartType, setChartType] = useState<ChartType>('area');
  const [showTimeframeModal, setShowTimeframeModal] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  const draggingRef = useRef<{ id: string; type: 'tp' | 'sl'; price: number } | null>(null);
  const positionsRef = useRef<Position[]>(positions);
  const activeSeriesRef = useRef<ISeriesApi<any> | null>(null);

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
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    });

    chartRef.current = chart;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    const container = chartContainerRef.current;
    
    const onMouseDown = (e: MouseEvent) => {
      if (!activeSeriesRef.current || !chartRef.current) return;
      
      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const price = activeSeriesRef.current.coordinateToPrice(y);
      if (price === null) return;

      const series = activeSeriesRef.current;
      const tolerance = Math.abs((series.coordinateToPrice(y - 5) ?? price) - (series.coordinateToPrice(y + 5) ?? price)) || 5;

      for (const pos of positionsRef.current) {
        if (pos.take_profit && Math.abs(pos.take_profit - price) < tolerance) {
          draggingRef.current = { id: pos.id, type: 'tp', price: pos.take_profit };
          chart.applyOptions({ handleScroll: false, handleScale: false });
          return;
        }
        if (pos.stop_loss && Math.abs(pos.stop_loss - price) < tolerance) {
          draggingRef.current = { id: pos.id, type: 'sl', price: pos.stop_loss };
          chart.applyOptions({ handleScroll: false, handleScale: false });
          return;
        }
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current || !activeSeriesRef.current) return;
      
      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const price = activeSeriesRef.current.coordinateToPrice(y);
      if (price === null) return;

      draggingRef.current.price = price;
      
      const lineKey = `${draggingRef.current.id}-${draggingRef.current.type}`;
      const line = priceLinesRef.current.get(lineKey);
      if (line) line.applyOptions({ price });
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

  useEffect(() => {
    if (!chartRef.current) return;

    areaSeriesRef.current = null;
    lineSeriesRef.current = null;
    candleSeriesRef.current = null;

    if (chartType === 'area') {
      areaSeriesRef.current = chartRef.current.addSeries(AreaSeries, {
        lineColor: '#3b82f6',
        topColor: 'rgba(59, 130, 246, 0.4)',
        bottomColor: 'rgba(59, 130, 246, 0.0)',
        lineWidth: 2,
      });
      activeSeriesRef.current = areaSeriesRef.current;
    } else if (chartType === 'line') {
      lineSeriesRef.current = chartRef.current.addSeries(LineSeries, {
        color: '#3b82f6',
        lineWidth: 2,
      });
      activeSeriesRef.current = lineSeriesRef.current;
    } else if (chartType === 'candle') {
      candleSeriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      });
      activeSeriesRef.current = candleSeriesRef.current;
    }
  }, [chartType]);

  useEffect(() => {
    if (!areaSeriesRef.current || !lineSeriesRef.current || !candleSeriesRef.current) return;
    const series = activeSeriesRef.current;
    if (!series) return;

    const currentKeys = new Set<string>();

    positions.forEach(pos => {
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
        } else if (draggingRef.current?.id !== pos.id || draggingRef.current?.type !== 'tp') {
          priceLinesRef.current.get(tpKey)?.applyOptions({ price: pos.take_profit });
        }
      }

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
        } else if (draggingRef.current?.id !== pos.id || draggingRef.current?.type !== 'sl') {
          priceLinesRef.current.get(slKey)?.applyOptions({ price: pos.stop_loss });
        }
      }
    });

    priceLinesRef.current.forEach((line, key) => {
      if (!currentKeys.has(key)) {
        series.removePriceLine(line);
        priceLinesRef.current.delete(key);
      }
    });
  }, [positions]);

  useEffect(() => {
    if (!activeSeriesRef.current) return;
    if (candles.length === 0) return;

    if (chartType === 'area' || chartType === 'line') {
      const data = candles.map(c => ({ time: c.time as any, value: c.close }));
      
      if (chartType === 'line') {
        (activeSeriesRef.current as ISeriesApi<'Line'>).setData(data);
      } else {
        (activeSeriesRef.current as ISeriesApi<'Area'>).setData(data);
      }
    } else if (chartType === 'candle' && candleSeriesRef.current) {
      const data = candles.map(c => ({
        time: c.time as any,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      candleSeriesRef.current.setData(data);
    }
  }, [candles, chartType]);

  return (
    <div className="w-full bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-white">{pairName}</span>
            {price !== undefined && (
              <span className="text-lg font-bold font-mono text-white">
                ${price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            )}
            {change24h !== undefined && (
              <span className={`flex items-center gap-1 text-sm font-mono font-medium ${change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {change24h >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
              </span>
            )}
          </div>

          <div className="h-5 w-px bg-zinc-700" />

          <div className="flex items-center gap-2">
            <Dropdown
              value={chartType.charAt(0).toUpperCase() + chartType.slice(1)}
              options={[
                { value: 'area', label: 'Area' },
                { value: 'line', label: 'Line' },
                { value: 'candle', label: 'Candle' },
              ]}
              onChange={(v) => setChartType(v as ChartType)}
            />
            <button
              onClick={() => setShowTimeframeModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800/50 hover:bg-zinc-700 rounded text-xs font-mono text-zinc-300 transition-colors border border-zinc-700"
            >
              {formatTimeframe(timeframe)}
              <ChevronDown size={12} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-zinc-400">Live</span>
        </div>
      </div>
      <div ref={chartContainerRef} className="w-full h-[400px] relative cursor-crosshair" />

      <TimeframeModal
        isOpen={showTimeframeModal}
        onClose={() => setShowTimeframeModal(false)}
        currentTimeframe={timeframe}
        onSelect={onTimeframeChange}
      />
    </div>
  );
};
import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, AreaSeries, LineSeries, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, IPriceLine } from 'lightweight-charts';
import type { Candle } from '../hooks/useMarketData';
import type { Position } from '../hooks/useSimulator';

type ChartType = 'area' | 'line' | 'candle';

interface ChartProps {
  candles: Candle[];
  positions: Position[];
  onUpdatePosition: (id: string, tp: number | null, sl: number | null) => void;
  chartType: ChartType;
}


export const Chart: React.FC<ChartProps> = ({ candles, positions, onUpdatePosition, chartType }) => {
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
      height: chartContainerRef.current.clientHeight || 500,
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
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
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
    if (!activeSeriesRef.current || candles.length === 0) return;

    if (chartType === 'area') {
      const data = candles.map(c => ({ time: c.time as any, value: c.close }));
      (activeSeriesRef.current as ISeriesApi<'Area'>).setData(data);
    } else if (chartType === 'line') {
      const data = candles.map(c => ({ time: c.time as any, value: c.close }));
      (activeSeriesRef.current as ISeriesApi<'Line'>).setData(data);
    }
  }, [candles, chartType]);

  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;
    const data = candles.map(c => ({
      time: c.time as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleSeriesRef.current.setData(data);
  }, [candles, chartType]);

  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;
    const last = candles[candles.length - 1];
    if (!last) return;
    candleSeriesRef.current.update({
      time: last.time as any,
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
    });
  }, [candles[candles.length - 1]?.time ?? null]);

  return (
    <div className="w-full h-full relative cursor-crosshair">
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
};
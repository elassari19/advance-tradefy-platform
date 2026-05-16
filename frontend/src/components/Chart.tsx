import React, { useEffect, useRef, useMemo } from 'react';
import { createChart, ColorType, AreaSeries, LineSeries, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, IPriceLine } from 'lightweight-charts';
import type { Candle } from '../hooks/useMarketData';
import type { Position } from '../hooks/useSimulator';
import type { IndicatorConfig, IndicatorLine } from '../utils/indicators';
import { resolveIndicatorLines } from '../utils/indicators';

type ChartType = 'area' | 'line' | 'candle';

interface ChartProps {
  candles: Candle[];
  positions: Position[];
  onUpdatePosition: (id: string, tp: number | null, sl: number | null) => void;
  chartType: ChartType;
  indicatorConfigs: IndicatorConfig[];
}

const SUB_CHART_HEIGHT = 130;

export const Chart: React.FC<ChartProps> = ({ candles, positions, onUpdatePosition, chartType, indicatorConfigs }) => {
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const subContainerRef = useRef<HTMLDivElement>(null);
  const mainChartRef = useRef<IChartApi | null>(null);
  const subChartRef = useRef<IChartApi | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  const draggingRef = useRef<{ id: string; type: 'tp' | 'sl'; price: number } | null>(null);
  const positionsRef = useRef<Position[]>(positions);
  const activeSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const indicatorSeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
  const subIndicatorSeriesRef = useRef<Map<string, ISeriesApi<'Line' | 'Histogram'>>>(new Map());
  const prevMainLineIdsRef = useRef<string[]>([]);
  const prevSubLineIdsRef = useRef<string[]>([]);
  const isSyncingRef = useRef(false);

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  // Separate overlay vs sub-chart indicators
  const { overlayConfigs, subConfigs } = useMemo(() => {
    const overlay: IndicatorConfig[] = [];
    const sub: IndicatorConfig[] = [];
    for (const c of indicatorConfigs) {
      if (c.type === 'rsi' || c.type === 'macd') {
        sub.push(c);
      } else {
        overlay.push(c);
      }
    }
    return { overlayConfigs: overlay, subConfigs: sub };
  }, [indicatorConfigs]);

  const showSubChart = subConfigs.length > 0;

  // ─── Main Chart ──────────────────────────────────────
  useEffect(() => {
    if (!mainContainerRef.current) return;
    const chart = createChart(mainContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#09090b' },
        textColor: '#a1a1aa',
      },
      grid: {
        vertLines: { color: '#27272a' },
        horzLines: { color: '#27272a' },
      },
      width: mainContainerRef.current.clientWidth,
      height: mainContainerRef.current.clientHeight || 400,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
      crosshair: { mode: 0 },
      rightPriceScale: {
        borderColor: '#27272a',
      },
    });

    mainChartRef.current = chart;

    const handleResize = () => {
      if (mainContainerRef.current) {
        chart.applyOptions({
          width: mainContainerRef.current.clientWidth,
          height: mainContainerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    const container = mainContainerRef.current;
    const onMouseDown = (e: MouseEvent) => {
      if (!activeSeriesRef.current || !mainChartRef.current) return;
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
      mainChartRef.current = null;
    };
  }, [onUpdatePosition]);

  // ─── Sub Chart ───────────────────────────────────────
  useEffect(() => {
    if (!subContainerRef.current) return;
    if (!showSubChart) {
      if (subChartRef.current) {
        subChartRef.current.remove();
        subChartRef.current = null;
      }
      return;
    }

    const chart = createChart(subContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#09090b' },
        textColor: '#a1a1aa',
      },
      grid: {
        vertLines: { color: '#27272a' },
        horzLines: { color: '#27272a' },
      },
      width: subContainerRef.current.clientWidth,
      height: SUB_CHART_HEIGHT,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: false,
      handleScale: false,
      crosshair: { mode: 0 },
      rightPriceScale: {
        borderColor: '#27272a',
      },
    });

    subChartRef.current = chart;

    const handleResize = () => {
      if (subContainerRef.current && chart) {
        chart.applyOptions({
          width: subContainerRef.current.clientWidth,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      subChartRef.current = null;
    };
  }, [showSubChart]);

  // ─── Time scale sync ─────────────────────────────────
  useEffect(() => {
    const main = mainChartRef.current;
    const sub = subChartRef.current;
    if (!main || !sub) return;

    const syncMainToSub = () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      const range = main.timeScale().getVisibleLogicalRange();
      if (range) sub.timeScale().setVisibleLogicalRange(range);
      isSyncingRef.current = false;
    };

    const syncSubToMain = () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      const range = sub.timeScale().getVisibleLogicalRange();
      if (range) main.timeScale().setVisibleLogicalRange(range);
      isSyncingRef.current = false;
    };

    main.timeScale().subscribeVisibleLogicalRangeChange(syncMainToSub);
    sub.timeScale().subscribeVisibleLogicalRangeChange(syncSubToMain);

    return () => {
      main.timeScale().unsubscribeVisibleLogicalRangeChange(syncMainToSub);
      if (subChartRef.current) {
        sub.timeScale().unsubscribeVisibleLogicalRangeChange(syncSubToMain);
      }
    };
  }, [showSubChart]);

  // ─── Main chart type series ──────────────────────────
  useEffect(() => {
    if (!mainChartRef.current) return;
    areaSeriesRef.current = null;
    lineSeriesRef.current = null;
    candleSeriesRef.current = null;
    const chart = mainChartRef.current;

    if (chartType === 'area') {
      areaSeriesRef.current = chart.addSeries(AreaSeries, {
        lineColor: '#3b82f6', topColor: 'rgba(59, 130, 246, 0.4)', bottomColor: 'rgba(59, 130, 246, 0.0)', lineWidth: 2,
      });
      activeSeriesRef.current = areaSeriesRef.current;
    } else if (chartType === 'line') {
      lineSeriesRef.current = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 2 });
      activeSeriesRef.current = lineSeriesRef.current;
    } else if (chartType === 'candle') {
      candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e', downColor: '#ef4444', borderUpColor: '#22c55e', borderDownColor: '#ef4444', wickUpColor: '#22c55e', wickDownColor: '#ef4444',
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
      time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    candleSeriesRef.current.setData(data);
  }, [candles, chartType]);

  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;
    const last = candles[candles.length - 1];
    if (!last) return;
    candleSeriesRef.current.update({
      time: last.time as any, open: last.open, high: last.high, low: last.low, close: last.close,
    });
  }, [candles[candles.length - 1]?.time ?? null]);

  // ─── Overlay indicator series (main chart) ────────────
  useEffect(() => {
    const chart = mainChartRef.current;
    if (!chart) return;

    const allLines: IndicatorLine[] = [];
    for (const config of overlayConfigs) {
      const lines = resolveIndicatorLines(candles, config);
      allLines.push(...lines);
    }

    const currentIds = allLines.map(l => l.id);
    const prevIds = prevMainLineIdsRef.current;

    for (const prevId of prevIds) {
      if (!currentIds.includes(prevId)) {
        const s = indicatorSeriesRef.current.get(prevId);
        if (s) { chart.removeSeries(s); indicatorSeriesRef.current.delete(prevId); }
      }
    }

    for (const line of allLines) {
      let s = indicatorSeriesRef.current.get(line.id);
      if (!s) {
        s = chart.addSeries(LineSeries, {
          color: line.color, lineWidth: 1.5, lastValueVisible: false, priceLineVisible: false,
        });
        indicatorSeriesRef.current.set(line.id, s);
      }
      if (line.values.length > 0) {
        s.setData(line.values.filter(v => Number.isFinite(v.value)).map(v => ({ time: v.time as any, value: v.value })));
      }
    }

    prevMainLineIdsRef.current = currentIds;
  }, [overlayConfigs, candles]);

  // ─── Sub-chart indicator series ──────────────────────
  useEffect(() => {
    const chart = subChartRef.current;
    if (!chart) return;

    const allLines: IndicatorLine[] = [];
    for (const config of subConfigs) {
      const lines = resolveIndicatorLines(candles, config);
      allLines.push(...lines);
    }

    const currentIds = allLines.map(l => l.id);
    const prevIds = prevSubLineIdsRef.current;

    for (const prevId of prevIds) {
      if (!currentIds.includes(prevId)) {
        const s = subIndicatorSeriesRef.current.get(prevId);
        if (s) { chart.removeSeries(s); subIndicatorSeriesRef.current.delete(prevId); }
      }
    }

    for (const line of allLines) {
      let s = subIndicatorSeriesRef.current.get(line.id);
      if (!s) {
        const isHistogram = line.id.includes('histogram');
        if (isHistogram) {
          s = chart.addSeries(HistogramSeries, {
            color: line.color, priceFormat: { type: 'volume' },
            priceLineVisible: false, lastValueVisible: false,
          }) as ISeriesApi<'Line'>;
        } else {
          s = chart.addSeries(LineSeries, {
            color: line.color, lineWidth: 1.5, lastValueVisible: false, priceLineVisible: false,
          }) as ISeriesApi<'Line'>;
        }
        subIndicatorSeriesRef.current.set(line.id, s);
      }
      if (line.values.length > 0) {
        s.setData(line.values.filter(v => Number.isFinite(v.value)).map(v => ({ time: v.time as any, value: v.value })));
      }
    }

    prevSubLineIdsRef.current = currentIds;
  }, [subConfigs, candles]);

  return (
    <div className="w-full h-full relative cursor-crosshair flex flex-col">
      <div ref={mainContainerRef} className="flex-1 min-h-0" />
      {showSubChart && (
        <>
          <div className="h-px bg-zinc-800 shrink-0" />
          <div ref={subContainerRef} style={{ height: SUB_CHART_HEIGHT }} className="shrink-0" />
        </>
      )}
    </div>
  );
};

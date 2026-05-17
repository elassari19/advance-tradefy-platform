import React, { useEffect, useRef, useMemo } from 'react';
import { createChart, ColorType, AreaSeries, LineSeries, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, IPriceLine } from 'lightweight-charts';
import type { Candle } from '../hooks/useMarketData';
import type { Position } from '../hooks/useSimulator';
import type { IndicatorConfig } from '../utils/indicators';
import { batchEvaluateIndicators } from '../utils/indicators';

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
  const mainChartRef = useRef<IChartApi | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  const draggingRef = useRef<{ id: string; type: 'tp' | 'sl'; price: number } | null>(null);
  const positionsRef = useRef<Position[]>(positions);
  const activeSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const indicatorSeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
  const prevMainLineIdsRef = useRef<string[]>([]);
  const isSyncingRef = useRef(false);

  const subContainerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const subChartRefs = useRef<Map<string, IChartApi>>(new Map());
  const subIndicatorSeriesRef = useRef<Map<string, ISeriesApi<'Line' | 'Histogram'>>>(new Map());
  const subSeriesOwnerRef = useRef<Map<string, string>>(new Map());
  const prevSubLineIdsRef = useRef<string[]>([]);

  const subChartKeys = useMemo(() => {
    return indicatorConfigs
      .filter(c => c.type === 'rsi' || c.type === 'macd')
      .map(c => c.id);
  }, [indicatorConfigs]);

  const showSubChart = subChartKeys.length > 0;

  const setSubContainerRef = (key: string) => (el: HTMLDivElement | null) => {
    if (el) {
      subContainerRefs.current.set(key, el);
    } else {
      subContainerRefs.current.delete(key);
    }
  };

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

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

  // ─── Sub Charts ───────────────────────────────────────
  useEffect(() => {
    for (const [, chart] of subChartRefs.current) { chart.remove(); }
    subChartRefs.current.clear();
    subIndicatorSeriesRef.current.clear();
    subSeriesOwnerRef.current.clear();
    prevSubLineIdsRef.current = [];

    if (!showSubChart) return;

    for (const key of subChartKeys) {
      const el = subContainerRefs.current.get(key);
      if (!el) continue;

      const chart = createChart(el, {
        layout: {
          background: { type: ColorType.Solid, color: '#09090b' },
          textColor: '#a1a1aa',
        },
        grid: {
          vertLines: { color: '#27272a' },
          horzLines: { color: '#27272a' },
        },
        width: el.clientWidth,
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

      subChartRefs.current.set(key, chart);
    }

    const handleResize = () => {
      for (const [key, chart] of subChartRefs.current) {
        const el = subContainerRefs.current.get(key);
        if (el) chart.applyOptions({ width: el.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      for (const [, chart] of subChartRefs.current) { chart.remove(); }
      subChartRefs.current.clear();
      subIndicatorSeriesRef.current.clear();
      subSeriesOwnerRef.current.clear();
    };
  }, [showSubChart, subChartKeys]);

  // ─── Time scale sync ─────────────────────────────────
  useEffect(() => {
    const main = mainChartRef.current;
    if (!main || subChartRefs.current.size === 0) return;

    const subCharts = Array.from(subChartRefs.current.values());

    const mainHandler = () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      const range = main.timeScale().getVisibleLogicalRange();
      if (range) {
        for (const sc of subCharts) sc.timeScale().setVisibleLogicalRange(range);
      }
      isSyncingRef.current = false;
    };

    const subHandlers = subCharts.map(sc => {
      const handler = () => {
        if (isSyncingRef.current) return;
        isSyncingRef.current = true;
        const range = sc.timeScale().getVisibleLogicalRange();
        if (range) {
          main.timeScale().setVisibleLogicalRange(range);
          for (const other of subCharts) {
            if (other !== sc) other.timeScale().setVisibleLogicalRange(range);
          }
        }
        isSyncingRef.current = false;
      };
      return { chart: sc, handler };
    });

    main.timeScale().subscribeVisibleLogicalRangeChange(mainHandler);
    for (const { chart, handler } of subHandlers) {
      chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    }

    return () => {
      main.timeScale().unsubscribeVisibleLogicalRangeChange(mainHandler);
      for (const { chart, handler } of subHandlers) {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
      }
    };
  }, [showSubChart, subChartKeys]);

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

  // ─── All indicator series (batch evaluation) ──────────
  useEffect(() => {
    const mainChart = mainChartRef.current;
    if (!mainChart) return;

    let cancelled = false;

    (async () => {
      const allEntries = await batchEvaluateIndicators(candles, indicatorConfigs);
      if (cancelled) return;

      // ── Overlay (main chart) ──
      const overlayEntries = allEntries.filter(e => e.pane === 'overlay');
      const overlayIds = overlayEntries.map(e => e.line.id);

      for (const prevId of prevMainLineIdsRef.current) {
        if (!overlayIds.includes(prevId)) {
          const s = indicatorSeriesRef.current.get(prevId);
          if (s) { mainChart.removeSeries(s); indicatorSeriesRef.current.delete(prevId); }
        }
      }

      for (const entry of overlayEntries) {
        let s = indicatorSeriesRef.current.get(entry.line.id);
        if (!s) {
          s = mainChart.addSeries(LineSeries, {
            color: entry.line.color, lineWidth: 1, lastValueVisible: false, priceLineVisible: false,
          });
          indicatorSeriesRef.current.set(entry.line.id, s);
        }
        if (entry.line.values.length > 0) {
            s.setData(entry.line.values.filter(v => Number.isFinite(v.value)).map(v => ({ time: v.time as any, value: v.value })));
        }
      }
      prevMainLineIdsRef.current = overlayIds;

      // ── Sub charts ──
      const subEntries = allEntries.filter(e => e.pane === 'sub');
      const subIds = subEntries.map(e => e.line.id);
      const configIdByIndex = new Map(indicatorConfigs.map((c, i) => [i, c.id]));

      for (const prevId of prevSubLineIdsRef.current) {
        if (!subIds.includes(prevId)) {
          const s = subIndicatorSeriesRef.current.get(prevId);
          const ownerId = subSeriesOwnerRef.current.get(prevId);
          if (s && ownerId) {
            const subChart = subChartRefs.current.get(ownerId);
            if (subChart) subChart.removeSeries(s);
          }
          subIndicatorSeriesRef.current.delete(prevId);
          subSeriesOwnerRef.current.delete(prevId);
        }
      }

      const subByConfig = new Map<number, typeof subEntries>();
      for (const entry of subEntries) {
        const list = subByConfig.get(entry.configIndex) || [];
        list.push(entry);
        subByConfig.set(entry.configIndex, list);
      }

      for (const [configIdx, entries] of subByConfig) {
        const configId = configIdByIndex.get(configIdx);
        if (!configId) continue;
        const subChart = subChartRefs.current.get(configId);
        if (!subChart) continue;

        for (const entry of entries) {
          let s = subIndicatorSeriesRef.current.get(entry.line.id);
          if (!s) {
            const isHistogram = entry.line.id.includes('histogram');
            if (isHistogram) {
              s = subChart.addSeries(HistogramSeries, {
                color: entry.line.color, priceFormat: { type: 'volume' },
                priceLineVisible: false, lastValueVisible: false,
              }) as unknown as ISeriesApi<'Line'>;
            } else {
              s = subChart.addSeries(LineSeries, {
                color: entry.line.color, lineWidth: 1, lastValueVisible: false, priceLineVisible: false,
              }) as unknown as ISeriesApi<'Line'>;
            }
            subIndicatorSeriesRef.current.set(entry.line.id, s);
            subSeriesOwnerRef.current.set(entry.line.id, configId);
          }
          if (entry.line.values.length > 0) {
          s.setData(entry.line.values.filter(v => Number.isFinite(v.value)).map(v => ({ time: v.time as any, value: v.value })));
          }
        }
      }

      prevSubLineIdsRef.current = subIds;
    })();

    return () => { cancelled = true; };
  }, [indicatorConfigs, candles]);

  return (
    <div className="w-full h-full relative cursor-crosshair flex flex-col">
      <div ref={mainContainerRef} className="flex-1 min-h-0" />
      {subChartKeys.map((key, idx) => (
        <React.Fragment key={key}>
          <div className={idx === 0 ? 'h-px bg-zinc-800 shrink-0' : ''} />
          <div style={{ height: SUB_CHART_HEIGHT }} className="bg-zinc-900/50 shrink-0">
            <div className="text-[10px] font-medium text-zinc-500 px-2 leading-4">
              {(() => {
                const c = indicatorConfigs.find(cfg => cfg.id === key);
                if (c?.name) return c.name;
                if (c?.type === 'rsi') return `RSI(${c.period})`;
                if (c?.type === 'macd') return `MACD(${c.fastPeriod},${c.slowPeriod})`;
                return c?.type?.toUpperCase() || key;
              })()}
            </div>
            <div ref={setSubContainerRef(key)} className="w-full" style={{ height: SUB_CHART_HEIGHT - 16 }} />
          </div>
          <div className="h-px bg-zinc-800 shrink-0" />
        </React.Fragment>
      ))}
    </div>
  );
};

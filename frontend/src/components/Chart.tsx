import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { createChart, ColorType, AreaSeries, LineSeries, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, IPriceLine, ISeriesPrimitive, Time } from 'lightweight-charts';
import type { Candle } from '../hooks/useMarketData';
import type { Position } from '../hooks/useSimulator';
import type { IndicatorConfig } from '../utils/indicators';
import { batchEvaluateIndicators } from '../utils/indicators';
import type { BacktestTrade } from '../hooks/useBacktest';
import type { DrawingTool } from './DrawingToolbar';

type ChartType = 'area' | 'line' | 'candle';

interface DrawingPoint {
  time: number;
  price: number;
}

export interface Drawing {
  id: string;
  type: 'trend-line' | 'horizontal-line' | 'rectangle';
  points: DrawingPoint[];
  color: string;
}

interface BacktestTradeMarker {
  time: number;
  type: 'buy' | 'sell' | 'tp' | 'sl';
  price: number;
  label: string;
}

interface ChartProps {
  candles: Candle[];
  positions: Position[];
  onUpdatePosition: (id: string, tp: number | null, sl: number | null) => void;
  chartType: ChartType;
  indicatorConfigs: IndicatorConfig[];
  backtestTrades?: BacktestTrade[];
  showBacktestOverlay?: boolean;
  backtestCursorTime?: number;
  drawingTool?: DrawingTool;
  drawings?: Drawing[];
  onDrawingsChange?: (drawings: Drawing[]) => void;
}

const SUB_CHART_HEIGHT = 130;

const DrawingsLayer: React.FC<{
  drawings: Drawing[];
  pendingPoints: DrawingPoint[];
  activeTool: DrawingTool;
  mainChartRef: React.RefObject<IChartApi | null>;
  activeSeriesRef: React.RefObject<ISeriesApi<any> | null>;
}> = ({ drawings, pendingPoints, activeTool, mainChartRef, activeSeriesRef }) => {
  const [, forceRender] = useState(0);
  const chart = mainChartRef.current;
  const series = activeSeriesRef.current;

  useEffect(() => {
    if (!chart) return;
    const handler = () => forceRender(n => n + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
  }, [chart]);

  if (!chart || !series) return null;

  const elements: React.ReactNode[] = [];
  const w = 1.5;
  const op = 1;

  for (const d of drawings) {
    if (d.type === 'horizontal-line') {
      const y = series.priceToCoordinate(d.points[0].price);
      if (y === null) continue;
      elements.push(
        <div key={d.id} className="absolute left-0 right-0" style={{ top: y, height: w, background: d.color, opacity: op }} />
      );
    } else if (d.type === 'trend-line' && d.points.length >= 2) {
      const x1 = chart.timeScale().timeToCoordinate(d.points[0].time as Time);
      const y1 = series.priceToCoordinate(d.points[0].price);
      const x2 = chart.timeScale().timeToCoordinate(d.points[1].time as Time);
      const y2 = series.priceToCoordinate(d.points[1].price);
      if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      elements.push(
        <div key={d.id} className="absolute" style={{ left: x1, top: y1, width: len, height: w, background: d.color, opacity: op, transformOrigin: '0 0', transform: `rotate(${angle}deg)` }} />
      );
    } else if (d.type === 'rectangle' && d.points.length >= 2) {
      const x1 = chart.timeScale().timeToCoordinate(d.points[0].time as Time);
      const y1 = series.priceToCoordinate(d.points[0].price);
      const x2 = chart.timeScale().timeToCoordinate(d.points[1].time as Time);
      const y2 = series.priceToCoordinate(d.points[1].price);
      if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
      elements.push(
        <div key={d.id} className="absolute" style={{ left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1), border: `${w}px dashed ${d.color}`, opacity: op }} />
      );
    }
  }

  // Preview
  if (pendingPoints.length >= 2 && (activeTool === 'trend-line' || activeTool === 'rectangle')) {
    const x1 = chart.timeScale().timeToCoordinate(pendingPoints[0].time as Time);
    const y1 = series.priceToCoordinate(pendingPoints[0].price);
    const x2 = chart.timeScale().timeToCoordinate(pendingPoints[1].time as Time);
    const y2 = series.priceToCoordinate(pendingPoints[1].price);
    if (!(x1 === null || y1 === null || x2 === null || y2 === null)) {
      if (activeTool === 'trend-line') {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        elements.push(
          <div key="preview" className="absolute" style={{ left: x1, top: y1, width: len, height: 1, background: '#3b82f6', opacity: 0.6, transformOrigin: '0 0', transform: `rotate(${angle}deg)` }} />
        );
      } else {
        elements.push(
          <div key="preview" className="absolute" style={{ left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1), border: '1px dashed #8b5cf6', opacity: 0.6 }} />
        );
      }
    }
  }

  return <>{elements}</>;
};

export const Chart: React.FC<ChartProps> = ({ candles, positions, onUpdatePosition, chartType, indicatorConfigs, backtestTrades, showBacktestOverlay, backtestCursorTime, drawingTool = 'pointer', drawings: externalDrawings, onDrawingsChange }) => {
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
  const tradeMarkerPriceLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  const cursorRef = useRef<HTMLDivElement>(null);
  const chartWrapperRef = useRef<HTMLDivElement>(null);

  const [internalDrawings, setInternalDrawings] = useState<Drawing[]>([]);
  const [pendingPoints, setPendingPoints] = useState<DrawingPoint[]>([]);
  const [overlayTick, setOverlayTick] = useState(0);
  const pendingRef = useRef<DrawingPoint[]>([]);

  const drawings = externalDrawings ?? internalDrawings;
  const setDrawings = onDrawingsChange ? (d: Drawing[]) => { setInternalDrawings(d); onDrawingsChange(d); } : setInternalDrawings;

  const drawingToolRef = useRef(drawingTool);
  drawingToolRef.current = drawingTool;
  const drawingsRef = useRef(drawings);
  drawingsRef.current = drawings;
  const setDrawingsFnRef = useRef(setDrawings);
  setDrawingsFnRef.current = setDrawings;

  useEffect(() => {
    if (drawingTool === 'pointer') {
      pendingRef.current = [];
      setPendingPoints([]);
    }
  }, [drawingTool]);

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

    const container = mainContainerRef.current;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        chart.applyOptions({
          width: entry.contentBoxSize?.[0]?.inlineSize ?? container?.clientWidth ?? 0,
          height: entry.contentBoxSize?.[0]?.blockSize ?? container?.clientHeight ?? 0,
        });
      }
    });
    resizeObserver.observe(container);

    const toTimePrice = (clientX: number, clientY: number): { time: number; price: number } | null => {
      if (!activeSeriesRef.current || !mainChartRef.current) return null;
      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const time = mainChartRef.current.timeScale().coordinateToTime(x);
      const price = activeSeriesRef.current.coordinateToPrice(y);
      if (time === null || price === null) return null;
      return { time: time as number, price };
    };

    const handleDrawingClick = (e: MouseEvent) => {
      const tp = toTimePrice(e.clientX, e.clientY);
      if (!tp) return;
      const tool = drawingToolRef.current;
      const currentDrawings = drawingsRef.current;
      const saveDrawings = setDrawingsFnRef.current;
      if (tool === 'horizontal-line') {
        const newDrawing: Drawing = {
          id: `drawing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'horizontal-line',
          points: [{ time: tp.time, price: tp.price }],
          color: '#3b82f6',
        };
        saveDrawings([...currentDrawings, newDrawing]);
      } else if (tool === 'trend-line' || tool === 'rectangle') {
        const pending = pendingRef.current;
        if (pending.length === 0) {
          pendingRef.current = [tp];
          setPendingPoints([tp]);
        } else {
          const complete: Drawing = {
            id: `drawing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: tool,
            points: [pending[0], tp],
            color: tool === 'trend-line' ? '#3b82f6' : '#8b5cf6',
          };
          pendingRef.current = [];
          setPendingPoints([]);
          saveDrawings([...currentDrawings, complete]);
        }
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (drawingToolRef.current !== 'pointer') {
        handleDrawingClick(e);
        return;
      }
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
      if (drawingToolRef.current !== 'pointer' && pendingRef.current.length === 1) {
        const tp = toTimePrice(e.clientX, e.clientY);
        if (tp) {
          setPendingPoints([pendingRef.current[0], tp]);
        }
        return;
      }
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

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pendingRef.current.length > 0) {
        pendingRef.current = [];
        setPendingPoints([]);
      }
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
      chart.remove();
      mainChartRef.current = null;
    };
  }, [onUpdatePosition]);

  // ─── Overlay re-render on chart scroll/zoom ──────────
  useEffect(() => {
    const chart = mainChartRef.current;
    if (!chart) return;
    const handler = () => setOverlayTick(t => t + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(handler);
    return () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler);
  }, []);

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

      const subObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          chart.applyOptions({
            width: entry.contentBoxSize?.[0]?.inlineSize ?? el?.clientWidth ?? 0,
          });
        }
      });
      subObserver.observe(el);
      // Store observer for cleanup
      (chart as any).__resizeObserver = subObserver;
    }

    return () => {
      for (const [, chart] of subChartRefs.current) {
        (chart as any).__resizeObserver?.disconnect();
        chart.remove();
      }
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

  // ─── Backtest Trade Markers ──────────────────────
  useEffect(() => {
    const series = activeSeriesRef.current;
    if (!series || !showBacktestOverlay || !backtestTrades?.length) {
      for (const [, line] of tradeMarkerPriceLinesRef.current) { try { series?.removePriceLine(line); } catch {} }
      tradeMarkerPriceLinesRef.current.clear();
      return;
    }

    for (const [, line] of tradeMarkerPriceLinesRef.current) { try { series?.removePriceLine(line); } catch {} }
    tradeMarkerPriceLinesRef.current.clear();

    for (const trade of backtestTrades) {
      const buyKey = `bt-buy-${trade.id}`;
      const sellKey = `bt-sell-${trade.id}`;
      const tpKey = `bt-tp-${trade.id}`;
      const slKey = `bt-sl-${trade.id}`;
      const tpTargetKey = `bt-tp-target-${trade.id}`;
      const slTargetKey = `bt-sl-target-${trade.id}`;

      if (trade.side === 'Buy') {
        try {
          const line = series.createPriceLine({
            price: trade.entry_price,
            color: '#22c55e',
            lineStyle: 3,
            lineWidth: 1,
            axisLabelVisible: true,
            title: `B ${trade.quantity}`,
          });
          tradeMarkerPriceLinesRef.current.set(buyKey, line);
        } catch {}
      } else {
        try {
          const line = series.createPriceLine({
            price: trade.entry_price,
            color: '#ef4444',
            lineStyle: 3,
            lineWidth: 1,
            axisLabelVisible: true,
            title: `S ${trade.quantity}`,
          });
          tradeMarkerPriceLinesRef.current.set(sellKey, line);
        } catch {}
      }

      if (trade.exit_reason === 'Take Profit') {
        try {
          const line = series.createPriceLine({
            price: trade.exit_price,
            color: '#22c55e',
            lineStyle: 1,
            lineWidth: 1,
            axisLabelVisible: true,
            title: 'TP',
          });
          tradeMarkerPriceLinesRef.current.set(tpKey, line);
        } catch {}
      } else if (trade.exit_reason === 'Stop Loss') {
        try {
          const line = series.createPriceLine({
            price: trade.exit_price,
            color: '#ef4444',
            lineStyle: 1,
            lineWidth: 1,
            axisLabelVisible: true,
            title: 'SL',
          });
          tradeMarkerPriceLinesRef.current.set(slKey, line);
        } catch {}
      }

      // Draw TP target line (the intended take-profit level)
      if (trade.take_profit != null) {
        try {
          const line = series.createPriceLine({
            price: trade.take_profit,
            color: '#22c55e',
            lineStyle: 4,
            lineWidth: 1,
            axisLabelVisible: true,
            title: 'TP Target',
          });
          tradeMarkerPriceLinesRef.current.set(tpTargetKey, line);
        } catch {}
      }

      // Draw SL target line (the intended stop-loss level)
      if (trade.stop_loss != null) {
        try {
          const line = series.createPriceLine({
            price: trade.stop_loss,
            color: '#ef4444',
            lineStyle: 4,
            lineWidth: 1,
            axisLabelVisible: true,
            title: 'SL Target',
          });
          tradeMarkerPriceLinesRef.current.set(slTargetKey, line);
        } catch {}
      }
    }

    return () => {
      for (const [, line] of tradeMarkerPriceLinesRef.current) { try { series.removePriceLine(line); } catch {} }
      tradeMarkerPriceLinesRef.current.clear();
    };
  }, [backtestTrades, showBacktestOverlay, chartType]);

  // ─── Backtest cursor ───
  useEffect(() => {
    if (!mainChartRef.current) return;
    const chart = mainChartRef.current;
    if (backtestCursorTime != null) {
      const visibleRange = chart.timeScale().getVisibleRange();
      if (visibleRange) {
        const range = visibleRange.to - visibleRange.from;
        chart.timeScale().setVisibleRange({
          from: (backtestCursorTime as number) - range * 0.6,
          to: (backtestCursorTime as number) + range * 0.4,
        });
      }
      const x = chart.timeScale().timeToCoordinate(backtestCursorTime as number);
      if (x != null && cursorRef.current) {
        cursorRef.current.style.left = x + 'px';
      }
    }
  }, [backtestCursorTime]);

  return (
    <div className="w-full h-full relative cursor-crosshair flex flex-col">
      <div ref={mainContainerRef} className="relative flex-1 min-h-0" />
      <div className="absolute inset-0 z-20 pointer-events-none" style={{ top: 0, left: 0 }}>
        <DrawingsLayer
          drawings={drawings}
          pendingPoints={pendingPoints}
          activeTool={drawingTool}
          mainChartRef={mainChartRef}
          activeSeriesRef={activeSeriesRef}
        />
        {backtestCursorTime != null && (
          <div ref={cursorRef} className="absolute top-0 bottom-0 w-[2px] bg-blue-500/60 pointer-events-none z-10" style={{ left: 0 }} />
        )}
      </div>
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

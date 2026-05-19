import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { BacktestTrade } from '../../hooks/useBacktest';

interface VisualBacktestChartProps {
  allCandles: any[];
  currentBarIndex: number;
  trades: BacktestTrade[];
  cursorTime?: number;
  symbol: string;
  loading?: boolean;
}

interface TooltipData {
  time: string;
  open: string;
  high: string;
  low: string;
  close: string;
  x: number;
  y: number;
}

export const VisualBacktestChart: React.FC<VisualBacktestChartProps> = ({
  allCandles,
  currentBarIndex,
  trades,
  cursorTime,
  symbol,
  loading,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineSeriesRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
  const priceLinesRef = useRef<Map<string, ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']>>>(new Map());
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const visibleCandles = useMemo(() => {
    return allCandles.slice(0, Math.max(1, currentBarIndex));
  }, [allCandles, currentBarIndex]);

  const handleCrosshairMove = useCallback((param: any) => {
    if (!param.time || !param.seriesData || !candleSeriesRef.current) {
      setTooltip(null);
      return;
    }
    const data = param.seriesData.get(candleSeriesRef.current);
    if (!data || !('open' in data)) {
      setTooltip(null);
      return;
    }
    const point = param.point;
    if (!point) {
      setTooltip(null);
      return;
    }
    const d = data as any;
    setTooltip({
      time: new Date((d.time as number) * 1000).toISOString().slice(0, 19).replace('T', ' '),
      open: d.open.toFixed(2),
      high: d.high.toFixed(2),
      low: d.low.toFixed(2),
      close: d.close.toFixed(2),
      x: point.x,
      y: point.y,
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
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
      height: containerRef.current.clientHeight || 400,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: 0 },
      rightPriceScale: {
        borderColor: '#27272a',
      },
    });

    chartRef.current = chart;

    chart.subscribeCrosshairMove(handleCrosshairMove);

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });
    candleSeriesRef.current = series;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [handleCrosshairMove]);

  useEffect(() => {
    if (!candleSeriesRef.current || visibleCandles.length === 0) return;
    const series = candleSeriesRef.current;
    const data = visibleCandles.map(c => ({
      time: c.time as any,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    series.setData(data);

    // Highlight current candle with marker
    if (visibleCandles.length > 0) {
      const last = visibleCandles[visibleCandles.length - 1];
      series.setMarkers([
        {
          time: last.time as any,
          position: 'inBar',
          color: '#3b82f6',
          shape: 'arrowUp',
          text: '',
          size: 0.5,
        },
      ]);
    } else {
      series.setMarkers([]);
    }

    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [visibleCandles]);

  // Trade markers (entry/exit arrows)
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    // Clear previous price lines
    for (const [, line] of priceLinesRef.current) {
      try { series.removePriceLine(line); } catch {}
    }
    priceLinesRef.current.clear();

    // Clear previous line series
    for (const [key, ls] of lineSeriesRef.current) {
      if (chartRef.current) {
        try { chartRef.current.removeSeries(ls); } catch {}
      }
    }
    lineSeriesRef.current.clear();

    if (!trades || trades.length === 0) return;

    for (const trade of trades) {
      const color = trade.side.toLowerCase() === 'buy' ? '#22c55e' : '#ef4444';

      // Entry marker price line
      const entryLine = series.createPriceLine({
        price: trade.entry_price,
        color,
        lineStyle: 3,
        lineWidth: 1,
        axisLabelVisible: true,
        title: `${trade.side === 'Buy' ? '▲' : '▼'} ${trade.side} ${trade.quantity}`,
      });
      priceLinesRef.current.set(`entry-${trade.id}`, entryLine);

      // Exit line (if closed)
      if (trade.exit_price) {
        const exitColor = trade.pnl >= 0 ? '#22c55e' : '#ef4444';
        const exitLine = series.createPriceLine({
          price: trade.exit_price,
          color: exitColor,
          lineStyle: 2,
          lineWidth: 1,
          axisLabelVisible: true,
          title: `Exit $${trade.exit_price.toFixed(2)}`,
        });
        priceLinesRef.current.set(`exit-${trade.id}`, exitLine);

        // Entry→Exit connecting line
        if (trade.opened_at && trade.closed_at && chartRef.current) {
          const lineId = `conn-${trade.id}`;
          const ls = chartRef.current.addSeries(LineSeries, {
            color,
            lineWidth: 1,
            lineStyle: 2,
            lastValueVisible: false,
            priceLineVisible: false,
          });
          ls.setData([
            { time: trade.opened_at as any, value: trade.entry_price },
            { time: trade.closed_at as any, value: trade.exit_price },
          ]);
          lineSeriesRef.current.set(lineId, ls);
        }
      }

      // TP line
      if (trade.take_profit != null) {
        const tpLine = series.createPriceLine({
          price: trade.take_profit,
          color: '#22c55e',
          lineStyle: 4,
          lineWidth: 1,
          axisLabelVisible: true,
          title: 'TP',
        });
        priceLinesRef.current.set(`tp-${trade.id}`, tpLine);
      }

      // SL line
      if (trade.stop_loss != null) {
        const slLine = series.createPriceLine({
          price: trade.stop_loss,
          color: '#ef4444',
          lineStyle: 4,
          lineWidth: 1,
          axisLabelVisible: true,
          title: 'SL',
        });
        priceLinesRef.current.set(`sl-${trade.id}`, slLine);
      }
    }
  }, [trades]);

  useEffect(() => {
    if (!chartRef.current || cursorTime == null) return;
    const chart = chartRef.current;
    const visibleRange = chart.timeScale().getVisibleRange();
    if (visibleRange) {
      const range = visibleRange.to - visibleRange.from;
      chart.timeScale().setVisibleRange({
        from: (cursorTime as number) - range * 0.6,
        to: (cursorTime as number) + range * 0.4,
      });
    }
  }, [cursorTime]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#09090b] rounded-lg border border-zinc-800 min-h-[300px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-zinc-500">Loading {symbol} data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#09090b] rounded-lg border border-zinc-800 overflow-hidden flex-1 min-h-0 relative">
      <div ref={containerRef} className="w-full h-full" />
      {cursorTime != null && (
        <div className="absolute top-0 bottom-0 w-[2px] bg-blue-500/60 pointer-events-none z-10" style={{ left: '50%' }} />
      )}
      <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm rounded px-2 py-1 text-[10px] text-zinc-400 font-mono z-20">
        {symbol} · {visibleCandles.length}/{allCandles.length} bars
        {trades.length > 0 && <> · {trades.length} trades</>}
      </div>

      {/* Crosshair tooltip */}
      {tooltip && (
        <div
          className="absolute bg-zinc-900/90 border border-zinc-700 rounded-lg px-3 py-2 text-[11px] font-mono z-30 pointer-events-none shadow-xl"
          style={{
            left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth || 400) - 180),
            top: Math.max(tooltip.y - 60, 4),
          }}
        >
          <div className="text-zinc-400 mb-1">{tooltip.time}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <span className="text-zinc-500">O:</span><span className="text-zinc-200 text-right">{tooltip.open}</span>
            <span className="text-zinc-500">H:</span><span className="text-zinc-200 text-right">{tooltip.high}</span>
            <span className="text-zinc-500">L:</span><span className="text-zinc-200 text-right">{tooltip.low}</span>
            <span className="text-zinc-500">C:</span>
            <span className={`text-right font-bold ${Number(tooltip.close) >= Number(tooltip.open) ? 'text-green-400' : 'text-red-400'}`}>
              {tooltip.close}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

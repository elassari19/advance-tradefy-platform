import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, LineSeries, AreaSeries, HistogramSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CrosshairMode } from 'lightweight-charts';
import { Download } from 'lucide-react';
import type { BacktestResult, EquityPoint } from '../../hooks/useBacktest';

interface TesterGraphProps {
  result: BacktestResult;
}

interface GraphTooltip {
  time: string;
  balance: string;
  equity: string;
  drawdown: string;
  x: number;
  chart: number;
}

export const TesterGraph: React.FC<TesterGraphProps> = ({ result }) => {
  const { equity_curve, trades } = result;

  const balanceRef = useRef<HTMLDivElement>(null);
  const drawdownRef = useRef<HTMLDivElement>(null);
  const tradesRef = useRef<HTMLDivElement>(null);
  const chartsRef = useRef<IChartApi[]>([]);
  const isSyncing = useRef(false);
  const [tooltip, setTooltip] = useState<GraphTooltip | null>(null);

  const makeCrosshairHandler = useCallback((sourceIdx: number, balanceSeries: ISeriesApi<any>, ddSeries: ISeriesApi<any>, tradeSeries: ISeriesApi<any>) => {
    return (param: any) => {
      if (!param.time || !param.seriesData) {
        setTooltip(null);
        return;
      }
      const bData = param.seriesData.get(balanceSeries);
      const ddData = param.seriesData.get(ddSeries);
      const tData = param.seriesData.get(tradeSeries);
      const point = param.point;
      if (!point) { setTooltip(null); return; }

      const timeStr = param.time ? new Date((param.time as number) * 1000).toISOString().slice(0, 19).replace('T', ' ') : '';
      setTooltip({
        time: timeStr,
        balance: bData ? (bData as any).value?.toFixed(2) : '-',
        equity: '-',
        drawdown: ddData ? (ddData as any).value?.toFixed(2) : '-',
        x: point.x,
        chart: sourceIdx,
      });
    };
  }, []);

  useEffect(() => {
    const charts: IChartApi[] = [];
    const balanceSeries: ISeriesApi<any>[] = [];
    const ddSeriesArr: ISeriesApi<any>[] = [];
    const tradeSeriesArr: ISeriesApi<any>[] = [];

    if (!balanceRef.current || !drawdownRef.current || !tradesRef.current) return;

    const balanceData = equity_curve.map((p: EquityPoint) => ({
      time: p.time as any, value: p.balance,
    }));
    const equityData = equity_curve.map((p: EquityPoint) => ({
      time: p.time as any, value: p.equity,
    }));
    const ddData = equity_curve.map((p: EquityPoint) => ({
      time: p.time as any, value: p.drawdown_pct,
    }));

    const makeChart = (container: HTMLDivElement, height: number): IChartApi => {
      const chart = createChart(container, {
        height,
        layout: {
          background: { type: ColorType.Solid, color: '#09090b' },
          textColor: '#a1a1aa',
        },
        grid: {
          vertLines: { color: '#27272a' },
          horzLines: { color: '#27272a' },
        },
        timeScale: { timeVisible: true, secondsVisible: false },
        rightPriceScale: { borderColor: '#27272a' },
        crosshair: { mode: 0 as any },
      });
      charts.push(chart);
      return chart;
    };

    // Chart 1: Balance + Equity
    const bc = makeChart(balanceRef.current, 180);
    const bs = bc.addSeries(LineSeries, { color: '#bfff1d', lineWidth: 2 });
    bs.setData(balanceData);
    const es = bc.addSeries(LineSeries, { color: '#22c55e', lineWidth: 2 });
    es.setData(equityData);
    bc.timeScale().fitContent();
    balanceSeries.push(bs, es);

    // Chart 2: Drawdown
    const dc = makeChart(drawdownRef.current, 120);
    const ds = dc.addSeries(AreaSeries, {
      lineColor: '#ef4444',
      topColor: 'rgba(239, 68, 68, 0.3)',
      bottomColor: 'rgba(239, 68, 68, 0.0)',
      lineWidth: 2,
    });
    ds.setData(ddData);
    dc.timeScale().fitContent();
    ddSeriesArr.push(ds);

    // Chart 3: Trades
    const tc = makeChart(tradesRef.current, 100);
    const tradeS = tc.addSeries(HistogramSeries, {
      color: '#a1a1aa',
      priceFormat: { type: 'volume' },
    });
    const tradeHistData = trades.map(t => ({
      time: t.closed_at as any,
      value: Math.abs(t.pnl),
      color: t.pnl >= 0 ? '#22c55e' : '#ef4444',
    }));
    tradeS.setData(tradeHistData as any);
    tc.timeScale().fitContent();
    tradeSeriesArr.push(tradeS);

    chartsRef.current = charts;

    // Crosshair sync
    const allCharts = [bc, dc, tc];
    const syncHandler = (source: IChartApi) => {
      return () => {
        if (isSyncing.current) return;
        isSyncing.current = true;
        const range = source.timeScale().getVisibleLogicalRange();
        if (range) {
          for (const c of allCharts) {
            if (c !== source) c.timeScale().setVisibleLogicalRange(range);
          }
        }
        isSyncing.current = false;
      };
    };

    for (const c of allCharts) {
      c.timeScale().subscribeVisibleLogicalRangeChange(syncHandler(c));
    }

    // Crosshair tooltip handler for each chart
    const makeCrossHandler = (source: IChartApi, seriesList: ISeriesApi<any>[], idx: number) => {
      return (param: any) => {
        if (!param.time || !param.seriesData || !param.point) {
          if (idx === 0) setTooltip(null);
          return;
        }
        const point = param.point;
        const timeStr = new Date((param.time as number) * 1000).toISOString().slice(0, 19).replace('T', ' ');
        const vals: Record<string, string> = {};
        for (const s of seriesList) {
          const d = param.seriesData.get(s);
          if (d) {
            const title = (s as any).options()?.title || '';
            const v = (d as any).value ?? (d as any).close ?? 0;
            vals[title] = Number(v).toFixed(2);
          }
        }
        setTooltip({
          time: timeStr,
          balance: vals[''] || bs.coordinateToPrice(point.y)?.toFixed(2) || '-',
          equity: '-',
          drawdown: ds.coordinateToPrice(point.y)?.toFixed(2) || '-',
          x: point.x,
          chart: idx,
        });
      };
    };

    bc.subscribeCrosshairMove(makeCrossHandler(bc, [bs, es], 0));
    dc.subscribeCrosshairMove(makeCrossHandler(dc, [ds], 1));
    tc.subscribeCrosshairMove(makeCrossHandler(tc, [tradeS], 2));

    const handleResize = () => {
      for (const c of charts) {
        const el = c.chartElement?.parentElement;
        if (el) c.applyOptions({ width: el.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      for (const c of charts) {
        c.timeScale().unsubscribeVisibleLogicalRangeChange(syncHandler(c));
        c.remove();
      }
      chartsRef.current = [];
    };
  }, [equity_curve, trades]);

  const exportPNG = async () => {
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#09090b;padding:20px';
    document.body.appendChild(container);

    const title = document.createElement('div');
    title.style.cssText = 'color:#fafafa;font-size:18px;font-weight:bold;margin-bottom:16px';
    title.textContent = 'Backtest Performance Graph';
    container.appendChild(title);

    const cloneChart = (data: any[], type: 'line' | 'area' | 'histogram', color: string, height: number, extra?: any[]) => {
      const div = document.createElement('div');
      div.style.cssText = `width:760px;height:${height}px`;
      container.appendChild(div);
      const chart = createChart(div, { width: 760, height, layout: { background: { type: ColorType.Solid, color: '#09090b' }, textColor: '#a1a1aa' }, grid: { vertLines: { color: '#27272a' }, horzLines: { color: '#27272a' } }, timeScale: { timeVisible: true }, rightPriceScale: { borderColor: '#27272a' } });
      if (type === 'line') {
        const s = chart.addSeries(LineSeries, { color, lineWidth: 2 });
        s.setData(data);
        if (extra) {
          const s2 = chart.addSeries(LineSeries, { color: extra[0], lineWidth: 2 });
          s2.setData(extra[1]);
        }
      } else if (type === 'area') {
        const s = chart.addSeries(AreaSeries, { lineColor: color, topColor: color.replace(')', ',0.3)').replace('rgb', 'rgba'), bottomColor: color.replace(')', ',0.0)').replace('rgb', 'rgba'), lineWidth: 2 });
        s.setData(data);
      } else {
        const s = chart.addSeries(HistogramSeries, { color: '#a1a1aa', priceFormat: { type: 'volume' } });
        s.setData(data as any);
      }
      chart.timeScale().fitContent();
      return chart;
    };

    const balanceData = equity_curve.map((p: EquityPoint) => ({ time: p.time as any, value: p.balance }));
    const equityData = equity_curve.map((p: EquityPoint) => ({ time: p.time as any, value: p.equity }));
    const ddData = equity_curve.map((p: EquityPoint) => ({ time: p.time as any, value: p.drawdown_pct }));
    const histData = trades.map(t => ({ time: t.closed_at as any, value: Math.abs(t.pnl), color: t.pnl >= 0 ? '#22c55e' : '#ef4444' }));

    cloneChart(balanceData, 'line', '#bfff1d', 180, ['#22c55e', equityData]);
    cloneChart(ddData, 'area', '#ef4444', 120);
    cloneChart(histData, 'histogram', '', 100);

    await new Promise(r => setTimeout(r, 200));

    const canvas = await html2canvasSafe(container);
    const dataUrl = canvas.toDataURL('image/png').replace('data:image/png;base64,', '');

    document.body.removeChild(container);

    if (window.electronAPI) {
      await window.electronAPI.savePngGraph(dataUrl);
    } else {
      const link = document.createElement('a');
      link.download = 'backtest-graph.png';
      link.href = 'data:image/png;base64,' + dataUrl;
      link.click();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-zinc-400">
          Balance & Equity · Drawdown · Trade Profitability
        </span>
        <button
          onClick={exportPNG}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold text-zinc-400 hover:text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-all"
        >
          <Download size={12} />
          Export PNG
        </button>
      </div>

      <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 space-y-1 relative">
        <div className="flex items-center gap-4 text-[10px] text-zinc-500 px-1">
          <span><span className="inline-block w-3 h-0.5 bg-primary align-middle mr-1" /> Balance</span>
          <span><span className="inline-block w-3 h-0.5 bg-green-500 align-middle mr-1" /> Equity</span>
        </div>
        <div ref={balanceRef} className="w-full" />
      </div>

      <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 space-y-1 relative">
        <div className="flex items-center gap-4 text-[10px] text-zinc-500 px-1">
          <span><span className="inline-block w-3 h-0.5 bg-red-500 align-middle mr-1" /> Drawdown %</span>
        </div>
        <div ref={drawdownRef} className="w-full" />
      </div>

      <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 space-y-1 relative">
        <div className="flex items-center gap-4 text-[10px] text-zinc-500 px-1">
          <span><span className="inline-block w-2 h-2 bg-green-500 rounded align-middle mr-1" /> Win</span>
          <span><span className="inline-block w-2 h-2 bg-red-500 rounded align-middle mr-1" /> Loss</span>
        </div>
        <div ref={tradesRef} className="w-full" />
      </div>

      {/* Crosshair tooltip */}
      {tooltip && (
        <div
          className="fixed bg-zinc-900/90 border border-zinc-700 rounded-lg px-3 py-2 text-[11px] font-mono z-50 pointer-events-none shadow-xl"
          style={{
            left: Math.min(tooltip.x + 20, window.innerWidth - 220),
            top: 200,
          }}
        >
          <div className="text-zinc-400 mb-1">{tooltip.time}</div>
          <div className="space-y-0.5">
            <div className="flex justify-between gap-4">
              <span className="text-zinc-500">Balance:</span>
              <span className="text-primary font-bold">${tooltip.balance}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-zinc-500">Drawdown:</span>
              <span className="text-red-400 font-bold">{tooltip.drawdown}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

async function html2canvasSafe(element: HTMLElement): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="${element.offsetWidth}" height="${element.offsetHeight}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml">${element.innerHTML}</div>
      </foreignObject>
    </svg>`;
    const img = new Image();
    img.onload = () => {
      canvas.width = element.offsetWidth;
      canvas.height = element.offsetHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  });
}

import React, { useState } from 'react';
import { Activity } from "lucide-react";
import type { OrderRequest, TradeSide } from "../../hooks/useSimulator";

interface OrderPanelProps {
  balance: number;
  onPlaceOrder: (order: OrderRequest) => Promise<void>;
  symbol: string;
}

export const OrderPanel: React.FC<OrderPanelProps> = ({ balance, onPlaceOrder, symbol }) => {
  const [quantity, setQuantity] = useState<number>(0.1);
  const [takeProfit, setTakeProfit] = useState<number | null>(null);
  const [stopLoss, setStopLoss] = useState<number | null>(null);
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');

  const handleOrder = async (side: TradeSide) => {
    await onPlaceOrder({
      symbol,
      side,
      quantity,
      take_profit: takeProfit,
      stop_loss: stopLoss,
    });
  };

  return (
    <aside className="border-l border-zinc-800 p-6 bg-zinc-950/50 flex flex-col gap-6 w-[300px]">
      <div className="flex items-center gap-2 px-2">
        <Activity size={18} className="text-zinc-400" />
        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Order Terminal</h2>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setOrderType('LIMIT')}
            className={`py-3 rounded-lg font-bold text-sm transition-all active:scale-95 border ${orderType === 'LIMIT'
                ? 'bg-zinc-800 border-zinc-700 text-white'
                : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:bg-zinc-800'
              }`}
          >
            LIMIT
          </button>
          <button
            onClick={() => setOrderType('MARKET')}
            className={`py-3 rounded-lg font-bold text-sm transition-all active:scale-95 ${orderType === 'MARKET'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'bg-zinc-900 border border-zinc-800 text-zinc-500 hover:bg-zinc-800'
              }`}
          >
            MARKET
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Size ({symbol.replace('USDT', '')})</label>
          <div className="relative">
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(parseFloat(e.target.value))}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-lg font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-mono">{symbol.replace('USDT', '')}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Take Profit</label>
            <input
              type="number"
              placeholder="Optional"
              value={takeProfit || ''}
              onChange={(e) => setTakeProfit(e.target.value ? parseFloat(e.target.value) : null)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-green-500/50"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Stop Loss</label>
            <input
              type="number"
              placeholder="Optional"
              value={stopLoss || ''}
              onChange={(e) => setStopLoss(e.target.value ? parseFloat(e.target.value) : null)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-red-500/50"
            />
          </div>
        </div>

        <div className="pt-4 grid grid-cols-2 gap-4">
          <button
            onClick={() => handleOrder('Buy')}
            className="py-4 bg-green-600/10 border border-green-600/30 text-green-500 rounded-xl font-black text-lg hover:bg-green-600 hover:text-white transition-all active:scale-95"
          >
            BUY
          </button>
          <button
            onClick={() => handleOrder('Sell')}
            className="py-4 bg-red-600/10 border border-red-600/30 text-red-500 rounded-xl font-black text-lg hover:bg-red-600 hover:text-white transition-all active:scale-95"
          >
            SELL
          </button>
        </div>
      </div>

      <div className="mt-auto bg-zinc-900/30 border border-zinc-800/50 p-4 rounded-xl">
        <div className="flex justify-between text-xs mb-2">
          <span className="text-zinc-500">Available</span>
          <span className="text-zinc-300 font-mono">${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="flex justify-between text-xs mb-2">
          <span className="text-zinc-500">Equity</span>
          <span className="text-zinc-300 font-mono">${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-3 overflow-hidden">
          <div className="bg-blue-600 h-full w-full"></div>
        </div>
      </div>
    </aside>
  );
};

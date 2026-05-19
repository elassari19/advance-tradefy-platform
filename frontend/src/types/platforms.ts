export type PlatformConnection = {
  id: string;
  platform_id: string;
  connection_name: string;
  api_key: string;
  secret_key: string;
  is_testnet: boolean;
  status: 'connected' | 'error' | 'unknown';
  last_tested_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TestConnectionRequest = {
  platform_id: string;
  api_key: string;
  secret_key: string;
  is_testnet: boolean;
};

export type TestConnectionResponse = {
  success: boolean;
  balance: Record<string, number> | null;
  error: string | null;
};

export type PlatformDef = {
  id: string;
  name: string;
  description: string;
  logoUrl?: string;
  ccxtId: string;
  url: string;
};

export const AVAILABLE_PLATFORMS: PlatformDef[] = [
  { id: 'binance', name: 'Binance', description: 'Spot, USDⓈ-M Futures, COIN-M Futures', ccxtId: 'binance', url: 'https://www.binance.com' },
  { id: 'bybit', name: 'Bybit', description: 'Spot, Inverse & Linear Derivatives', ccxtId: 'bybit', url: 'https://www.bybit.com' },
  { id: 'okx', name: 'OKX', description: 'Spot, Futures, Options & Perpetual Swaps', ccxtId: 'okx', url: 'https://www.okx.com' },
  { id: 'coinbase', name: 'Coinbase', description: 'Advanced Trade, Spot & Pro', ccxtId: 'coinbase', url: 'https://www.coinbase.com' },
  { id: 'kraken', name: 'Kraken', description: 'Spot, Futures & Staking', ccxtId: 'kraken', url: 'https://www.kraken.com' },
  { id: 'gate', name: 'Gate.io', description: 'Spot, Margin, Futures & Options', ccxtId: 'gate', url: 'https://www.gate.com' },
  { id: 'kucoin', name: 'KuCoin', description: 'Spot, Margin & Futures', ccxtId: 'kucoin', url: 'https://www.kucoin.com' },
  { id: 'bitget', name: 'Bitget', description: 'Spot, Futures & Copy Trading', ccxtId: 'bitget', url: 'https://www.bitget.com' },
  { id: 'mexc', name: 'MEXC Global', description: 'Spot, Futures & ETFs', ccxtId: 'mexc', url: 'https://www.mexc.com' },
  { id: 'bitmex', name: 'BitMEX', description: 'Derivatives & Perpetual Swaps', ccxtId: 'bitmex', url: 'https://www.bitmex.com' },
  { id: 'bingx', name: 'BingX', description: 'Spot, Futures & Copy Trading', ccxtId: 'bingx', url: 'https://bingx.com' },
  { id: 'cryptocom', name: 'Crypto.com', description: 'Spot, Derivatives & DeFi Wallet', ccxtId: 'cryptocom', url: 'https://crypto.com/exchange' },
  { id: 'htx', name: 'HTX', description: 'Spot & Futures', ccxtId: 'htx', url: 'https://www.htx.com' },
];

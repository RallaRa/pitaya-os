import {
  kisGetBalance,
  kisGetDailyChart,
  kisGetDailyFills,
  kisGetOrderbook,
  kisGetPendingOrders,
  kisGetPrice,
  kisGetTimeChart,
  kisPlaceOrder,
  kisCancelOrder,
  parseKisBalance,
  parseKisDailyChart,
  parseKisDailyFills,
  parseKisOrderbook,
  parseKisPendingOrders,
  parseKisQuote,
  parseKisTimeChart,
} from '@/lib/stock/kis.server';
import { getTradingStatus } from '@/lib/stock/kisConfig.server';

/** Vercel 내장 KIS — stock-trader-android/server API 호환 */

export async function handleLocalStockTraderApi(
  path: string,
  req: Request,
  method: string,
): Promise<Record<string, unknown>> {
  const segments = path.split('/').filter(Boolean);
  const url = new URL(req.url || 'http://local');

  if (segments[0] === 'status' && method === 'GET') {
    const trading = getTradingStatus();
    return { ok: true, kis: trading.kis, alpaca: trading.alpaca, trading };
  }

  if (segments[0] === 'kis') {
    if (segments[1] === 'balance' && method === 'GET') {
      const data = await kisGetBalance();
      const portfolio = parseKisBalance(data as { output1?: Record<string, string>[]; output2?: Record<string, string>[] });
      return { ok: true, data, portfolio };
    }

    if (segments[1] === 'portfolio' && method === 'GET') {
      const data = await kisGetBalance();
      const portfolio = parseKisBalance(data as { output1?: Record<string, string>[]; output2?: Record<string, string>[] });
      return { ok: true, data, portfolio };
    }

    if (segments[1] === 'price' && segments[2] && method === 'GET') {
      const data = await kisGetPrice(segments[2]);
      return { ok: true, data, quote: parseKisQuote(data as { output?: Record<string, string> }) };
    }

    if (segments[1] === 'orderbook' && segments[2] && method === 'GET') {
      const data = await kisGetOrderbook(segments[2]);
      const book = parseKisOrderbook(data as { output1?: Record<string, string> });
      return { ok: true, book: { ...book, symbol: segments[2].padStart(6, '0') } };
    }

    if (segments[1] === 'chart' && segments[2] && method === 'GET') {
      const period = url.searchParams.get('period') || 'D';
      const days = Math.min(Number(url.searchParams.get('days')) || 90, 100);
      if (period === 'D') {
        const data = await kisGetDailyChart(segments[2], days);
        const candles = parseKisDailyChart(data as { output2?: Record<string, string>[] });
        return { ok: true, candles, period };
      }
      const data = await kisGetTimeChart(segments[2], period);
      const candles = parseKisTimeChart(data as { output2?: Record<string, string>[] });
      return { ok: true, candles, period };
    }

    if (segments[1] === 'quote' && segments[2] && method === 'GET') {
      const [priceRaw, chartRaw] = await Promise.all([
        kisGetPrice(segments[2]),
        kisGetDailyChart(segments[2], 60).catch(() => null),
      ]);
      const quote = parseKisQuote(priceRaw as { output?: Record<string, string> });
      const candles = chartRaw
        ? parseKisDailyChart(chartRaw as { output2?: Record<string, string>[] })
        : [];
      return { ok: true, quote, candles };
    }

    if (segments[1] === 'fills' && method === 'GET') {
      const data = await kisGetDailyFills();
      const fills = parseKisDailyFills(data as { output1?: Record<string, string>[] });
      return { ok: true, fills };
    }

    if (segments[1] === 'pending' && method === 'GET') {
      const data = await kisGetPendingOrders();
      const pending = parseKisPendingOrders(data as { output1?: Record<string, string>[] });
      return { ok: true, pending };
    }

    if (segments[1] === 'cancel' && method === 'POST') {
      const body = await req.json() as {
        symbol?: string;
        qty?: number;
        orderNo?: string;
        orgOrderNo?: string;
      };
      if (!body.symbol || !body.qty || !body.orgOrderNo) {
        throw new Error('symbol, qty, orgOrderNo required');
      }
      const data = await kisCancelOrder({
        symbol: body.symbol,
        qty: body.qty,
        orderNo: body.orderNo || body.orgOrderNo,
        orgOrderNo: body.orgOrderNo,
      });
      return { ok: true, data };
    }

    if (segments[1] === 'order' && method === 'POST') {
      const body = await req.json() as {
        symbol?: string;
        qty?: number;
        side?: 'buy' | 'sell';
        orderType?: 'market' | 'limit';
        price?: number;
      };
      if (!body.symbol || !body.qty || !body.side) {
        throw new Error('symbol, qty, side required');
      }
      const data = await kisPlaceOrder({
        symbol: body.symbol,
        qty: body.qty,
        side: body.side,
        orderType: body.orderType,
        price: body.price,
      });
      return { ok: true, data };
    }
  }

  throw new Error(`로컬 KIS 미지원 경로: ${path}`);
}

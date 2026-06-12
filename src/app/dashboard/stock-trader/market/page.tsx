import { redirect } from 'next/navigation';

export default async function StockTraderMarketPage({
  searchParams,
}: {
  searchParams: Promise<{ symbol?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.symbol ? `?symbol=${sp.symbol}` : '';
  redirect(`/dashboard/stock-trader/trade${q}`);
}

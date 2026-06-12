import { NextResponse } from 'next/server';
import { requireSuperuser } from '@/lib/devAuth';
import { getStockTraderConfig, stockTraderFetch } from '@/lib/stock-trader/client';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path: string[] }> };

async function proxy(req: Request, pathSegments: string[], method: string) {
  const url = new URL(req.url);
  const path = `/api/${pathSegments.join('/')}${url.search}`;
  const init: RequestInit = { method };

  if (method !== 'GET' && method !== 'HEAD') {
    const body = await req.text();
    if (body) init.body = body;
  }

  const data = await stockTraderFetch(path, init);
  return NextResponse.json(data);
}

export async function GET(req: Request, ctx: Ctx) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { configured } = getStockTraderConfig();
  if (!configured) {
    return NextResponse.json({ error: 'STOCK_TRADER_API_TOKEN 미설정' }, { status: 503 });
  }

  try {
    const { path } = await ctx.params;
    return proxy(req, path, 'GET');
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { path } = await ctx.params;
    return proxy(req, path, 'POST');
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { path } = await ctx.params;
    return proxy(req, path, 'PUT');
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

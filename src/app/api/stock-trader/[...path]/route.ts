import { NextResponse } from 'next/server';
import { requireSuperuser } from '@/lib/devAuth';
import { getStockTraderConfig, stockTraderFetch, shouldUseLocalKis } from '@/lib/stock-trader/client';
import { handleLocalStockTraderApi } from '@/lib/stock-trader/localApi.server';

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

async function dispatch(req: Request, pathSegments: string[], method: string) {
  if (shouldUseLocalKis()) {
    const path = pathSegments.join('/');
    try {
      const data = await handleLocalStockTraderApi(path, req, method);
      return NextResponse.json(data);
    } catch (e: unknown) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: e instanceof Error && e.message.includes('required') ? 400 : 500 },
      );
    }
  }
  return proxy(req, pathSegments, method);
}

function notConfigured() {
  return NextResponse.json(
    { error: 'KIS 미설정 — Vercel env: KIS_APP_KEY, KIS_APP_SECRET, KIS_ACCOUNT_NO' },
    { status: 503 },
  );
}

export async function GET(req: Request, ctx: Ctx) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!getStockTraderConfig().configured) return notConfigured();

  try {
    const { path } = await ctx.params;
    return dispatch(req, path, 'GET');
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!getStockTraderConfig().configured) return notConfigured();

  try {
    const { path } = await ctx.params;
    return dispatch(req, path, 'POST');
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!getStockTraderConfig().configured) return notConfigured();

  try {
    const { path } = await ctx.params;
    return dispatch(req, path, 'PUT');
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

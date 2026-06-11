import { NextResponse } from 'next/server';
import { verifyToken, canManageStore } from '@/lib/authVerify';
import {
  DEFAULT_SALES_CATEGORY_KEYWORDS,
  SALES_CATEGORY_LABELS,
  SALES_CATEGORY_ORDER,
  type SalesCategoryKeywords,
} from '@/lib/pos/salesCategory';
import {
  getStoreSalesCategoryKeywords,
  saveStoreSalesCategoryKeywords,
} from '@/lib/pos/salesCategoryAggregate.server';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId 필요' }, { status: 400 });

  try {
    const custom = await getStoreSalesCategoryKeywords(storeId);
    const keywords = { ...DEFAULT_SALES_CATEGORY_KEYWORDS, ...custom };
    return NextResponse.json({
      storeId,
      keywords,
      labels: SALES_CATEGORY_LABELS,
      order: SALES_CATEGORY_ORDER,
      defaults: DEFAULT_SALES_CATEGORY_KEYWORDS,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'load failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json() as { storeId?: string; keywords?: Partial<SalesCategoryKeywords> };
    const { storeId, keywords } = body;
    if (!storeId || !keywords) {
      return NextResponse.json({ error: 'storeId, keywords 필요' }, { status: 400 });
    }

    if (!await canManageStore(authUser.uid, storeId, authUser.email)) {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 });
    }

    const merged = await saveStoreSalesCategoryKeywords(storeId, keywords);
    return NextResponse.json({ success: true, keywords: merged });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'save failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

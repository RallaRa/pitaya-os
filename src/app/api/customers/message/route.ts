import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { canDecryptCustomerPII } from '@/lib/customerDecryptAuth';
import { isMessagingConfigured, sendCustomerMessages, type CustomerMessageVariables } from '@/lib/messaging/sendToCustomers';
import type { CustomerQueryParams } from '@/lib/customerQuery';

interface MessageRequestBody extends Omit<CustomerQueryParams, 'storeId'> {
  storeId?: string;
  templateCode?: string;
  templateId?: string;
  smsFallback?: boolean;
  variables?: CustomerMessageVariables;
  campaignKey?: string;
  dryRun?: boolean;
}

// GET /api/customers/message?storeId=&page=1&limit=20 — 발송 이력
export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 20)));

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const auth = await canDecryptCustomerPII(user.uid, user.email, storeId);
  if (!auth.allowed) {
    return NextResponse.json({ error: '발송 권한이 없습니다 (관리자/master만 허용)' }, { status: 403 });
  }

  try {
    const base = adminDb.collection('customer_message_logs').where('storeId', '==', storeId);

    const snap = await base
      .orderBy('createdAt', 'desc')
      .offset((page - 1) * limit)
      .limit(limit)
      .get();

    let total = snap.size;
    try {
      const countSnap = await base.count().get();
      total = countSnap.data().count;
    } catch {
      if (snap.size === limit) total = page * limit + 1;
      else total = (page - 1) * limit + snap.size;
    }

    const logs = snap.docs.map(doc => {
      const d = doc.data();
      const createdAt = d.createdAt?.toDate?.()
        ? d.createdAt.toDate().toISOString()
        : String(d.createdAt || '');
      return {
        id: doc.id,
        templateCode: d.templateCode || '',
        campaignKey: d.campaignKey || '',
        requestedByEmail: d.requestedByEmail || '',
        totalMatched: d.totalMatched || 0,
        attempted: d.attempted || 0,
        sent: d.sent || 0,
        failed: d.failed || 0,
        skipped: d.skipped || 0,
        skipReasons: d.skipReasons || {},
        filters: d.filters || null,
        variables: d.variables || {},
        createdAt,
      };
    });

    return NextResponse.json({
      configured: isMessagingConfigured(),
      provider: process.env.MESSAGE_PROVIDER?.trim() || 'solapi',
      logs,
      total,
      page,
      limit,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/customers/message — 필터 조건 고객에게 SOLAPI/DHN 알림톡 발송
export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: MessageRequestBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { storeId, templateCode, templateId, smsFallback, variables, campaignKey, dryRun, ...filters } = body;
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const auth = await canDecryptCustomerPII(user.uid, user.email, storeId);
  if (!auth.allowed) {
    return NextResponse.json({ error: '발송 권한이 없습니다 (관리자/master만 허용)' }, { status: 403 });
  }

  try {
    const result = await sendCustomerMessages({
      storeId,
      filters,
      templateCode,
      templateId,
      smsFallback,
      variables,
      campaignKey,
      dryRun: !!dryRun,
      requestedBy: user.uid,
      requestedByEmail: auth.email,
      groupId: auth.groupId,
    });

    if (!result.ok && !result.dryRun) {
      return NextResponse.json(result, { status: result.sent > 0 ? 207 : 400 });
    }

    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

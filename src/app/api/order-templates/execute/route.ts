import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { isCronAuthorized } from '@/lib/cronAuth';
import { ensureSalesAlertChannel } from '@/lib/messenger/channels.server';
import { buildCardMessagePayload } from '@/lib/messenger/cardActions.server';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: Request) {
  const cron = isCronAuthorized(req);
  const user = cron ? null : await verifyToken(req);
  if (!cron && !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { templateId, storeId, lines: overrideLines } = await req.json();
  if (!templateId || !storeId) {
    return NextResponse.json({ error: 'templateId and storeId required' }, { status: 400 });
  }

  const doc = await adminDb.collection('order_templates').doc(templateId).get();
  if (!doc.exists) return NextResponse.json({ error: 'template not found' }, { status: 404 });

  const tpl = doc.data()!;
  if (String(tpl.storeId || '') !== String(storeId)) {
    return NextResponse.json({ error: 'template store mismatch' }, { status: 403 });
  }

  const lines = Array.isArray(overrideLines) && overrideLines.length > 0
    ? overrideLines
    : (Array.isArray(tpl.lines) ? tpl.lines : []);
  const summary = lines.map((l: { itemName?: string; qty?: number; unit?: string }) =>
    `· ${l.itemName} ${l.qty}${l.unit || ''}`,
  ).join('\n');

  const roomId = await ensureSalesAlertChannel(storeId);
  const cardData = {
    title: `발주 요청: ${tpl.name}`,
    subtitle: tpl.supplierName || '거래처 미지정',
    body: summary || '품목 없음',
    meta: { templateId, storeId },
  };

  const payload = buildCardMessagePayload({
    roomId,
    senderUid: user?.uid || 'system',
    senderName: user?.email || '자동발주',
    type: 'order_request',
    cardData,
    actions: [
      { id: 'approve', label: '승인', style: 'primary' },
      { id: 'reject', label: '거절', style: 'danger' },
    ],
  });

  const ref = await adminDb.collection('chat_messages').add({
    ...payload,
    createdAt: FieldValue.serverTimestamp(),
    readBy: user ? [user.uid] : [],
    actionState: {},
  });

  return NextResponse.json({ success: true, messageId: ref.id });
}

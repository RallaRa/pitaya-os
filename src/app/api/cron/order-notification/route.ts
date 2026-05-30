import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app';
    const storesSnap = await adminDb.collection('stores').get();
    let notified = 0;

    const cronHeaders: Record<string, string> = {};
    if (process.env.CRON_SECRET) cronHeaders['x-cron-secret'] = process.env.CRON_SECRET;

    for (const storeDoc of storesSnap.docs) {
      const storeId = storeDoc.id;
      try {
        const res = await fetch(`${baseUrl}/api/order/check-delivery-gap?storeId=${storeId}`, {
          headers: cronHeaders,
        });
        const data = await res.json();
        if (!data.dDayType) continue;

        const membersSnap = await adminDb.collection('user_store_map')
          .where('storeId', '==', storeId).get();

        const notifMsg = {
          'D-2': '📦 발주 마감이 이틀 남았습니다.',
          'D-1': '📦 발주 마감이 내일입니다! 확인해주세요.',
          '당일': '🚨 오늘이 발주 마감일입니다!',
          '배송불가': '🚨 배송 불가 구간입니다. 긴급 발주가 필요합니다.',
        }[data.dDayType as string] || '';

        if (!notifMsg) continue;

        let aiTip = '';
        if (process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY) {
          try {
            const { generateTextWithFallback } = await import('@/lib/aiProviderFallback');
            const { text } = await generateTextWithFallback({
              prompt: `정육점 발주 알림: ${data.dDayType}. ${notifMsg} 1문장 발주 조언만.`,
              useCase: 'fast',
            });
            aiTip = text.trim().slice(0, 120);
          } catch { /* ignore */ }
        }

        const batch = adminDb.batch();
        for (const memberDoc of membersSnap.docs) {
          const uid = memberDoc.data().uid;
          const ref = adminDb.collection('notifications').doc();
          batch.set(ref, {
            targetUid:  uid,
            senderUid:  '',
            senderName: 'Pitaya OS',
            type:       'order_alert',
            title:      '발주 알림',
            message:    aiTip ? `${notifMsg}\n💡 ${aiTip}` : notifMsg,
            link:       '/dashboard/suppliers',
            dDayType:   data.dDayType,
            storeId,
            isRead:     false,
            createdAt:  FieldValue.serverTimestamp(),
          });
          notified++;
        }
        await batch.commit();
      } catch { /* skip store */ }
    }

    return NextResponse.json({ ok: true, notified });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

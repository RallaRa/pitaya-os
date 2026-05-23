import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

async function sendNotification(targetUid: string, title: string, body: string, link: string) {
  await adminDb.collection('notifications').add({
    targetUid, title, body, link,
    type: 'hr_dayoff',
    isRead: false,
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function getAdminUids(storeId: string): Promise<string[]> {
  if (!storeId) return [];
  const snap = await adminDb.collection('store_members')
    .where('storeId', '==', storeId)
    .where('role', 'in', ['owner', 'admin'])
    .where('status', '==', 'approved')
    .get();
  return snap.docs.map(d => d.data().uid).filter(Boolean);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId  = searchParams.get('userId');
  const storeId = searchParams.get('storeId');
  const status  = searchParams.get('status');
  const month   = searchParams.get('month');

  try {
    let q: FirebaseFirestore.Query = adminDb.collection('hr_dayoff_requests');
    if (userId)  q = q.where('userId', '==', userId);
    if (storeId) q = q.where('storeId', '==', storeId);
    if (status)  q = q.where('status', '==', status);

    const snap = await q.limit(500).get();
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    docs.sort((a: any, b: any) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
    docs = docs.slice(0, 200);

    if (month) {
      docs = docs.filter((d: any) => {
        const dates: string[] = d.dates || [];
        return dates.some(date => date.startsWith(month));
      });
    }

    return NextResponse.json({ requests: docs });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, userName, userEmail, storeId, type, dates, reason } = body;

    if (!userId || !type || !dates?.length) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
    }

    const ref = await adminDb.collection('hr_dayoff_requests').add({
      userId, userName, userEmail, storeId,
      type,    // regular | substitute | unpaid
      dates,   // string[]
      reason:  reason || '',
      status:  'pending',
      createdAt:   FieldValue.serverTimestamp(),
      approvedBy:  null,
      approvedAt:  null,
    });

    const admins = await getAdminUids(storeId);
    const typeLabel = { regular: '정기휴무', substitute: '대체휴무', unpaid: '무급휴무' }[type as string] || type;
    const dateStr = dates.length === 1 ? dates[0] : `${dates[0]} 외 ${dates.length - 1}일`;
    await Promise.all(admins.map(uid =>
      sendNotification(uid,
        '휴무 신청',
        `${userName}님이 ${typeLabel} 신청했습니다 (${dateStr})`,
        '/dashboard/hr/calendar',
      )
    ));

    return NextResponse.json({ id: ref.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, status, approvedBy, approvedByName } = body;

    if (!id || !status) return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });

    const ref  = adminDb.collection('hr_dayoff_requests').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: '신청 없음' }, { status: 404 });

    await ref.update({
      status,
      approvedBy:     approvedBy || null,
      approvedByName: approvedByName || null,
      approvedAt:     FieldValue.serverTimestamp(),
    });

    const data    = snap.data()!;
    const label   = status === 'approved' ? '승인' : '거절';
    const typeLabel = { regular: '정기휴무', substitute: '대체휴무', unpaid: '무급휴무' }[data.type as string] || data.type;
    const dateStr = data.dates?.length === 1 ? data.dates[0] : `${data.dates?.[0]} 외 ${data.dates?.length - 1}일`;
    await sendNotification(
      data.userId,
      `휴무 ${label}`,
      `${dateStr} ${typeLabel} 신청이 ${label}되었습니다.`,
      '/dashboard/hr/calendar',
    );

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id     = searchParams.get('id');
  const userId = searchParams.get('userId');

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  try {
    const ref  = adminDb.collection('hr_dayoff_requests').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: '신청 없음' }, { status: 404 });

    const data = snap.data()!;
    if (data.userId !== userId) return NextResponse.json({ error: '권한 없음' }, { status: 403 });
    if (data.status !== 'pending') return NextResponse.json({ error: '대기 중인 신청만 취소 가능' }, { status: 400 });

    await ref.delete();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

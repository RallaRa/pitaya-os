import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

const CLIENT_ID     = process.env.NAVER_CLIENT_ID     || '';
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || '';
const BASE_URL      = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9000';
const REDIRECT_URI  = `${BASE_URL}/api/calendar/naver/callback`;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const uid    = searchParams.get('uid');

  if (action === 'auth') {
    if (!CLIENT_ID) return NextResponse.json({ error: '네이버 캘린더 미설정' }, { status: 400 });
    if (!uid)       return NextResponse.json({ error: 'uid required' }, { status: 400 });

    const state = `${uid}_${Date.now()}`;
    const url = new URL('https://nid.naver.com/oauth2.0/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id',     CLIENT_ID);
    url.searchParams.set('redirect_uri',  REDIRECT_URI);
    url.searchParams.set('state',         state);

    // state에 uid 포함시켜 Firestore에 임시 저장
    await adminDb.collection('calendar_oauth_state').doc(state).set({
      uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ authUrl: url.toString() });
  }

  if (action === 'status') {
    if (!uid) return NextResponse.json({ connected: false });
    const doc = await adminDb.collection('calendar_connections').doc(`${uid}_naver`).get();
    return NextResponse.json({ connected: doc.exists, name: doc.data()?.name || '' });
  }

  if (action === 'events') {
    if (!uid) return NextResponse.json({ events: [] });

    const doc = await adminDb.collection('calendar_connections').doc(`${uid}_naver`).get();
    if (!doc.exists) return NextResponse.json({ events: [], connected: false });

    const { accessToken } = doc.data()!;
    if (!accessToken) return NextResponse.json({ events: [], connected: false });

    try {
      const now   = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end   = new Date(now.getFullYear(), now.getMonth() + 3, 0);

      const startStr = start.toISOString().replace(/[-:]/g, '').replace(/\..+/, '') + 'Z';
      const endStr   = end.toISOString().replace(/[-:]/g, '').replace(/\..+/, '') + 'Z';

      const res = await fetch(
        `https://openapi.naver.com/calendar/selectSchedule.json?startDateTime=${startStr}&endDateTime=${endStr}&timeZoneOffset=+09:00`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Naver-Client-Id':     CLIENT_ID,
            'X-Naver-Client-Secret': CLIENT_SECRET,
          },
          signal: AbortSignal.timeout(8000),
        },
      );

      if (!res.ok) return NextResponse.json({ events: [], connected: true });

      const text = await res.text();
      // Naver returns VCALENDAR format — extract VEVENT blocks
      const events = parseNaverVCal(text);
      return NextResponse.json({ events, connected: true });
    } catch {
      return NextResponse.json({ events: [], connected: true });
    }
  }

  return NextResponse.json({ error: 'invalid action' }, { status: 400 });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get('uid');
  if (!uid) return NextResponse.json({ error: 'uid required' }, { status: 400 });

  try {
    const ref  = adminDb.collection('calendar_connections').doc(`${uid}_naver`);
    const snap = await ref.get();
    if (snap.exists) {
      const { accessToken } = snap.data()!;
      if (accessToken && CLIENT_ID && CLIENT_SECRET) {
        fetch(`https://nid.naver.com/oauth2.0/token?grant_type=delete&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&access_token=${accessToken}&service_provider=NAVER`).catch(() => {});
      }
      await ref.delete();
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function parseNaverVCal(vcal: string): any[] {
  const events: any[] = [];
  const blocks = vcal.split('BEGIN:VEVENT');
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const get   = (key: string) => {
      const m = block.match(new RegExp(`${key}[^:]*:(.+)`));
      return m ? m[1].trim() : '';
    };
    const dtstart = get('DTSTART');
    const dtend   = get('DTEND');
    const toDate  = (s: string) => s ? `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}` : '';
    events.push({
      id:        `naver_${get('UID') || i}`,
      title:     get('SUMMARY') || '(제목 없음)',
      startDate: toDate(dtstart),
      endDate:   toDate(dtend),
      type:      'task',
      source:    'naver',
      color:     'bg-green-600',
      description: get('DESCRIPTION'),
    });
  }
  return events;
}

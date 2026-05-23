import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

const CLIENT_ID     = process.env.GOOGLE_CALENDAR_CLIENT_ID     || '';
const CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '';
const BASE_URL      = process.env.NEXT_PUBLIC_APP_URL           || 'http://localhost:9000';
const REDIRECT_URI  = `${BASE_URL}/api/calendar/google/callback`;
const SCOPE         = 'https://www.googleapis.com/auth/calendar';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const uid    = searchParams.get('uid');

  // OAuth URL 생성
  if (action === 'auth') {
    if (!CLIENT_ID) return NextResponse.json({ error: 'Google Calendar 미설정' }, { status: 400 });
    if (!uid)       return NextResponse.json({ error: 'uid required' }, { status: 400 });

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id',     CLIENT_ID);
    url.searchParams.set('redirect_uri',  REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope',         SCOPE);
    url.searchParams.set('access_type',   'offline');
    url.searchParams.set('prompt',        'consent');
    url.searchParams.set('state',         uid);

    return NextResponse.json({ authUrl: url.toString() });
  }

  // 연동 상태 확인
  if (action === 'status') {
    if (!uid) return NextResponse.json({ connected: false });
    const doc = await adminDb.collection('calendar_connections').doc(`${uid}_google`).get();
    return NextResponse.json({ connected: doc.exists, email: doc.data()?.email || '' });
  }

  // 이벤트 조회
  if (action === 'events') {
    if (!uid) return NextResponse.json({ events: [] });

    const doc = await adminDb.collection('calendar_connections').doc(`${uid}_google`).get();
    if (!doc.exists) return NextResponse.json({ events: [], connected: false });

    const { accessToken, refreshToken } = doc.data()!;
    let token = accessToken;

    // 토큰 갱신 시도
    if (!token && refreshToken) {
      try {
        const res = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id:     CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type:    'refresh_token',
            refresh_token: refreshToken,
          }),
        });
        const data = await res.json();
        if (data.access_token) {
          token = data.access_token;
          await doc.ref.update({ accessToken: token });
        }
      } catch { /* ignore */ }
    }

    if (!token) return NextResponse.json({ events: [], connected: false });

    try {
      const now   = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const end   = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${start}&timeMax=${end}&singleEvents=true&orderBy=startTime&maxResults=200`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) },
      );

      if (!res.ok) return NextResponse.json({ events: [], connected: true });

      const data   = await res.json();
      const events = (data.items || []).map((e: any) => ({
        id:        `google_${e.id}`,
        title:     e.summary || '(제목 없음)',
        startDate: (e.start?.date || e.start?.dateTime || '').substring(0, 10),
        endDate:   (e.end?.date   || e.end?.dateTime   || '').substring(0, 10),
        type:      'task',
        source:    'google',
        color:     'bg-blue-600',
        description: e.description || '',
      }));

      return NextResponse.json({ events, connected: true });
    } catch {
      return NextResponse.json({ events: [], connected: true });
    }
  }

  return NextResponse.json({ error: 'invalid action' }, { status: 400 });
}

// 연동 해제
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get('uid');
  if (!uid) return NextResponse.json({ error: 'uid required' }, { status: 400 });

  try {
    const ref  = adminDb.collection('calendar_connections').doc(`${uid}_google`);
    const snap = await ref.get();
    if (snap.exists) {
      const { accessToken } = snap.data()!;
      if (accessToken) {
        fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, { method: 'POST' }).catch(() => {});
      }
      await ref.delete();
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

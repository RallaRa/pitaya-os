import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

const CLIENT_ID     = process.env.NAVER_CLIENT_ID     || '';
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || '';
const BASE_URL      = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9000';
const REDIRECT_URI  = `${BASE_URL}/api/calendar/naver/callback`;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error || !code || !state) {
    return NextResponse.redirect(`${BASE_URL}/dashboard/hr/calendar?tab=settings&error=naver_auth_failed`);
  }

  // state에서 uid 조회
  const stateDoc = await adminDb.collection('calendar_oauth_state').doc(state).get();
  if (!stateDoc.exists) {
    return NextResponse.redirect(`${BASE_URL}/dashboard/hr/calendar?tab=settings&error=invalid_state`);
  }

  const uid = stateDoc.data()!.uid;
  await stateDoc.ref.delete();

  try {
    const res = await fetch(
      `https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&code=${code}&state=${state}`,
    );
    const data = await res.json();

    if (!data.access_token) {
      return NextResponse.redirect(`${BASE_URL}/dashboard/hr/calendar?tab=settings&error=naver_token_failed`);
    }

    // 사용자 정보 조회
    let name = '';
    try {
      const profileRes = await fetch('https://openapi.naver.com/v1/nid/me', {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const profile = await profileRes.json();
      name = profile.response?.name || profile.response?.nickname || '';
    } catch { /* ignore */ }

    await adminDb.collection('calendar_connections').doc(`${uid}_naver`).set({
      uid,
      provider:     'naver',
      name,
      accessToken:  data.access_token,
      refreshToken: data.refresh_token || '',
      connectedAt:  FieldValue.serverTimestamp(),
    });

    return NextResponse.redirect(`${BASE_URL}/dashboard/hr/calendar?tab=settings&connected=naver`);
  } catch {
    return NextResponse.redirect(`${BASE_URL}/dashboard/hr/calendar?tab=settings&error=server_error`);
  }
}

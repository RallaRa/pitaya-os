import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

const CLIENT_ID     = process.env.GOOGLE_CALENDAR_CLIENT_ID     || '';
const CLIENT_SECRET = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '';
const BASE_URL      = process.env.NEXT_PUBLIC_APP_URL           || 'http://localhost:9000';
const REDIRECT_URI  = `${BASE_URL}/api/calendar/google/callback`;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get('code');
  const state = searchParams.get('state'); // uid
  const error = searchParams.get('error');

  if (error || !code || !state) {
    return NextResponse.redirect(`${BASE_URL}/dashboard/hr/calendar?tab=settings&error=google_auth_failed`);
  }

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        grant_type:    'authorization_code',
      }),
    });

    const data = await res.json();
    if (!data.access_token) {
      return NextResponse.redirect(`${BASE_URL}/dashboard/hr/calendar?tab=settings&error=token_failed`);
    }

    // 사용자 이메일 조회
    let email = '';
    try {
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const profile = await profileRes.json();
      email = profile.email || '';
    } catch { /* ignore */ }

    await adminDb.collection('calendar_connections').doc(`${state}_google`).set({
      uid:          state,
      provider:     'google',
      email,
      accessToken:  data.access_token,
      refreshToken: data.refresh_token || '',
      expiresIn:    data.expires_in || 3600,
      connectedAt:  FieldValue.serverTimestamp(),
    });

    return NextResponse.redirect(`${BASE_URL}/dashboard/hr/calendar?tab=settings&connected=google`);
  } catch (e: any) {
    return NextResponse.redirect(`${BASE_URL}/dashboard/hr/calendar?tab=settings&error=server_error`);
  }
}

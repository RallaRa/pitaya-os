import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { testDriveConnection } from '@/lib/googleDrive';

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { code?: string; storeId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const code = body.code?.trim();
  const storeId = body.storeId?.trim();
  if (!code || !storeId) {
    return NextResponse.json({ error: 'code and storeId required' }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Google OAuth 미설정' }, { status: 503 });
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: 'postmessage',
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.refresh_token) {
      const msg = tokens.error_description || tokens.error || 'refresh_token 없음 — 다시 연결해 주세요';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    let email: string | null = null;
    if (tokens.access_token) {
      try {
        const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const profile = await profileRes.json();
        email = profile.email || null;
      } catch { /* ignore */ }
    }

    await adminDb.collection('store_settings').doc(storeId).set({
      googleDriveRefreshToken: tokens.refresh_token,
      googleDriveEmail: email,
      googleDriveConnectedAt: FieldValue.serverTimestamp(),
      googleDriveLinkSource: 'popup',
    }, { merge: true });

    const connected = await testDriveConnection(storeId);

    return NextResponse.json({
      ok: connected,
      connected,
      email,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import {
  ensureDriveConnection,
  getDriveAuthUrl,
  testDriveConnection,
} from '@/lib/googleDrive';

function isAuthorized(req: Request): boolean {
  const secret = process.env.HYGIENE_CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  return url.searchParams.get('secret') === secret
    || req.headers.get('x-cron-secret') === secret;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const storeId = new URL(req.url).searchParams.get('storeId')?.trim()
    || process.env.POS_STORE_ID
    || 'STR-1779194754785';

  if (await ensureDriveConnection(storeId)) {
    const ok = await testDriveConnection(storeId);
    if (ok) {
      const doc = await adminDb.collection('store_settings').doc(storeId).get();
      return NextResponse.json({
        ok: true,
        connected: true,
        storeId,
        email: doc.data()?.googleDriveEmail || null,
        source: doc.data()?.googleDriveLinkSource || 'existing',
      });
    }
  }

  if (!process.env.GOOGLE_CLIENT_ID?.trim() || !process.env.GOOGLE_CLIENT_SECRET?.trim()) {
    return NextResponse.json({
      error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 미설정',
      storeId,
    }, { status: 503 });
  }

  return NextResponse.redirect(getDriveAuthUrl(storeId));
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { storeId?: string; refreshToken?: string } = {};
  try {
    body = await req.json();
  } catch { /* optional body */ }

  const storeId = body.storeId?.trim() || process.env.POS_STORE_ID || 'STR-1779194754785';
  const refreshToken = body.refreshToken?.trim() || process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
  if (!refreshToken) {
    return NextResponse.json({ error: 'refreshToken required' }, { status: 400 });
  }

  await adminDb.collection('store_settings').doc(storeId).set({
    googleDriveRefreshToken: refreshToken,
    googleDriveConnectedAt: FieldValue.serverTimestamp(),
    googleDriveLinkSource: 'admin',
  }, { merge: true });

  const connected = await testDriveConnection(storeId);
  const doc = await adminDb.collection('store_settings').doc(storeId).get();

  return NextResponse.json({
    ok: connected,
    connected,
    storeId,
    email: doc.data()?.googleDriveEmail || null,
  });
}

import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { adminDb } from '@/lib/firebase/admin';
import { ensureDriveConnection, isDriveConnected } from '@/lib/googleDrive';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId')?.trim();
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const hasClientSecret = !!process.env.GOOGLE_CLIENT_SECRET?.trim();
  const hasClientId = !!process.env.GOOGLE_CLIENT_ID?.trim();

  await ensureDriveConnection(storeId);
  const doc = await adminDb.collection('store_settings').doc(storeId).get();
  const hasToken = !!doc.data()?.googleDriveRefreshToken
    || !!process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
  const connected = hasClientSecret ? await isDriveConnected(storeId) : false;

  return NextResponse.json({
    connected,
    email: doc.data()?.googleDriveEmail || null,
    hasToken,
    oauthConfigured: hasClientId && hasClientSecret,
    ...(hasToken && !connected && !hasClientSecret
      ? { hint: '서버에 GOOGLE_CLIENT_SECRET이 없습니다. Vercel Production 환경 변수를 확인하세요.' }
      : {}),
    ...(hasToken && !connected && hasClientSecret
      ? { hint: '토큰은 있으나 Drive 접근이 거부됐습니다. 「다시 연결」을 눌러 주세요.' }
      : {}),
  });
}

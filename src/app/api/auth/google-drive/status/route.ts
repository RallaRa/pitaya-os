import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { adminDb } from '@/lib/firebase/admin';
import { ensureDriveConnection, isDriveConnected, getOAuthRefreshToken } from '@/lib/googleDrive';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId')?.trim();
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  await ensureDriveConnection(storeId);
  const connected = await isDriveConnected(storeId);
  const doc = await adminDb.collection('store_settings').doc(storeId).get();
  return NextResponse.json({
    connected,
    email: doc.data()?.googleDriveEmail || null,
    hasToken: !!(await getOAuthRefreshToken(storeId)),
  });
}

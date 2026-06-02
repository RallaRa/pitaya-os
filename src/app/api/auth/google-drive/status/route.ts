import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { ensureDriveConnection, isDriveConnected } from '@/lib/googleDrive';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId')?.trim();
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  await ensureDriveConnection(storeId);
  const connected = await isDriveConnected(storeId);
  return NextResponse.json({ connected });
}

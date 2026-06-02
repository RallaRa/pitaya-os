import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { getDriveAuthUrl } from '@/lib/googleDrive';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const storeId = new URL(req.url).searchParams.get('storeId')?.trim();
  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 설정이 필요합니다' },
      { status: 503 },
    );
  }

  return NextResponse.json({ url: getDriveAuthUrl(storeId) });
}

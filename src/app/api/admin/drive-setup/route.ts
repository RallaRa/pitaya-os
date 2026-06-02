import { NextResponse } from 'next/server';
import { ensureDriveConnection, testDriveConnection } from '@/lib/googleDrive';
import { adminDb } from '@/lib/firebase/admin';

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
      });
    }
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app';
  return NextResponse.redirect(`${base}/dashboard/settings/store?drive=connect`);
}

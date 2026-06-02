import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getDriveOAuth2Client } from '@/lib/googleDrive';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const storeId = searchParams.get('state')?.trim();
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app';

  if (!code || !storeId) {
    return NextResponse.redirect(`${base}/dashboard/settings/store?drive=error`);
  }

  try {
    const oauth2 = getDriveOAuth2Client();
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(`${base}/dashboard/settings/store?drive=no_token`);
    }

    await adminDb.collection('store_settings').doc(storeId).set(
      { googleDriveRefreshToken: tokens.refresh_token },
      { merge: true },
    );

    return NextResponse.redirect(`${base}/dashboard/settings/store?drive=connected`);
  } catch {
    return NextResponse.redirect(`${base}/dashboard/settings/store?drive=error`);
  }
}

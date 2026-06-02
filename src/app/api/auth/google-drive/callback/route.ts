import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { getDriveOAuth2Client, testDriveConnection } from '@/lib/googleDrive';

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

    oauth2.setCredentials({ refresh_token: tokens.refresh_token });
    let email: string | null = null;
    try {
      const { google } = await import('googleapis');
      const drive = google.drive({ version: 'v3', auth: oauth2 });
      const about = await drive.about.get({ fields: 'user/emailAddress' });
      email = about.data.user?.emailAddress || null;
    } catch { /* ignore */ }

    await adminDb.collection('store_settings').doc(storeId).set({
      googleDriveRefreshToken: tokens.refresh_token,
      googleDriveEmail: email,
      googleDriveConnectedAt: FieldValue.serverTimestamp(),
      googleDriveLinkSource: 'oauth',
    }, { merge: true });

    await testDriveConnection(storeId);

    return NextResponse.redirect(`${base}/dashboard/settings/store?drive=connected`);
  } catch {
    return NextResponse.redirect(`${base}/dashboard/settings/store?drive=error`);
  }
}

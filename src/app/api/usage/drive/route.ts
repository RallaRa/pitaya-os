import { NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.metadata.readonly';

async function getAccessToken(): Promise<string | null> {
  // 우선순위: GOOGLE_SERVICE_ACCOUNT_KEY → FIREBASE_SERVICE_ACCOUNT_KEY
  const keyStr = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!keyStr) return null;

  try {
    const key = JSON.parse(keyStr);
    const auth = new GoogleAuth({
      credentials: key,
      scopes: [DRIVE_SCOPE],
    });
    const client = await auth.getClient();
    const tokenRes = await (client as any).getAccessToken();
    return tokenRes?.token || tokenRes?.access_token || null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    // 1차: 환경변수 GOOGLE_DRIVE_ACCESS_TOKEN (수동 OAuth 토큰)
    let accessToken: string | null = process.env.GOOGLE_DRIVE_ACCESS_TOKEN || null;

    // 2차: 서비스 계정으로 토큰 발급
    if (!accessToken) {
      accessToken = await getAccessToken();
    }

    if (!accessToken) {
      return NextResponse.json({
        available: false,
        reason: '서비스 계정 키 없음 (FIREBASE_SERVICE_ACCOUNT_KEY 또는 GOOGLE_DRIVE_ACCESS_TOKEN 필요)',
      });
    }

    const res = await fetch(
      'https://www.googleapis.com/drive/v3/about?fields=storageQuota,user',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      // 403: Drive API 미활성화 또는 권한 없음
      const reason = res.status === 403
        ? 'Google Drive API 미활성화 또는 권한 부족'
        : `Drive API 오류 (${res.status})`;
      return NextResponse.json({ available: false, reason, detail: errBody });
    }

    const data = await res.json();
    const quota = data.storageQuota || {};

    const usageBytes = parseInt(quota.usage       || '0', 10);
    const limitBytes = parseInt(quota.limit        || '0', 10);
    const driveBytes = parseInt(quota.usageInDrive || quota.usage || '0', 10);

    const toGB = (b: number) => Math.round((b / (1024 ** 3)) * 100) / 100;

    return NextResponse.json({
      available:  true,
      usageBytes,
      limitBytes,
      driveBytes,
      usageGB:    toGB(usageBytes),
      limitGB:    toGB(limitBytes) || 15, // 무료 15GB 기본
      driveGB:    toGB(driveBytes),
      user:       data.user?.emailAddress || '',
      source:     'google_drive_api',
    });
  } catch (e: any) {
    return NextResponse.json({ available: false, reason: e.message });
  }
}

import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { isSuperuserEmail } from '@/lib/auth/permissions';
import { isCronAuthorized } from '@/lib/cronAuth';

export const dynamic = 'force-dynamic';

/** 프로덕션(Vercel)에서 apis.data.go.kr 등으로 나가는 공인 IP 확인 */
export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  const cronOk = isCronAuthorized(req);
  const superOk = authUser && isSuperuserEmail(authUser.email);

  if (!cronOk && !superOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const res = await fetch('https://api.ipify.org?format=json', {
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`ipify HTTP ${res.status}`);
    const { ip } = (await res.json()) as { ip?: string };

    return NextResponse.json({
      outboundIp: ip || null,
      checkedAt: new Date().toISOString(),
      hint: 'IP 필수 API 신청 시 Vercel Static IPs(고정 2개)를 활성화한 뒤, 대시보드에 표시된 IP를 공공데이터포털에 등록하세요. 이 값이 매번 바뀌면 Static IPs 미적용 상태입니다.',
      appUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

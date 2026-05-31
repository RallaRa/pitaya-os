import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { sendKakaoNotify } from '@/lib/kakao/sendNotify';

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { userId, title, message, link, imageUrl } = await req.json();
    const targetUserId = userId || authUser.uid;

    if (!title || !message) {
      return NextResponse.json({ error: 'title, message 필수' }, { status: 400 });
    }

    const result = await sendKakaoNotify({
      userId: targetUserId,
      title,
      message,
      link,
      imageUrl,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || '카카오 로그인 필요' }, { status: 401 });
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '알림 발송 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

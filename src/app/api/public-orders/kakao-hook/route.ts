import { NextResponse } from 'next/server';
import { verifyToken, canManageStore } from '@/lib/authVerify';
import {
  getPublicOrderKakaoHookConfig,
  savePublicOrderKakaoHookConfig,
  buildAndroidForwardProfile,
  type PublicOrderKakaoHookConfig,
} from '@/lib/publicOrderKakaoHook';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const canManage = await canManageStore(authUser.uid, storeId, authUser.email);

  try {
    const config = await getPublicOrderKakaoHookConfig(storeId);
    return NextResponse.json({
      config,
      androidProfile: buildAndroidForwardProfile(config),
      canManage,
      flow: [
        '1. 공개주문 접수 → Pitaya가 카카오 「나에게 보내기」로 알림 (기존 연동)',
        '2. 안드로이드가 그 카톡 알림을 감지',
        '3. 설정한 오픈채팅방에 같은 내용 붙여넣기·전송',
      ],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    storeId?: string;
    enabled?: boolean;
    openChatRoomName?: string;
    sourceChatTitle?: string;
    notifyKeywords?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const storeId = body.storeId || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const canManage = await canManageStore(authUser.uid, storeId, authUser.email);
  if (!canManage) {
    return NextResponse.json({ error: '매장 관리 권한이 필요합니다' }, { status: 403 });
  }

  try {
    const patch: Partial<PublicOrderKakaoHookConfig> = {};
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
    if (typeof body.openChatRoomName === 'string') {
      patch.openChatRoomName = body.openChatRoomName.trim();
    }
    if (typeof body.sourceChatTitle === 'string') {
      patch.sourceChatTitle = body.sourceChatTitle.trim();
    }
    if (Array.isArray(body.notifyKeywords)) {
      patch.notifyKeywords = body.notifyKeywords.map(String).map(s => s.trim()).filter(Boolean);
    }

    const config = await savePublicOrderKakaoHookConfig(storeId, patch);
    return NextResponse.json({
      config,
      androidProfile: buildAndroidForwardProfile(config),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

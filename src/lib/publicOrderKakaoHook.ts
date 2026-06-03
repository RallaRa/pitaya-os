import { adminDb } from '@/lib/firebase/admin';
import { sendKakaoNotifyToStore } from '@/lib/kakao/sendNotify';
import { formatPublicOrderNotifyMessage } from '@/lib/publicOrders';

/** 안드로이드가 「나에게 보내기」 알림 → 오픈채팅방 전달에 쓸 설정 */
export interface PublicOrderKakaoHookConfig {
  /** 안드로이드 자동 전달 사용 */
  enabled: boolean;
  /** 붙여넣을 오픈채팅·단체방 이름(일부 일치) */
  openChatRoomName: string;
  /** 알림 제목에 포함되면 후킹 (기본: 나와의 채팅) */
  sourceChatTitle: string;
  /** 알림 본문·제목 키워드 (공개주문 Pitaya 메모) */
  notifyKeywords: string[];
}

const DEFAULT_CONFIG: PublicOrderKakaoHookConfig = {
  enabled: false,
  openChatRoomName: '',
  sourceChatTitle: '나와의 채팅',
  notifyKeywords: ['공개 주문', 'Pitaya'],
};

function parseKeywords(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map(String).map(s => s.trim()).filter(Boolean).slice(0, 10);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }
  return DEFAULT_CONFIG.notifyKeywords;
}

export async function getPublicOrderKakaoHookConfig(
  storeId: string,
): Promise<PublicOrderKakaoHookConfig> {
  const doc = await adminDb.collection('store_settings').doc(storeId).get();
  const raw = doc.data()?.publicOrderKakaoHook;
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CONFIG };
  const openChatRoomName = String(
    raw.openChatRoomName || raw.kakaoRoomName || '',
  ).trim();
  return {
    enabled: !!raw.enabled,
    openChatRoomName,
    sourceChatTitle: String(raw.sourceChatTitle || DEFAULT_CONFIG.sourceChatTitle).trim()
      || DEFAULT_CONFIG.sourceChatTitle,
    notifyKeywords: parseKeywords(raw.notifyKeywords).length
      ? parseKeywords(raw.notifyKeywords)
      : DEFAULT_CONFIG.notifyKeywords,
  };
}

export async function savePublicOrderKakaoHookConfig(
  storeId: string,
  patch: Partial<PublicOrderKakaoHookConfig>,
): Promise<PublicOrderKakaoHookConfig> {
  const current = await getPublicOrderKakaoHookConfig(storeId);
  const next: PublicOrderKakaoHookConfig = { ...current, ...patch };
  await adminDb.collection('store_settings').doc(storeId).set(
    { publicOrderKakaoHook: next },
    { merge: true },
  );
  return next;
}

/** Pitaya → 카카오 「나에게 보내기」(기존 연동). 안드로이드는 이 알림만 후킹하면 됨. */
export function formatPublicOrderKakaoText(opts: {
  sessionTitle: string;
  ordererName: string;
  ordererPhoneMasked?: string;
  totalAmount: number;
  lines?: { name: string; qty: number; unit?: string; unitPrice?: number }[];
  note?: string;
}): string {
  const { sessionTitle, ordererName, ordererPhoneMasked, lines = [], note } = opts;
  const main = formatPublicOrderNotifyMessage({
    ordererName,
    ordererPhoneMasked,
    lines,
  });
  const parts = [
    `[공개주문] ${sessionTitle}`,
    main,
    note ? `요청사항: ${note}` : '',
  ].filter(Boolean);
  return parts.join('\n');
}

export async function sendPublicOrderKakaoMemo(opts: {
  storeId: string;
  sessionTitle: string;
  ordererName: string;
  ordererPhoneMasked?: string;
  totalAmount: number;
  lines?: { name: string; qty: number; unit?: string; unitPrice?: number }[];
  note?: string;
  link?: string;
}): Promise<void> {
  const text = formatPublicOrderKakaoText(opts);
  await sendKakaoNotifyToStore(opts.storeId, {
    title: '🛒 공개 주문',
    message: text.slice(0, 200),
    link: opts.link || '/dashboard/public-orders',
  });
}

/** MacroDroid·Tasker용 프로필 값 */
export function buildAndroidForwardProfile(config: PublicOrderKakaoHookConfig) {
  return {
    enabled: config.enabled,
    openChatRoomName: config.openChatRoomName,
    sourceChatTitle: config.sourceChatTitle,
    notifyKeywords: config.notifyKeywords,
    kakaoPackage: 'com.kakao.talk',
    steps: [
      `트리거: 앱=com.kakao.talk, 알림 표시`,
      `조건: 알림 제목에 「${config.sourceChatTitle}」 포함`,
      `조건: 알림 텍스트에 ${config.notifyKeywords.map(k => `「${k}」`).join(' 또는 ')} 포함`,
      `동작: 알림 본문(%notification_text) → 클립보드`,
      `동작: 카카오톡 → 검색 「${config.openChatRoomName || '(오픈채팅방 이름)'}」 → 채팅 입력란 붙여넣기·전송`,
    ],
  };
}

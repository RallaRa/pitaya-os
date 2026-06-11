import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { MessengerCardData, MessengerMessageType } from '@/lib/messenger/types';
import { cardPreviewText } from '@/lib/messenger/types';

export const MESSENGER_CHANNEL_SCHEDULE = 'schedule';
export const MESSENGER_CHANNEL_TASKS = 'tasks';
export const MESSENGER_CHANNEL_SALES_ALERT = 'sales_alert';
export const MESSENGER_CHANNEL_NIGHT_MONITOR = 'night_monitor';

export async function getStoreMemberUids(storeId: string): Promise<string[]> {
  const snap = await adminDb.collection('user_store_map')
    .where('storeId', '==', storeId)
    .where('status', '==', 'active')
    .get();
  const uids = snap.docs.map(d => String(d.data().uid || '')).filter(Boolean);
  return [...new Set(uids)];
}

async function ensureSystemChannel(
  storeId: string,
  channelType: string,
  name: string,
): Promise<string> {
  const members = await getStoreMemberUids(storeId);
  if (members.length === 0) throw new Error('매장 멤버가 없습니다');

  const snap = await adminDb.collection('chat_rooms')
    .where('storeId', '==', storeId)
    .where('channelType', '==', channelType)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (!snap.empty) {
    await snap.docs[0].ref.update({ members, updatedAt: FieldValue.serverTimestamp() });
    return snap.docs[0].id;
  }

  const ref = await adminDb.collection('chat_rooms').add({
    type: 'group',
    channelType,
    name,
    members,
    storeId,
    status: 'active',
    readRequired: false,
    lastMessage: '',
    lastMessageAt: FieldValue.serverTimestamp(),
    unreadCount: Object.fromEntries(members.map(uid => [uid, 0])),
    createdBy: 'system',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/** 직원일정 시스템 채널 확보 */
export async function ensureScheduleChannel(storeId: string): Promise<string> {
  return ensureSystemChannel(storeId, MESSENGER_CHANNEL_SCHEDULE, '👥 직원일정');
}

/** 업무 태스크 알림 채널 */
export async function ensureTasksChannel(storeId: string): Promise<string> {
  return ensureSystemChannel(storeId, MESSENGER_CHANNEL_TASKS, '📋 업무태스크');
}

/** POS 실시간 매출·마감 알림 채널 */
export async function ensureSalesAlertChannel(storeId: string): Promise<string> {
  return ensureSystemChannel(storeId, MESSENGER_CHANNEL_SALES_ALERT, '💰 매출알림');
}

/** POS 야간 이상·할인 남용 모니터링 채널 */
export async function ensureNightMonitorChannel(storeId: string): Promise<string> {
  return ensureSystemChannel(storeId, MESSENGER_CHANNEL_NIGHT_MONITOR, '🌙 야간모니터링');
}

export async function postMessengerCard(params: {
  roomId: string;
  type: MessengerMessageType;
  cardData: MessengerCardData;
  text?: string;
  calendarKey?: string;
  actions?: { id: string; label: string; style?: string }[];
}) {
  const preview = params.text || cardPreviewText(params.type, params.cardData);
  const msgRef = await adminDb.collection('chat_messages').add({
    roomId: params.roomId,
    senderUid: 'pitaya-bot',
    senderName: 'Pitaya',
    text: preview,
    type: params.type,
    cardData: params.cardData,
    actions: params.actions || [{ id: 'detail', label: '상세보기', style: 'ghost' }],
    actionState: {},
    calendarKey: params.calendarKey || null,
    createdAt: FieldValue.serverTimestamp(),
    readBy: [],
  });

  const roomDoc = await adminDb.collection('chat_rooms').doc(params.roomId).get();
  const members: string[] = roomDoc.data()?.members || [];
  const roomUpdate: Record<string, unknown> = {
    lastMessage: preview.slice(0, 50),
    lastMessageAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  members.forEach(uid => {
    roomUpdate[`unreadCount.${uid}`] = FieldValue.increment(1);
  });
  await adminDb.collection('chat_rooms').doc(params.roomId).update(roomUpdate);

  return msgRef.id;
}

/** 텍스트 메시지 — 매출알림 등 시스템 채널용 */
export async function postMessengerText(params: {
  roomId: string;
  text: string;
  senderName?: string;
}) {
  const preview = params.text.slice(0, 80);
  const msgRef = await adminDb.collection('chat_messages').add({
    roomId: params.roomId,
    senderUid: 'pitaya-bot',
    senderName: params.senderName || 'Pitaya',
    text: params.text,
    type: 'text',
    createdAt: FieldValue.serverTimestamp(),
    readBy: [],
  });

  const roomDoc = await adminDb.collection('chat_rooms').doc(params.roomId).get();
  const members: string[] = roomDoc.data()?.members || [];
  const roomUpdate: Record<string, unknown> = {
    lastMessage: preview,
    lastMessageAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  members.forEach(uid => {
    roomUpdate[`unreadCount.${uid}`] = FieldValue.increment(1);
  });
  await adminDb.collection('chat_rooms').doc(params.roomId).update(roomUpdate);

  return msgRef.id;
}

export async function wasCalendarNotificationSent(storeId: string, dedupeKey: string): Promise<boolean> {
  const id = `${storeId}_${dedupeKey}`.replace(/[/\\#?]/g, '_').slice(0, 500);
  const snap = await adminDb.collection('messenger_calendar_sent').doc(id).get();
  return snap.exists;
}

export async function markCalendarNotificationSent(storeId: string, dedupeKey: string) {
  const id = `${storeId}_${dedupeKey}`.replace(/[/\\#?]/g, '_').slice(0, 500);
  await adminDb.collection('messenger_calendar_sent').doc(id).set({
    storeId,
    dedupeKey,
    sentAt: FieldValue.serverTimestamp(),
  });
}

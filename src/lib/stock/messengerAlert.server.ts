import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  postMessengerText,
  getStoreMemberUids,
} from '@/lib/messenger/channels.server';
import { MESSENGER_STOCK_ALERT_CHANNEL } from '@/lib/stock/constants';

export async function ensureStockAlertChannel(storeId: string): Promise<string> {
  const members = await getStoreMemberUids(storeId);
  if (members.length === 0) throw new Error('매장 멤버 없음');

  const snap = await adminDb.collection('chat_rooms')
    .where('storeId', '==', storeId)
    .where('channelType', '==', MESSENGER_STOCK_ALERT_CHANNEL)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (!snap.empty) {
    await snap.docs[0].ref.update({ members, updatedAt: FieldValue.serverTimestamp() });
    return snap.docs[0].id;
  }

  const ref = await adminDb.collection('chat_rooms').add({
    type: 'group',
    channelType: MESSENGER_STOCK_ALERT_CHANNEL,
    name: '#주식알림',
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

export async function postStockAlertText(params: { roomId: string; text: string }) {
  return postMessengerText({
    roomId: params.roomId,
    text: params.text,
    senderName: '주식알림',
  });
}

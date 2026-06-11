import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { MessengerCardActionId, MessengerMessageType } from '@/lib/messenger/types';
import { cardPreviewText } from '@/lib/messenger/types';

interface CardActionParams {
  messageId: string;
  roomId: string;
  actionId: MessengerCardActionId;
  uid: string;
  senderName: string;
  rejectReason?: string;
}

function followUpText(
  type: MessengerMessageType,
  actionId: MessengerCardActionId,
  actorName: string,
  rejectReason?: string,
): string {
  if (actionId === 'approve') {
    if (type === 'order_request') return `✅ ${actorName}님이 발주를 승인했습니다.`;
    return `✅ ${actorName}님이 승인했습니다.`;
  }
  if (actionId === 'reject') {
    const reason = rejectReason ? ` (사유: ${rejectReason})` : '';
    return `❌ ${actorName}님이 거절했습니다${reason}.`;
  }
  if (actionId === 'dismiss') return `🔕 ${actorName}님이 알림을 무시했습니다.`;
  if (actionId === 'detail') return `ℹ️ ${actorName}님이 상세보기를 확인했습니다.`;
  return `${actorName}님이 '${actionId}' 처리했습니다.`;
}

export async function handleMessengerCardAction(params: CardActionParams) {
  const { messageId, roomId, actionId, uid, senderName, rejectReason } = params;
  const msgRef = adminDb.collection('chat_messages').doc(messageId);
  const msgDoc = await msgRef.get();
  if (!msgDoc.exists) throw new Error('메시지를 찾을 수 없습니다');

  const data = msgDoc.data()!;
  if (String(data.roomId) !== roomId) throw new Error('잘못된 roomId');

  const msgType = (data.type || 'text') as MessengerMessageType;
  const existing = data.actionState?.[actionId];
  if (existing?.status === 'done') {
    return { alreadyHandled: true };
  }

  await msgRef.update({
    [`actionState.${actionId}`]: {
      by: uid,
      byName: senderName,
      at: new Date().toISOString(),
      status: 'done',
      ...(rejectReason ? { note: rejectReason } : {}),
    },
    updatedAt: FieldValue.serverTimestamp(),
  });

  const followUp = followUpText(msgType, actionId, senderName, rejectReason);
  await adminDb.collection('chat_messages').add({
    roomId,
    senderUid: 'system',
    senderName: 'Pitaya',
    text: followUp,
    type: 'text',
    createdAt: FieldValue.serverTimestamp(),
    readBy: [uid],
    relatedMessageId: messageId,
  });

  await adminDb.collection('chat_rooms').doc(roomId).update({
    lastMessage: followUp.slice(0, 50),
    lastMessageAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { success: true, followUp };
}

export function buildCardMessagePayload(input: {
  roomId: string;
  senderUid: string;
  senderName: string;
  type: MessengerMessageType;
  cardData: Record<string, unknown>;
  actions?: Record<string, unknown>[];
  text?: string;
}) {
  const cardData = input.cardData as { title?: string };
  const preview = input.text?.trim()
    || cardPreviewText(input.type, cardData as { title?: string });

  return {
    roomId: input.roomId,
    senderUid: input.senderUid,
    senderName: input.senderName,
    text: preview,
    type: input.type,
    cardData: input.cardData,
    actions: input.actions || [],
    actionState: {},
    createdAt: FieldValue.serverTimestamp(),
    readBy: [input.senderUid],
  };
}

export function cardLastMessagePreview(type: MessengerMessageType, cardData?: { title?: string }) {
  return cardPreviewText(type, cardData as { title?: string }).slice(0, 50);
}

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import {
  buildCardMessagePayload,
  cardLastMessagePreview,
  handleMessengerCardAction,
} from '@/lib/messenger/cardActions.server';
import { isCardMessageType } from '@/lib/messenger/types';

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { roomId, senderUid, text, senderName, replyTo,
            fileUrl, fileName, fileType, type, cardData, actions } = body;

    const msgType = type || 'text';
    const isCard = isCardMessageType(msgType);

    if (!roomId || !senderUid || (!text && !isCard)) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
    }

    const msgData: Record<string, unknown> = isCard
      ? buildCardMessagePayload({
          roomId,
          senderUid,
          senderName: senderName || '',
          type: msgType,
          cardData: cardData || {},
          actions: actions || [],
          text,
        })
      : {
          roomId,
          senderUid,
          senderName: senderName || '',
          text,
          type: 'text',
          createdAt: FieldValue.serverTimestamp(),
          readBy: [senderUid],
        };

    if (replyTo) msgData.replyTo = replyTo;
    if (fileUrl) {
      msgData.fileUrl = fileUrl;
      msgData.fileName = fileName || '';
      msgData.fileType = fileType || '';
    }

    await adminDb.collection('chat_messages').add(msgData);

    const roomDoc = await adminDb.collection('chat_rooms').doc(roomId).get();
    const members: string[] = roomDoc.data()?.members || [];
    const currentUnreadCounts: Record<string, number> = roomDoc.data()?.unreadCount || {};

    const lastMessage = fileUrl
      ? (fileType?.startsWith('image/') ? '📷 이미지' : `📎 ${(fileName || '파일').slice(0, 40)}`)
      : isCard
        ? cardLastMessagePreview(msgType, cardData)
        : String(text).slice(0, 50);

    const roomUpdate: Record<string, any> = {
      lastMessage,
      lastMessageAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    members.forEach((uid: string) => {
      if (uid !== senderUid) {
        roomUpdate[`unreadCount.${uid}`] = FieldValue.increment(1);
      }
    });

    await adminDb.collection('chat_rooms').doc(roomId).update(roomUpdate);

    // 채팅방 밖에 있는 수신자에게만 알림 생성
    const notifyTargets = members.filter(
      (uid: string) => uid !== senderUid && currentUnreadCounts[uid] !== 0
    );
    if (notifyTargets.length > 0) {
      await Promise.all(
        notifyTargets.map((uid: string) =>
          adminDb.collection('notifications').add({
            targetUid: uid,
            senderUid,
            senderName: senderName || '',
            type: 'message',
            message: `${senderName || '메시지'}: ${text.slice(0, 50)}`,
            link: '/dashboard/messenger',
            isRead: false,
            createdAt: FieldValue.serverTimestamp(),
          })
        )
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { action } = body;

    // ── delete: 메시지 소프트 삭제 ──
    if (action === 'delete') {
      const { messageId } = body;
      if (!messageId) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
      await adminDb.collection('chat_messages').doc(messageId).update({
        deletedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ success: true });
    }

    // ── edit: 메시지 수정 ──
    if (action === 'edit') {
      const { messageId, text } = body;
      if (!messageId || !text) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
      const msgRef = adminDb.collection('chat_messages').doc(messageId);
      const msgDoc = await msgRef.get();
      const currentData = msgDoc.data();
      const originalText = currentData?.originalText || currentData?.text || '';
      await msgRef.update({
        originalText,
        text,
        editedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ success: true });
    }

    // ── readAll: 방 전체 메시지 읽음 처리 ──
    if (action === 'readAll') {
      const { roomId, uid } = body;
      if (!roomId || !uid) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });

      const msgsSnap = await adminDb.collection('chat_messages')
        .where('roomId', '==', roomId)
        .get();

      const unreadDocs = msgsSnap.docs.filter(d => {
        const readBy: string[] = d.data().readBy || [];
        return !readBy.includes(uid);
      });

      if (unreadDocs.length > 0) {
        const batch = adminDb.batch();
        unreadDocs.forEach(d => batch.update(d.ref, { readBy: FieldValue.arrayUnion(uid) }));
        await batch.commit();
      }

      await adminDb.collection('chat_rooms').doc(roomId).update({
        [`unreadCount.${uid}`]: 0,
      });

      return NextResponse.json({ success: true, updated: unreadDocs.length });
    }

    // ── react: 이모지 반응 토글 ──
    if (action === 'react') {
      const { messageId, emoji, uid } = body;
      if (!messageId || !emoji || !uid) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });

      const msgRef = adminDb.collection('chat_messages').doc(messageId);
      const msgDoc = await msgRef.get();
      const reactions: Record<string, string[]> = msgDoc.data()?.reactions || {};
      const currentReactors: string[] = reactions[emoji] || [];

      if (currentReactors.includes(uid)) {
        await msgRef.update({ [`reactions.${emoji}`]: FieldValue.arrayRemove(uid) });
      } else {
        await msgRef.update({ [`reactions.${emoji}`]: FieldValue.arrayUnion(uid) });
      }

      return NextResponse.json({ success: true });
    }

    // ── cardAction: 카드 버튼 처리 ──
    if (action === 'cardAction') {
      const { messageId, roomId, actionId, uid, senderName, rejectReason } = body;
      if (!messageId || !roomId || !actionId || !uid) {
        return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
      }
      const result = await handleMessengerCardAction({
        messageId,
        roomId,
        actionId,
        uid,
        senderName: senderName || '',
        rejectReason,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

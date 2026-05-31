import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { sendKakaoNotifySafe } from '@/lib/kakao/sendNotify';

const APP_BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app';

interface NotifyOptions {
  title: string;
  message: string;
  link: string;
  type?: string;
}

export async function notifyUser(targetUid: string, opts: NotifyOptions) {
  if (!targetUid) return;

  await adminDb.collection('notifications').add({
    targetUid,
    senderUid: '',
    senderName: 'Pitaya OS',
    type: opts.type || 'system',
    title: opts.title,
    message: opts.message,
    link: opts.link,
    isRead: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  await sendKakaoNotifySafe({
    userId: targetUid,
    title: opts.title,
    message: opts.message,
    link: opts.link.startsWith('http') ? opts.link : `${APP_BASE}${opts.link}`,
  });
}

export async function getKakaoLinkedActiveUserIds(): Promise<string[]> {
  const mapSnap = await adminDb.collection('user_store_map')
    .where('status', '==', 'active')
    .get();

  const uids = [...new Set(mapSnap.docs.map(d => d.data().uid as string).filter(Boolean))];
  const linked: string[] = [];

  await Promise.all(uids.map(async (uid) => {
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (userDoc.exists && userDoc.data()?.kakaoAccessToken) {
      linked.push(uid);
    }
  }));

  return linked;
}

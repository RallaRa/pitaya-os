import { adminDb } from '@/lib/firebase/admin';
import { getActualGroupId } from '@/lib/authVerify';
import { isPlatformSuperuser } from '@/lib/superuserCheck';
import {
  DEFAULT_SYSTEM_GROUP_MENUS,
  mergeMenuAccess,
  type MenuAccessKey,
} from '@/lib/menuAccessKeys';
import { formatPublicOrderNotifyMessage } from '@/lib/publicOrders';
import { notifyUser } from '@/lib/notifications/notifyUser';
import { sendPublicOrderKakaoMemo } from '@/lib/publicOrderKakaoHook';

export async function getStoreUserIdsWithMenuAccess(
  storeId: string,
  menuKey: MenuAccessKey = 'store',
): Promise<string[]> {
  const mapSnap = await adminDb.collection('user_store_map')
    .where('storeId', '==', storeId)
    .where('status', '==', 'active')
    .get();

  const uids: string[] = [];

  for (const doc of mapSnap.docs) {
    const uid = doc.data().uid as string;
    if (!uid) continue;

    const userDoc = await adminDb.collection('users').doc(uid).get();
    const email = userDoc.data()?.email as string | undefined;

    if (await isPlatformSuperuser(uid, email)) {
      uids.push(uid);
      continue;
    }

    const groupId = await getActualGroupId(uid, storeId, email);
    const groupDoc = await adminDb.collection('permission_groups').doc(groupId).get();
    const stored = groupDoc.exists ? groupDoc.data()?.menuAccess : null;
    const fallback = DEFAULT_SYSTEM_GROUP_MENUS[groupId as keyof typeof DEFAULT_SYSTEM_GROUP_MENUS];
    const menuAccess = mergeMenuAccess(stored, fallback || {});

    if (menuAccess[menuKey]) uids.push(uid);
  }

  return [...new Set(uids)];
}

export async function notifyPublicOrderReceived(opts: {
  storeId: string;
  sessionId: string;
  sessionTitle: string;
  ordererName: string;
  ordererPhoneMasked?: string;
  totalAmount: number;
  lines?: { name: string; qty: number; unit?: string; unitPrice?: number }[];
  note?: string;
}) {
  const {
    storeId, sessionId, sessionTitle, ordererName, ordererPhoneMasked,
    totalAmount, lines, note,
  } = opts;
  const userIds = await getStoreUserIdsWithMenuAccess(storeId, 'store');
  const link = `/dashboard/public-orders?session=${sessionId}`;
  const title = '🛒 새 공개 주문';
  const message = formatPublicOrderNotifyMessage({
    ordererName,
    ordererPhoneMasked,
    lines: lines || [],
  });

  await Promise.all(
    userIds.map(uid =>
      notifyUser(uid, {
        title,
        message,
        link,
        type: 'public_order',
        storeId,
      }).catch(() => {}),
    ),
  );

  void sendPublicOrderKakaoMemo({
    storeId,
    sessionTitle,
    ordererName,
    ordererPhoneMasked,
    totalAmount,
    lines,
    note,
    link,
  });
}

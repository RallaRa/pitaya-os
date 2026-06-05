import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken, isActiveStoreMember, canManageStore } from '@/lib/authVerify';
import {
  SIGNAGE_CONTENT_TYPES,
  SIGNAGE_SCREEN_KINDS,
  type SignageContentType,
  type SignageScreenKind,
} from '@/lib/signage/types';
import { normalizeStoragePublicUrl } from '@/lib/firebase/storageBucket';

const VALID_TYPES = new Set(SIGNAGE_CONTENT_TYPES.map(t => t.id));
const VALID_KINDS = new Set(SIGNAGE_SCREEN_KINDS.map(k => k.id));

async function requireStoreAccess(uid: string, storeId: string, email?: string) {
  if (!storeId) return NextResponse.json({ error: 'storeId 필요' }, { status: 400 });
  const member = await isActiveStoreMember(uid, storeId);
  if (!member && !await canManageStore(uid, storeId, email)) {
    return NextResponse.json({ error: '매장 접근 권한 없음' }, { status: 403 });
  }
  return null;
}

async function syncPlaylist(storeId: string) {
  const snap = await adminDb.collection('signage_content')
    .where('storeId', '==', storeId)
    .where('status', '==', 'approved')
    .get();

  const approved = snap.docs
    .map(d => ({ id: d.id, order: (d.data().order as number) ?? 0 }))
    .sort((a, b) => a.order - b.order);

  await adminDb.collection('signage_playlist').doc(storeId).set({
    storeId,
    approvedIds: approved.map(a => a.id),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return approved.map(a => a.id);
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId 필요' }, { status: 400 });

  const denied = await requireStoreAccess(authUser.uid, storeId, authUser.email);
  if (denied) return denied;

  const [settingsSnap, contentsSnap, screensSnap] = await Promise.all([
    adminDb.collection('signage_settings').doc(storeId).get(),
    adminDb.collection('signage_content').where('storeId', '==', storeId).get(),
    adminDb.collection('signage_screens').where('storeId', '==', storeId).get(),
  ]);

  const settings = settingsSnap.exists
    ? settingsSnap.data()
    : { storeId, defaultContentType: 'text' };

  const contents = contentsSnap.docs
    .map(d => {
      const row = { id: d.id, ...d.data() } as Record<string, unknown> & { id: string };
      if (typeof row.url === 'string') row.url = normalizeStoragePublicUrl(row.url);
      if (typeof row.thumbnailUrl === 'string') {
        row.thumbnailUrl = normalizeStoragePublicUrl(row.thumbnailUrl);
      }
      return row;
    })
    .sort((a, b) => {
      const aSec = (a.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;
      const bSec = (b.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;
      return bSec - aSec;
    });

  const screens = screensSnap.docs
    .map(d => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string }))
    .sort((a, b) => {
      const aSec = (a.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;
      const bSec = (b.createdAt as { seconds?: number } | undefined)?.seconds ?? 0;
      return aSec - bSec;
    });

  return NextResponse.json({ settings, contents, screens });
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { action, storeId } = body;
    const denied = await requireStoreAccess(authUser.uid, storeId, authUser.email);
    if (denied) return denied;

    if (action === 'saveSettings') {
      const type = body.defaultContentType as SignageContentType;
      if (!VALID_TYPES.has(type)) {
        return NextResponse.json({ error: '유효하지 않은 콘텐츠 타입' }, { status: 400 });
      }
      await adminDb.collection('signage_settings').doc(storeId).set({
        storeId,
        defaultContentType: type,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return NextResponse.json({ success: true, defaultContentType: type });
    }

    if (action === 'createContent') {
      const {
        type, title, url, thumbnailUrl, duration, aiPrompt, bgColor, textColor,
      } = body;
      if (!VALID_TYPES.has(type)) {
        return NextResponse.json({ error: '유효하지 않은 콘텐츠 타입' }, { status: 400 });
      }
      if (!title?.trim()) {
        return NextResponse.json({ error: '제목 필요' }, { status: 400 });
      }

      const countSnap = await adminDb.collection('signage_content')
        .where('storeId', '==', storeId).get();

      const ref = await adminDb.collection('signage_content').add({
        storeId,
        type,
        title: title.trim(),
        url: url || '',
        thumbnailUrl: thumbnailUrl || '',
        duration: Number(duration) || 10,
        order: countSnap.size,
        status: 'pending',
        aiPrompt: aiPrompt || '',
        bgColor: bgColor || '#1a1a2e',
        textColor: textColor || '#ffffff',
        createdAt: FieldValue.serverTimestamp(),
        createdBy: authUser.uid,
      });

      return NextResponse.json({ success: true, id: ref.id });
    }

    if (action === 'createScreen') {
      const name = String(body.name || '').trim();
      const screenKind = (body.screenKind || 'other') as SignageScreenKind;
      if (!name) return NextResponse.json({ error: '화면 이름 필요' }, { status: 400 });
      if (!VALID_KINDS.has(screenKind)) {
        return NextResponse.json({ error: '유효하지 않은 화면 종류' }, { status: 400 });
      }

      const approvedIds = await syncPlaylist(storeId);
      const slug = `signage-${Date.now().toString(36)}`;

      const ref = await adminDb.collection('signage_screens').add({
        storeId,
        name,
        slug,
        screenKind,
        contentIds: approvedIds,
        isActive: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true, id: ref.id, slug });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'signage failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { action, storeId, contentId, screenId } = body;
    const denied = await requireStoreAccess(authUser.uid, storeId, authUser.email);
    if (denied) return denied;

    if (action === 'approveContent' && contentId) {
      await adminDb.collection('signage_content').doc(contentId).update({
        status: 'approved',
        approvedAt: FieldValue.serverTimestamp(),
      });
      await syncPlaylist(storeId);
      return NextResponse.json({ success: true });
    }

    if (action === 'rejectContent' && contentId) {
      await adminDb.collection('signage_content').doc(contentId).update({
        status: 'rejected',
        rejectedAt: FieldValue.serverTimestamp(),
      });
      await syncPlaylist(storeId);
      return NextResponse.json({ success: true });
    }

    if (action === 'unapproveContent' && contentId) {
      await adminDb.collection('signage_content').doc(contentId).update({
        status: 'pending',
      });
      await syncPlaylist(storeId);
      return NextResponse.json({ success: true });
    }

    if (action === 'reorderApproved') {
      const orderedIds = body.orderedIds as string[];
      if (!Array.isArray(orderedIds)) {
        return NextResponse.json({ error: 'orderedIds 필요' }, { status: 400 });
      }
      const batch = adminDb.batch();
      orderedIds.forEach((id, idx) => {
        batch.update(adminDb.collection('signage_content').doc(id), { order: idx });
      });
      await batch.commit();
      await adminDb.collection('signage_playlist').doc(storeId).set({
        storeId,
        approvedIds: orderedIds,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return NextResponse.json({ success: true });
    }

    if (action === 'updateScreen' && screenId) {
      const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      if (body.name !== undefined) patch.name = String(body.name).trim();
      if (body.screenKind !== undefined) {
        if (!VALID_KINDS.has(body.screenKind)) {
          return NextResponse.json({ error: '유효하지 않은 화면 종류' }, { status: 400 });
        }
        patch.screenKind = body.screenKind;
      }
      if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);
      if (body.contentIds !== undefined) patch.contentIds = body.contentIds;

      await adminDb.collection('signage_screens').doc(screenId).update(patch);
      return NextResponse.json({ success: true });
    }

    if (action === 'refreshScreenPlaylist' && screenId) {
      const approvedIds = await syncPlaylist(storeId);
      await adminDb.collection('signage_screens').doc(screenId).update({
        contentIds: approvedIds,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ success: true, contentIds: approvedIds });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'signage failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId');
  const contentId = searchParams.get('contentId');
  const screenId = searchParams.get('screenId');
  if (!storeId) return NextResponse.json({ error: 'storeId 필요' }, { status: 400 });

  const denied = await requireStoreAccess(authUser.uid, storeId, authUser.email);
  if (denied) return denied;

  if (contentId) {
    await adminDb.collection('signage_content').doc(contentId).delete();
    await syncPlaylist(storeId);
    return NextResponse.json({ success: true });
  }

  if (screenId) {
    await adminDb.collection('signage_screens').doc(screenId).delete();
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'contentId 또는 screenId 필요' }, { status: 400 });
}

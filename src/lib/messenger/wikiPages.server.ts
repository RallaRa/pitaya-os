import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import type { WikiPage, WikiPageInput, WikiPageVersion } from '@/lib/messenger/wikiTypes';
import { WIKI_PAGE_CATEGORIES } from '@/lib/messenger/wikiTypes';

const COL = 'wiki_pages';

function tsToIso(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === 'object' && v !== null && 'toDate' in v) {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return String(v);
}

function pageFromSnap(id: string, data: DocumentData): WikiPage {
  return {
    id,
    storeId: String(data.storeId || ''),
    title: String(data.title || ''),
    content: String(data.content || ''),
    category: String(data.category || '운영매뉴얼'),
    createdBy: String(data.createdBy || ''),
    createdByName: data.createdByName ? String(data.createdByName) : undefined,
    updatedBy: data.updatedBy ? String(data.updatedBy) : undefined,
    updatedByName: data.updatedByName ? String(data.updatedByName) : undefined,
    roomId: data.roomId ? String(data.roomId) : undefined,
    version: Number(data.version || 1),
    updatedAt: tsToIso(data.updatedAt),
    createdAt: tsToIso(data.createdAt),
  };
}

function versionFromSnap(id: string, data: DocumentData): WikiPageVersion {
  return {
    id,
    version: Number(data.version || 0),
    title: String(data.title || ''),
    content: String(data.content || ''),
    category: String(data.category || ''),
    updatedBy: String(data.updatedBy || ''),
    updatedByName: data.updatedByName ? String(data.updatedByName) : undefined,
    updatedAt: tsToIso(data.updatedAt),
  };
}

function normalizeCategory(category: string): string {
  return WIKI_PAGE_CATEGORIES.includes(category as typeof WIKI_PAGE_CATEGORIES[number])
    ? category
    : '운영매뉴얼';
}

export async function listWikiPages(
  storeId: string,
  opts: { q?: string; category?: string; roomId?: string } = {},
): Promise<WikiPage[]> {
  const snap = await adminDb.collection(COL).where('storeId', '==', storeId).get();
  let pages = snap.docs.map(d => pageFromSnap(d.id, d.data()));

  if (opts.category) {
    pages = pages.filter(p => p.category === opts.category);
  }
  if (opts.roomId) {
    pages = pages.filter(p => !p.roomId || p.roomId === opts.roomId);
  }
  if (opts.q?.trim()) {
    const q = opts.q.trim().toLowerCase();
    pages = pages.filter(p =>
      p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q),
    );
  }

  return pages.sort((a, b) =>
    (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.title.localeCompare(b.title, 'ko'),
  );
}

export async function getWikiPage(storeId: string, pageId: string): Promise<WikiPage | null> {
  const snap = await adminDb.collection(COL).doc(pageId).get();
  if (!snap.exists) return null;
  const page = pageFromSnap(snap.id, snap.data()!);
  if (page.storeId !== storeId) return null;
  return page;
}

export async function createWikiPage(
  storeId: string,
  input: WikiPageInput,
  actor: { uid: string; name: string },
): Promise<WikiPage> {
  const ref = adminDb.collection(COL).doc();
  const payload = {
    storeId,
    title: input.title.trim(),
    content: input.content,
    category: normalizeCategory(input.category),
    roomId: input.roomId || null,
    createdBy: actor.uid,
    createdByName: actor.name,
    updatedBy: actor.uid,
    updatedByName: actor.name,
    version: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(payload);
  const created = await ref.get();
  return pageFromSnap(created.id, created.data()!);
}

async function saveVersionSnapshot(
  pageId: string,
  page: WikiPage,
  actor: { uid: string; name: string },
) {
  await adminDb.collection(COL).doc(pageId).collection('versions').doc(String(page.version)).set({
    version: page.version,
    title: page.title,
    content: page.content,
    category: page.category,
    updatedBy: actor.uid,
    updatedByName: actor.name,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function updateWikiPage(
  storeId: string,
  pageId: string,
  input: WikiPageInput,
  actor: { uid: string; name: string },
): Promise<WikiPage> {
  const existing = await getWikiPage(storeId, pageId);
  if (!existing) throw new Error('문서를 찾을 수 없습니다');

  await saveVersionSnapshot(pageId, existing, actor);
  const nextVersion = existing.version + 1;

  await adminDb.collection(COL).doc(pageId).update({
    title: input.title.trim(),
    content: input.content,
    category: normalizeCategory(input.category),
    roomId: input.roomId || null,
    updatedBy: actor.uid,
    updatedByName: actor.name,
    version: nextVersion,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const updated = await adminDb.collection(COL).doc(pageId).get();
  return pageFromSnap(updated.id, updated.data()!);
}

export async function deleteWikiPage(storeId: string, pageId: string): Promise<void> {
  const existing = await getWikiPage(storeId, pageId);
  if (!existing) throw new Error('문서를 찾을 수 없습니다');

  const versionsSnap = await adminDb.collection(COL).doc(pageId).collection('versions').get();
  const batch = adminDb.batch();
  versionsSnap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(adminDb.collection(COL).doc(pageId));
  await batch.commit();
}

export async function listWikiPageVersions(
  storeId: string,
  pageId: string,
): Promise<WikiPageVersion[]> {
  const page = await getWikiPage(storeId, pageId);
  if (!page) throw new Error('문서를 찾을 수 없습니다');

  const snap = await adminDb.collection(COL).doc(pageId).collection('versions')
    .orderBy('version', 'desc')
    .get();

  return snap.docs.map(d => versionFromSnap(d.id, d.data()));
}

export async function restoreWikiPageVersion(
  storeId: string,
  pageId: string,
  versionNum: number,
  actor: { uid: string; name: string },
): Promise<WikiPage> {
  const verSnap = await adminDb.collection(COL).doc(pageId).collection('versions')
    .doc(String(versionNum))
    .get();
  if (!verSnap.exists) throw new Error('버전을 찾을 수 없습니다');
  const ver = versionFromSnap(verSnap.id, verSnap.data()!);

  return updateWikiPage(
    storeId,
    pageId,
    { title: ver.title, content: ver.content, category: ver.category },
    actor,
  );
}

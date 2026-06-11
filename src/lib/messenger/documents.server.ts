import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import {
  DOCUMENT_TYPE_TEMPLATES,
  DOCUMENT_TYPES,
  type DocumentInput,
  type DocumentPresence,
  type DocumentVersion,
  type MessengerDocument,
} from '@/lib/messenger/documentTypes';

const COL = 'documents';

function tsToIso(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === 'object' && v !== null && 'toDate' in v) {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return String(v);
}

function docFromSnap(id: string, data: DocumentData): MessengerDocument {
  return {
    id,
    storeId: String(data.storeId || ''),
    title: String(data.title || ''),
    type: String(data.type || '자유양식'),
    content: String(data.content || ''),
    collaborators: Array.isArray(data.collaborators) ? data.collaborators.map(String) : [],
    roomId: data.roomId ? String(data.roomId) : undefined,
    isTemplate: !!data.isTemplate,
    createdBy: String(data.createdBy || ''),
    createdByName: data.createdByName ? String(data.createdByName) : undefined,
    updatedBy: data.updatedBy ? String(data.updatedBy) : undefined,
    updatedByName: data.updatedByName ? String(data.updatedByName) : undefined,
    version: Number(data.version || 1),
    updatedAt: tsToIso(data.updatedAt),
    createdAt: tsToIso(data.createdAt),
  };
}

function versionFromSnap(id: string, data: DocumentData): DocumentVersion {
  return {
    id,
    version: Number(data.version || 0),
    title: String(data.title || ''),
    content: String(data.content || ''),
    type: String(data.type || ''),
    updatedBy: String(data.updatedBy || ''),
    updatedByName: data.updatedByName ? String(data.updatedByName) : undefined,
    updatedAt: tsToIso(data.updatedAt),
  };
}

function normalizeType(type: string): string {
  return DOCUMENT_TYPES.includes(type as typeof DOCUMENT_TYPES[number]) ? type : '자유양식';
}

function defaultContent(type: string): string {
  const key = normalizeType(type) as keyof typeof DOCUMENT_TYPE_TEMPLATES;
  return DOCUMENT_TYPE_TEMPLATES[key] || DOCUMENT_TYPE_TEMPLATES['자유양식'];
}

export async function listMessengerDocuments(
  storeId: string,
  opts: { q?: string; type?: string; roomId?: string; templatesOnly?: boolean } = {},
): Promise<MessengerDocument[]> {
  const snap = await adminDb.collection(COL).where('storeId', '==', storeId).get();
  let docs = snap.docs.map(d => docFromSnap(d.id, d.data()));

  if (opts.templatesOnly) {
    docs = docs.filter(d => d.isTemplate);
  } else {
    docs = docs.filter(d => !d.isTemplate);
  }
  if (opts.type) docs = docs.filter(d => d.type === opts.type);
  if (opts.roomId) docs = docs.filter(d => !d.roomId || d.roomId === opts.roomId);
  if (opts.q?.trim()) {
    const q = opts.q.trim().toLowerCase();
    docs = docs.filter(d =>
      d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q),
    );
  }

  return docs.sort((a, b) =>
    (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.title.localeCompare(b.title, 'ko'),
  );
}

export async function getMessengerDocument(
  storeId: string,
  docId: string,
): Promise<MessengerDocument | null> {
  const snap = await adminDb.collection(COL).doc(docId).get();
  if (!snap.exists) return null;
  const doc = docFromSnap(snap.id, snap.data()!);
  if (doc.storeId !== storeId) return null;
  return doc;
}

async function saveVersionSnapshot(
  docId: string,
  doc: MessengerDocument,
  actor: { uid: string; name: string },
) {
  await adminDb.collection(COL).doc(docId).collection('versions').doc(String(doc.version)).set({
    version: doc.version,
    title: doc.title,
    content: doc.content,
    type: doc.type,
    updatedBy: actor.uid,
    updatedByName: actor.name,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function createMessengerDocument(
  storeId: string,
  input: DocumentInput,
  actor: { uid: string; name: string },
): Promise<MessengerDocument> {
  const ref = adminDb.collection(COL).doc();
  const type = normalizeType(input.type);
  const content = input.content ?? defaultContent(type);
  const collaborators = input.collaborators?.length
    ? [...new Set([...input.collaborators, actor.uid])]
    : [actor.uid];

  const payload = {
    storeId,
    title: input.title.trim(),
    type,
    content,
    collaborators,
    roomId: input.roomId || null,
    isTemplate: !!input.isTemplate,
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
  const doc = docFromSnap(created.id, created.data()!);
  if (!doc.isTemplate) {
    await saveVersionSnapshot(ref.id, doc, actor);
  }
  return doc;
}

export async function updateMessengerDocument(
  storeId: string,
  docId: string,
  input: Partial<DocumentInput> & { content?: string },
  actor: { uid: string; name: string },
): Promise<MessengerDocument> {
  const existing = await getMessengerDocument(storeId, docId);
  if (!existing) throw new Error('문서를 찾을 수 없습니다');

  const nextVersion = existing.content !== input.content ? existing.version + 1 : existing.version;
  const collaborators = input.collaborators
    ? [...new Set([...input.collaborators, actor.uid])]
    : [...new Set([...existing.collaborators, actor.uid])];

  const updates: Record<string, unknown> = {
    updatedBy: actor.uid,
    updatedByName: actor.name,
    updatedAt: FieldValue.serverTimestamp(),
    collaborators,
  };
  if (input.title !== undefined) updates.title = input.title.trim();
  if (input.type !== undefined) updates.type = normalizeType(input.type);
  if (input.content !== undefined) {
    updates.content = input.content;
    updates.version = nextVersion;
  }
  if (input.roomId !== undefined) updates.roomId = input.roomId || null;
  if (input.isTemplate !== undefined) updates.isTemplate = !!input.isTemplate;

  await adminDb.collection(COL).doc(docId).update(updates);
  const updated = await getMessengerDocument(storeId, docId);
  if (!updated) throw new Error('업데이트 실패');

  if (input.content !== undefined && !updated.isTemplate && nextVersion > existing.version) {
    await saveVersionSnapshot(docId, updated, actor);
  }
  return updated;
}

export async function deleteMessengerDocument(storeId: string, docId: string): Promise<void> {
  const existing = await getMessengerDocument(storeId, docId);
  if (!existing) throw new Error('문서를 찾을 수 없습니다');
  await adminDb.collection(COL).doc(docId).delete();
}

export async function listDocumentVersions(
  storeId: string,
  docId: string,
): Promise<DocumentVersion[]> {
  const doc = await getMessengerDocument(storeId, docId);
  if (!doc) throw new Error('문서를 찾을 수 없습니다');

  const snap = await adminDb.collection(COL).doc(docId).collection('versions')
    .orderBy('version', 'desc')
    .get();
  return snap.docs.map(d => versionFromSnap(d.id, d.data()));
}

export async function appendYjsUpdate(
  storeId: string,
  docId: string,
  params: { update: string; clientId: string; uid: string },
): Promise<void> {
  const doc = await getMessengerDocument(storeId, docId);
  if (!doc) throw new Error('문서를 찾을 수 없습니다');

  await adminDb.collection(COL).doc(docId).collection('yjs_updates').add({
    update: params.update,
    clientId: params.clientId,
    uid: params.uid,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function setDocumentPresence(
  storeId: string,
  docId: string,
  presence: Omit<DocumentPresence, 'updatedAt'>,
): Promise<void> {
  const doc = await getMessengerDocument(storeId, docId);
  if (!doc) throw new Error('문서를 찾을 수 없습니다');

  await adminDb.collection(COL).doc(docId).collection('presence').doc(presence.uid).set({
    name: presence.name,
    color: presence.color,
    cursor: presence.cursor,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function listDocumentPresence(
  storeId: string,
  docId: string,
): Promise<DocumentPresence[]> {
  const doc = await getMessengerDocument(storeId, docId);
  if (!doc) throw new Error('문서를 찾을 수 없습니다');

  const snap = await adminDb.collection(COL).doc(docId).collection('presence').get();
  return snap.docs.map(d => ({
    uid: d.id,
    name: String(d.data().name || ''),
    color: String(d.data().color || '#2dd4bf'),
    cursor: Number(d.data().cursor || 0),
    updatedAt: tsToIso(d.data().updatedAt),
  }));
}

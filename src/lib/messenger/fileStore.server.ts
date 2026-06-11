import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import type { MessengerFileRecord } from '@/lib/messenger/fileStoreTypes';
import { MESSENGER_FILE_FOLDERS } from '@/lib/messenger/fileStoreTypes';

const COL = 'files';

function tsToIso(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === 'object' && v !== null && 'toDate' in v) {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return String(v);
}

function fileFromSnap(id: string, data: DocumentData): MessengerFileRecord {
  return {
    id,
    storeId: String(data.storeId || ''),
    name: String(data.name || ''),
    url: String(data.url || ''),
    type: String(data.type || 'application/octet-stream'),
    size: Number(data.size || 0),
    folderId: String(data.folderId || '기타'),
    uploadedBy: String(data.uploadedBy || ''),
    uploadedByName: data.uploadedByName ? String(data.uploadedByName) : undefined,
    roomId: data.roomId ? String(data.roomId) : undefined,
    messageId: data.messageId ? String(data.messageId) : undefined,
    storagePath: data.storagePath ? String(data.storagePath) : undefined,
    createdAt: tsToIso(data.createdAt),
  };
}

function normalizeFolder(folderId: string): string {
  return MESSENGER_FILE_FOLDERS.includes(folderId as typeof MESSENGER_FILE_FOLDERS[number])
    ? folderId
    : '기타';
}

export async function listMessengerFiles(
  storeId: string,
  opts: { folderId?: string; q?: string; roomId?: string; dateFrom?: string } = {},
): Promise<MessengerFileRecord[]> {
  const snap = await adminDb.collection(COL).where('storeId', '==', storeId).get();
  let files = snap.docs.map(d => fileFromSnap(d.id, d.data()));

  if (opts.folderId) files = files.filter(f => f.folderId === opts.folderId);
  if (opts.roomId) files = files.filter(f => f.roomId === opts.roomId);
  if (opts.q?.trim()) {
    const q = opts.q.trim().toLowerCase();
    files = files.filter(f =>
      f.name.toLowerCase().includes(q)
      || f.type.toLowerCase().includes(q)
      || f.folderId.toLowerCase().includes(q),
    );
  }
  if (opts.dateFrom) {
    files = files.filter(f => (f.createdAt || '') >= opts.dateFrom!);
  }

  return files.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function registerMessengerFile(input: {
  storeId: string;
  name: string;
  url: string;
  type: string;
  size: number;
  folderId?: string;
  roomId?: string;
  messageId?: string;
  storagePath?: string;
  uploadedBy: string;
  uploadedByName?: string;
}): Promise<MessengerFileRecord> {
  const ref = adminDb.collection(COL).doc();
  await ref.set({
    storeId: input.storeId,
    name: input.name,
    url: input.url,
    type: input.type || 'application/octet-stream',
    size: input.size || 0,
    folderId: normalizeFolder(input.folderId || '기타'),
    roomId: input.roomId || null,
    messageId: input.messageId || null,
    storagePath: input.storagePath || null,
    uploadedBy: input.uploadedBy,
    uploadedByName: input.uploadedByName || '',
    source: input.roomId ? 'chat' : 'upload',
    createdAt: FieldValue.serverTimestamp(),
  });
  const snap = await ref.get();
  return fileFromSnap(snap.id, snap.data()!);
}

export async function deleteMessengerFile(storeId: string, fileId: string): Promise<void> {
  const ref = adminDb.collection(COL).doc(fileId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('파일을 찾을 수 없습니다');
  const data = snap.data()!;
  if (String(data.storeId) !== storeId) throw new Error('권한 없음');

  const storagePath = data.storagePath ? String(data.storagePath) : '';
  if (storagePath) {
    try {
      const bucket = adminStorage.bucket();
      await bucket.file(storagePath).delete({ ignoreNotFound: true });
    } catch {
      /* storage delete optional */
    }
  }
  await ref.delete();
}

function inferFolderFromChat(name: string, type: string): string {
  if (type.startsWith('image/')) return '위생점검사진';
  const lower = name.toLowerCase();
  if (lower.includes('명세') || lower.includes('invoice') || lower.includes('거래')) return '거래명세서';
  if (lower.includes('계약') || lower.includes('contract')) return '계약서';
  if (type === 'application/pdf') return '거래명세서';
  return '기타';
}

export async function registerChatSharedFile(input: {
  storeId: string;
  roomId: string;
  name: string;
  url: string;
  type: string;
  size?: number;
  uploadedBy: string;
  uploadedByName?: string;
  storagePath?: string;
}): Promise<MessengerFileRecord | null> {
  const existing = await adminDb.collection(COL)
    .where('storeId', '==', input.storeId)
    .limit(500)
    .get();
  const dup = existing.docs.find(d => String(d.data().url || '') === input.url);
  if (dup) return fileFromSnap(dup.id, dup.data());

  return registerMessengerFile({
    ...input,
    folderId: inferFolderFromChat(input.name, input.type),
    size: input.size || 0,
  });
}

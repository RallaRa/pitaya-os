/** Firebase Storage 버킷 이름 — env 비어 있으면 project_id로 추론 */

/** pitaya-osv1: Firebase Console Storage 미개통 → GCS 버킷 사용 */
export const PROJECT_MEDIA_BUCKET: Record<string, string> = {
  'pitaya-osv1': 'pitaya-osv1-media',
};

export function resolveStorageBucket(projectId?: string | null): string | undefined {
  const fromEnv =
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim()
    || process.env.FIREBASE_STORAGE_BUCKET?.trim();
  if (fromEnv) return fromEnv;
  const pid = projectId?.trim();
  if (!pid) return undefined;
  if (PROJECT_MEDIA_BUCKET[pid]) return PROJECT_MEDIA_BUCKET[pid];
  return `${pid}.firebasestorage.app`;
}

export function parseProjectIdFromServiceAccountKey(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const sa = JSON.parse(raw) as { project_id?: string };
    return sa.project_id?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function formatStorageError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('bucket does not exist') || msg.includes('notFound')) {
    const bucket = resolveStorageBucket(parseProjectIdFromServiceAccountKey(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
      || '(미설정)';
    return `Firebase Storage 버킷을 찾을 수 없습니다 (${bucket}). Firebase Console에서 Storage를 활성화하거나, Vercel에 NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=pitaya-osv1-media 를 설정하세요.`;
  }
  if (msg.includes('OPENAI') || msg.includes('api key')) {
    return msg;
  }
  try {
    const parsed = JSON.parse(msg) as { message?: string; error?: { message?: string } };
    if (parsed.message) return parsed.message;
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    /* not JSON */
  }
  return msg;
}

import { getAuth } from 'firebase/auth';

/**
 * 현재 로그인된 Firebase 사용자의 ID Token을 포함한 헤더를 반환합니다.
 * 로그인되지 않은 경우 빈 객체를 반환합니다.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export async function getAuthJsonHeaders(): Promise<Record<string, string>> {
  const base = await getAuthHeaders();
  return { ...base, 'Content-Type': 'application/json' };
}

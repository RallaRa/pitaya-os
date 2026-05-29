import { getAuth, onAuthStateChanged, User } from 'firebase/auth';

function waitForUser(timeoutMs = 5000): Promise<User | null> {
  const auth = getAuth();
  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      unsub();
      resolve(auth.currentUser);
    }, timeoutMs);

    const unsub = onAuthStateChanged(auth, user => {
      clearTimeout(timer);
      unsub();
      resolve(user);
    });
  });
}

/**
 * 현재 로그인된 Firebase 사용자의 ID Token을 포함한 헤더를 반환합니다.
 * auth.currentUser가 아직 없으면 onAuthStateChanged로 대기합니다.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = await waitForUser();
  if (!user) return {};
  try {
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

export async function getAuthJsonHeaders(): Promise<Record<string, string>> {
  const base = await getAuthHeaders();
  return { ...base, 'Content-Type': 'application/json' };
}

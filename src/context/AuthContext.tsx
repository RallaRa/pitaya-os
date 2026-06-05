'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  onAuthStateChanged,
  User,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { auth } from '@/lib/firebase/firebase';
import { getAuthHeaders, getAuthJsonHeaders, invalidateAuthHeadersCache } from '@/lib/getAuthHeaders';
import { clearCustomerPiiSession } from '@/lib/customerPiiSession';

const isDev = process.env.NODE_ENV === 'development';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  checkAndRoute: (uid: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAndRoute = async (uid: string) => {
    try {
      const headers = await getAuthHeaders();
      const [activeRes, pendingRes] = await Promise.all([
        fetch(`/api/store?uid=${uid}`, { headers }),
        fetch(`/api/store?uid=${uid}&status=pending`, { headers }),
      ]);
      const activeData = await activeRes.json();
      const pendingData = await pendingRes.json();

      const activeStores = activeData.stores || [];
      const pendingStores = pendingData.stores || [];

      if (isDev) {
        console.log('[checkAndRoute] uid:', uid);
        console.log('[checkAndRoute] active:', activeStores.length, 'pending:', pendingStores.length);
      }

      if (activeStores.length === 0 && pendingStores.length === 0) {
        router.push('/select-store?mode=apply');
      } else if (activeStores.length === 0 && pendingStores.length > 0) {
        router.push('/select-store?mode=pending');
      } else if (activeStores.length === 1) {
        router.push('/dashboard');
      } else {
        router.push('/select-store');
      }
    } catch (error) {
      console.error('[checkAndRoute 에러]', error);
      router.push('/select-store?mode=apply');
    }
  };

  // loading 해제는 오직 여기서만
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (isDev) console.log('[Auth State]', currentUser?.email ?? 'none');
      if (!currentUser) {
        clearCustomerPiiSession();
        invalidateAuthHeadersCache();
      }
      setUser(currentUser);
      setLoading(false);

      // 세션 복원 시에도 groupId 동기화 (재로그인 없이도 최신 groupId 유지)
      if (currentUser) {
        getAuthJsonHeaders().then(headers =>
          fetch('/api/users', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              uid: currentUser.uid,
              name: currentUser.displayName,
              email: currentUser.email,
              photoURL: currentUser.photoURL,
            }),
          })
        ).catch(() => {});
      }
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);

      if (isDev) console.log('[Auth 성공]', result.user.email);

      await fetch('/api/users', {
        method: 'POST',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({
          uid: result.user.uid,
          name: result.user.displayName,
          email: result.user.email,
          photoURL: result.user.photoURL,
        }),
      });

      await checkAndRoute(result.user.uid);
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      console.error('[Auth 에러]', code, error);
      if (code === 'auth/unauthorized-domain') {
        alert('도메인 미등록. Firebase Console에서 현재 도메인을 추가해주세요:\n' + location.hostname);
      }
    }
  };

  const logout = async () => {
    try {
      clearCustomerPiiSession();
      invalidateAuthHeadersCache();
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Logout Error:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, logout, checkAndRoute }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

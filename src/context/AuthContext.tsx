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
      const [activeRes, pendingRes] = await Promise.all([
        fetch(`/api/store?uid=${uid}`),
        fetch(`/api/store?uid=${uid}&status=pending`),
      ]);
      const activeData = await activeRes.json();
      const pendingData = await pendingRes.json();

      console.log('[checkAndRoute] uid:', uid);
      console.log('[checkAndRoute] activeData:', activeData);
      console.log('[checkAndRoute] pendingData:', pendingData);

      const activeStores = activeData.stores || [];
      const pendingStores = pendingData.stores || [];

      console.log('[checkAndRoute] active:', activeStores.length, 'pending:', pendingStores.length);

      if (activeStores.length === 0 && pendingStores.length === 0) {
        console.log('[checkAndRoute] → /select-store?mode=apply');
        router.push('/select-store?mode=apply');
      } else if (activeStores.length === 0 && pendingStores.length > 0) {
        console.log('[checkAndRoute] → /select-store?mode=pending');
        router.push('/select-store?mode=pending');
      } else if (activeStores.length === 1) {
        console.log('[checkAndRoute] → /dashboard');
        router.push('/dashboard');
      } else {
        console.log('[checkAndRoute] → /select-store');
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
      console.log('[Auth State]', currentUser?.email ?? 'none');
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      console.log('[Auth] 팝업 로그인 시작');
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);

      console.log('[Auth 성공]', result.user.email);

      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

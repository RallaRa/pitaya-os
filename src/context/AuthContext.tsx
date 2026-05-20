'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  onAuthStateChanged,
  User,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
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

      const activeStores = activeData.stores || [];
      const pendingStores = pendingData.stores || [];

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
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log('[Auth State]', currentUser?.email ?? 'none');
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (!result) return;
        console.log('[Redirect 성공]', result.user.email);

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
      })
      .catch((error) => {
        console.error('[Redirect 에러]', error.code, error.message);
      });
  }, []);

  const signInWithGoogle = async () => {
    try {
      console.log('[Auth] 리다이렉트 로그인 시작');
      const provider = new GoogleAuthProvider();
      await signInWithRedirect(auth, provider);
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      console.error('[Auth 에러]', code, error);
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

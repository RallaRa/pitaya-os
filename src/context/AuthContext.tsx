'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  onAuthStateChanged,
  User,
  GoogleAuthProvider,
  signInWithRedirect,
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
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: currentUser.uid,
            name: currentUser.displayName,
            email: currentUser.email,
            photoURL: currentUser.photoURL,
          }),
        }).catch(console.error);
      }
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    console.log('[Auth] signInWithRedirect 호출');
    try {
      await signInWithRedirect(auth, provider);
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      console.error('[Auth] 로그인 실패 코드:', code, error);
      if (code === 'auth/unauthorized-domain') {
        alert('이 도메인은 Firebase에 등록되지 않았습니다. Firebase Console > Authentication > Authorized Domains에 현재 도메인을 추가해주세요.');
      }
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
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

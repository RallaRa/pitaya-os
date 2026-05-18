'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
//import { onAuthStateChanged, User, GoogleAuthProvider, signInWithRedirect, signOut } from 'firebase/auth';
/*import { 
  onAuthStateChanged, 
  User, 
  GoogleAuthProvider, 
  signInWithRedirect, 
  getRedirectResult, // 이거 추가
  signOut 
} from 'firebase/auth';*/
import { 
  onAuthStateChanged, 
  User, 
  GoogleAuthProvider, 
  signInWithPopup, // 다시 팝업으로 변경
  signOut 
} from 'firebase/auth';//롤백

import { auth } from '@/lib/firebase/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAndRoute = async (uid: string) => {
    const res = await fetch(`/api/store?uid=${uid}`);
    const data = await res.json();
    if (!data.stores || data.stores.length === 0) {
      router.push('/select-store');
    } else if (data.stores.length === 1) {
      router.push('/dashboard');
    } else {
      router.push('/select-store');
    }
  };

  /*useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);*/
  useEffect(() => {
    // 1. 리디렉션으로 돌아온 결과가 있는지 체크
    /*getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          console.log("Redirect Login Success:", result.user);
          // 여기서 대시보드로 강제 이동 로직을 넣을 수도 있습니다.
        }
      })
      .catch((error) => {
        console.error("Redirect Error:", error);
      });
         */
    // 2. 기존 사용자 상태 감시 로직
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false); // 로그인이 확인되면 로딩을 끔
    });

    return () => unsubscribe();
  }, []);

  /*const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithRedirect(auth, provider);
    } catch (error) {
      console.error("Google Login Error: ", error);
    }*/
   /*const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider); // 리디렉션을 팝업으로 교체
    } catch (error) {
      console.error("Google Login Error: ", error);
    }
  };*/

  //바로 위주석처리건은 실제 계정로그인시를 감안한 코드 아래는 임시 개발을 위한 강제주입코드
  const signInWithGoogle = async () => {
    try {
      console.log("🚀 [Dev Mode] 구글 팝업 통신 차단 우회: 마스터키 발급");
      
      // 1. 구글 서버 통신(signInWithPopup) 없이 가짜 최고 관리자 신분증 강제 생성
      const mockUser = {
        uid: 'dev-master-001',
        role: 'superuser',
        displayName: '최고 관리자(Admin)',
        email: 'admin@pitaya.com',
        photoURL: 'https://ui-avatars.com/api/?name=Admin&background=0D8ABC&color=fff',
      } as User;

      // 2. 시스템에 강제 주입
      setUser(mockUser);
      setLoading(false);
      await checkAndRoute(mockUser.uid);
    } catch (error) {
      console.error("Login Error: ", error);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout Error: ", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, logout }}>
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
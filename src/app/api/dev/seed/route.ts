// 개발 환경 전용 시드 라우트 — 프로덕션 배포 전 반드시 제거
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import {
  doc, setDoc, collection, addDoc,
  getDocs, query, where, serverTimestamp,
} from 'firebase/firestore';

const DEV_STORE_ID = 'STR-DEV-001';

const SEED_USERS = [
  {
    uid: 'dev-master-001',
    name: '최고 관리자',
    email: 'admin@pitaya.com',
    role: 'superuser',
    photoURL: 'https://ui-avatars.com/api/?name=Admin&background=0D8ABC&color=fff',
  },
  {
    uid: 'dev-staff-001',
    name: '김직원',
    email: 'staff1@pitaya.com',
    role: 'staff',
    photoURL: 'https://ui-avatars.com/api/?name=김직원&background=16A34A&color=fff',
  },
  {
    uid: 'dev-staff-002',
    name: '이매니저',
    email: 'staff2@pitaya.com',
    role: 'manager',
    photoURL: 'https://ui-avatars.com/api/?name=이매니저&background=9333EA&color=fff',
  },
];

export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'dev/seed 라우트는 프로덕션에서 사용할 수 없습니다.' }, { status: 403 });
  }
  try {
    const results: string[] = [];

    for (const u of SEED_USERS) {
      // users 컬렉션 upsert
      await setDoc(doc(db, 'users', u.uid), {
        uid: u.uid,
        name: u.name,
        email: u.email,
        role: u.role,
        photoURL: u.photoURL,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // user_store_map — 중복 방지
      const existQ = query(
        collection(db, 'user_store_map'),
        where('uid', '==', u.uid),
        where('storeId', '==', DEV_STORE_ID)
      );
      const existSnap = await getDocs(existQ);

      if (existSnap.empty) {
        await addDoc(collection(db, 'user_store_map'), {
          uid: u.uid,
          storeId: DEV_STORE_ID,
          role: u.role,
          status: 'active',
          linkedAt: serverTimestamp(),
          unlinkedAt: null,
        });
        results.push(`${u.name} — 신규 등록`);
      } else {
        results.push(`${u.name} — 이미 존재 (스킵)`);
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message }, { status: 500 }
    );
  }
}

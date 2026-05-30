import { getApps, initializeApp, cert, App, ServiceAccount } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { Storage, getStorage } from 'firebase-admin/storage';
import { Auth, getAuth } from 'firebase-admin/auth';

const APP_NAME = 'admin';

function getAdminApp(): App {
  const existing = getApps().find(a => a.name === APP_NAME);
  if (existing) return existing;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not configured');
  }
  let sa: { private_key?: string; [key: string]: unknown };
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_KEY JSON 파싱 실패 — .env.local에 한 줄 JSON으로 넣거나 Downloads의 서비스계정 파일을 사용하세요',
    );
  }
  // .env 또는 Vercel에서 \n이 이스케이프된 경우 복원
  if (sa.private_key?.includes('\\n')) {
    sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  }
  return initializeApp(
    {
      credential: cert(sa as ServiceAccount),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    },
    APP_NAME,
  );
}

// Proxy: 빌드 타임이 아닌 첫 API 호출 시 초기화
export const adminDb = new Proxy({} as Firestore, {
  get(_, prop: string | symbol) {
    const db = getFirestore(getAdminApp());
    const val = db[prop as keyof Firestore];
    return typeof val === 'function' ? (val as Function).bind(db) : val;
  },
});

export const adminStorage = new Proxy({} as Storage, {
  get(_, prop: string | symbol) {
    const storage = getStorage(getAdminApp());
    const val = storage[prop as keyof Storage];
    return typeof val === 'function' ? (val as Function).bind(storage) : val;
  },
});

export const adminAuth = new Proxy({} as Auth, {
  get(_, prop: string | symbol) {
    const auth = getAuth(getAdminApp());
    const val = auth[prop as keyof Auth];
    return typeof val === 'function' ? (val as Function).bind(auth) : val;
  },
});

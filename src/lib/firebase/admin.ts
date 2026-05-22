import { getApps, initializeApp, cert, App } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { Storage, getStorage } from 'firebase-admin/storage';

const APP_NAME = 'admin';

function getAdminApp(): App {
  const existing = getApps().find(a => a.name === APP_NAME);
  if (existing) return existing;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY!;
  const sa = JSON.parse(raw);
  // .env 또는 Vercel에서 \n이 이스케이프된 경우 복원
  if (sa.private_key?.includes('\\n')) {
    sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  }
  return initializeApp(
    {
      credential: cert(sa),
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

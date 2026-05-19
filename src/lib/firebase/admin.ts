import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

function getDb(): Firestore {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY!;
    const sa = JSON.parse(raw);
    // JSON.parse already converts \n → newline, but handle double-escaped case
    if (sa.private_key && sa.private_key.includes('\\n')) {
      sa.private_key = sa.private_key.replace(/\\n/g, '\n');
    }
    initializeApp({ credential: cert(sa) });
  }
  return getFirestore();
}

// Proxy: Admin SDK is initialized only on first actual API call (not at build time)
export const adminDb = new Proxy({} as Firestore, {
  get(_, prop: string | symbol) {
    const db = getDb();
    const val = db[prop as keyof Firestore];
    return typeof val === 'function' ? (val as Function).bind(db) : val;
  },
});

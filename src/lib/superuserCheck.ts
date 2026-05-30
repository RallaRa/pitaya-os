import { adminDb } from '@/lib/firebase/admin';
import { isSuperuserEmail } from '@/lib/auth/permissions';

/** 이메일 또는 users.role === 'superuser' */
export async function isPlatformSuperuser(uid: string, email?: string | null): Promise<boolean> {
  if (isSuperuserEmail(email)) return true;
  const userDoc = await adminDb.collection('users').doc(uid).get();
  return userDoc.exists && userDoc.data()?.role === 'superuser';
}

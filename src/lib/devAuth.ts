import { verifyToken } from '@/lib/authVerify';
import { isSuperuserEmail } from '@/lib/auth/permissions';

export async function requireSuperuser(req: Request) {
  const user = await verifyToken(req);
  if (!user) return { error: 'Unauthorized', status: 401 as const, user: null };
  if (!isSuperuserEmail(user.email)) {
    return { error: 'Superuser only', status: 403 as const, user: null };
  }
  return { error: null, status: 200 as const, user };
}

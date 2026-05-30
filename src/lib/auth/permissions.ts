const SUPERUSER_EMAIL =
  process.env.SUPERUSER_EMAIL ||
  process.env.NEXT_PUBLIC_SUPERUSER_EMAIL ||
  'hipona00@gmail.com';

export function isSuperuserEmail(email?: string | null): boolean {
  if (!email || !SUPERUSER_EMAIL) return false;
  return email.toLowerCase() === SUPERUSER_EMAIL.toLowerCase();
}

/** 클라이언트: 이메일 또는 role/groupId 기반 슈퍼유저 판별 */
export function isSuperuser(
  email?: string | null,
  roleOrGroupId?: string | null,
): boolean {
  if (isSuperuserEmail(email)) return true;
  return roleOrGroupId === 'superuser';
}

export function isSuperOrMaster(groupId: string, email?: string | null): boolean {
  return isSuperuser(email, groupId) || groupId === 'master';
}

export function isAdminOrAbove(groupId: string, email?: string | null): boolean {
  return isSuperuser(email, groupId) || ['master', 'admin'].includes(groupId);
}

export function hasPermission(
  menuAccess: Record<string, boolean> | null | undefined,
  key: string,
  email?: string | null,
  roleOrGroupId?: string | null,
): boolean {
  if (isSuperuser(email, roleOrGroupId)) return true;
  if (!menuAccess) return false;
  return menuAccess[key] === true;
}

export { SUPERUSER_EMAIL };

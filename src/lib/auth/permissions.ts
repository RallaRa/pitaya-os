const SUPERUSER_EMAIL =
  process.env.SUPERUSER_EMAIL ||
  process.env.NEXT_PUBLIC_SUPERUSER_EMAIL ||
  'hipona00@gmail.com';

export function isSuperuserEmail(email?: string | null): boolean {
  if (!email || !SUPERUSER_EMAIL) return false;
  return email.toLowerCase() === SUPERUSER_EMAIL.toLowerCase();
}

export function isSuperuser(email?: string | null): boolean {
  return isSuperuserEmail(email);
}

export function isSuperOrMaster(groupId: string, email?: string | null): boolean {
  return isSuperuserEmail(email) || groupId === 'master';
}

export function isAdminOrAbove(groupId: string, email?: string | null): boolean {
  return isSuperuserEmail(email) || ['master', 'admin'].includes(groupId);
}

export function hasPermission(
  menuAccess: Record<string, boolean> | null | undefined,
  key: string,
  email?: string | null,
): boolean {
  if (isSuperuserEmail(email)) return true;
  if (!menuAccess) return false;
  return menuAccess[key] === true;
}

export { SUPERUSER_EMAIL };

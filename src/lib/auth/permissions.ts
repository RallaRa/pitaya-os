const SUPERUSER_EMAIL =
  process.env.SUPERUSER_EMAIL ||
  process.env.NEXT_PUBLIC_SUPERUSER_EMAIL ||
  '';

export function isSuperuserEmail(email?: string | null): boolean {
  if (!email || !SUPERUSER_EMAIL) return false;
  return email.toLowerCase() === SUPERUSER_EMAIL.toLowerCase();
}

export function isSuperOrMaster(groupId: string, email?: string | null): boolean {
  return isSuperuserEmail(email) || groupId === 'master';
}

export function isAdminOrAbove(groupId: string, email?: string | null): boolean {
  return isSuperuserEmail(email) || ['master', 'admin'].includes(groupId);
}

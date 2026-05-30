/** 매장 멤버 role ↔ permission groupId ↔ 표시명 (전 화면 공통) */

export type StoreRole = 'superuser' | 'owner' | 'admin' | 'user';
export type PermissionGroupId = 'superuser' | 'master' | 'admin' | 'user';

export interface RoleDefinition {
  role: StoreRole;
  groupId: PermissionGroupId;
  label: string;
  level: number;
}

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  { role: 'superuser', groupId: 'superuser', label: '슈퍼유저', level: 4 },
  { role: 'owner',     groupId: 'master',    label: '관리자',   level: 3 },
  { role: 'admin',     groupId: 'admin',     label: '점장',     level: 2 },
  { role: 'user',      groupId: 'user',      label: '직원',     level: 1 },
];

const LEGACY_ROLE_ALIASES: Record<string, StoreRole> = {
  staff: 'user',
  master: 'owner',
  superuser: 'superuser',
};

const LEGACY_GROUP_ALIASES: Record<string, PermissionGroupId> = {
  staff: 'user',
  owner: 'master',
};

export function normalizeRole(role?: string | null): StoreRole {
  if (!role) return 'user';
  const r = role.toLowerCase();
  if (LEGACY_ROLE_ALIASES[r]) return LEGACY_ROLE_ALIASES[r];
  if (ROLE_DEFINITIONS.some(d => d.role === r)) return r as StoreRole;
  return 'user';
}

export function normalizeGroupId(groupId?: string | null): PermissionGroupId {
  if (!groupId) return 'user';
  const g = groupId.toLowerCase();
  if (LEGACY_GROUP_ALIASES[g]) return LEGACY_GROUP_ALIASES[g];
  if (ROLE_DEFINITIONS.some(d => d.groupId === g)) return g as PermissionGroupId;
  return 'user';
}

export function roleToGroupId(role?: string | null): PermissionGroupId {
  const normalized = normalizeRole(role);
  return ROLE_DEFINITIONS.find(d => d.role === normalized)?.groupId ?? 'user';
}

export function groupIdToRole(groupId?: string | null): StoreRole {
  const normalized = normalizeGroupId(groupId);
  return ROLE_DEFINITIONS.find(d => d.groupId === normalized)?.role ?? 'user';
}

export function getRoleLabel(roleOrGroup?: string | null): string {
  if (!roleOrGroup) return '직원';
  const byRole = ROLE_DEFINITIONS.find(d => d.role === roleOrGroup);
  if (byRole) return byRole.label;
  const byGroup = ROLE_DEFINITIONS.find(d => d.groupId === roleOrGroup);
  if (byGroup) return byGroup.label;
  if (roleOrGroup === 'staff') return '직원';
  return roleOrGroup;
}

export function getAssignableRoles(includeSuperuser = false): RoleDefinition[] {
  const roles = ROLE_DEFINITIONS.filter(d => d.role !== 'owner' || includeSuperuser);
  if (!includeSuperuser) return roles.filter(d => d.role !== 'superuser');
  return roles;
}

/** owner는 슈퍼유저만 지정 가능 */
export function getChangeableRoles(isSuperuser = false): StoreRole[] {
  if (isSuperuser) return ['superuser', 'owner', 'admin', 'user'];
  return ['admin', 'user'];
}

export function getAssignableGroupIds(includeSuperuser = false): PermissionGroupId[] {
  return getAssignableRoles(includeSuperuser).map(d => d.groupId);
}

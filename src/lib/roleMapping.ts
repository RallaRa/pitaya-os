/** 매장 멤버 role ↔ permission groupId ↔ 표시명 (전 화면 공통) */

import {
  DEFAULT_SYSTEM_GROUP_NAMES,
  normalizePermissionGroupId,
  SYSTEM_GROUP_IDS,
  type SystemGroupId,
} from '@/lib/menuAccessKeys';

export type StoreRole = 'superuser' | 'admin' | 'staff';
export type PermissionGroupId = SystemGroupId | string;

export interface RoleDefinition {
  role: StoreRole;
  groupId: SystemGroupId;
  label: string;
  level: number;
}

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  { role: 'superuser', groupId: 'superuser', label: DEFAULT_SYSTEM_GROUP_NAMES.superuser, level: 3 },
  { role: 'admin',     groupId: 'admin',     label: DEFAULT_SYSTEM_GROUP_NAMES.admin,     level: 2 },
  { role: 'staff',     groupId: 'staff',     label: DEFAULT_SYSTEM_GROUP_NAMES.staff,     level: 1 },
];

const LEGACY_ROLE_ALIASES: Record<string, StoreRole> = {
  staff: 'staff',
  user: 'staff',
  master: 'superuser',
  owner: 'superuser',
  superuser: 'superuser',
  admin: 'admin',
};

const LEGACY_GROUP_ALIASES: Record<string, SystemGroupId> = {
  staff: 'staff',
  user: 'staff',
  master: 'superuser',
  owner: 'superuser',
  superuser: 'superuser',
  admin: 'admin',
};

export function normalizeRole(role?: string | null): StoreRole {
  if (!role) return 'staff';
  const r = role.toLowerCase();
  if (LEGACY_ROLE_ALIASES[r]) return LEGACY_ROLE_ALIASES[r];
  if (ROLE_DEFINITIONS.some(d => d.role === r)) return r as StoreRole;
  return 'staff';
}

export function normalizeGroupId(groupId?: string | null): string {
  const normalized = normalizePermissionGroupId(groupId);
  if ((SYSTEM_GROUP_IDS as readonly string[]).includes(normalized)) {
    return normalized;
  }
  if (LEGACY_GROUP_ALIASES[groupId?.toLowerCase() || '']) {
    return LEGACY_GROUP_ALIASES[groupId!.toLowerCase()];
  }
  return normalized;
}

export function roleToGroupId(role?: string | null): string {
  const normalized = normalizeRole(role);
  return ROLE_DEFINITIONS.find(d => d.role === normalized)?.groupId ?? 'staff';
}

export function groupIdToRole(groupId?: string | null): StoreRole {
  const normalized = normalizeGroupId(groupId);
  const core = ROLE_DEFINITIONS.find(d => d.groupId === normalized);
  if (core) return core.role;
  return 'staff';
}

export function getRoleLabel(roleOrGroup?: string | null): string {
  if (!roleOrGroup) return DEFAULT_SYSTEM_GROUP_NAMES.staff;
  const gid = normalizeGroupId(roleOrGroup);
  const byGroup = ROLE_DEFINITIONS.find(d => d.groupId === gid);
  if (byGroup) return byGroup.label;
  const byRole = ROLE_DEFINITIONS.find(d => d.role === roleOrGroup);
  if (byRole) return byRole.label;
  return roleOrGroup;
}

export function getAssignableRoles(includeSuperuser = false): RoleDefinition[] {
  if (includeSuperuser) return [...ROLE_DEFINITIONS];
  return ROLE_DEFINITIONS.filter(d => d.role !== 'superuser');
}

export function getChangeableRoles(isSuperuser = false): StoreRole[] {
  if (isSuperuser) return ['superuser', 'admin', 'staff'];
  return ['admin', 'staff'];
}

export function getAssignableGroupIds(includeSuperuser = false): string[] {
  return getAssignableRoles(includeSuperuser).map(d => d.groupId);
}

export function isCoreSystemGroup(groupId?: string | null): boolean {
  return (SYSTEM_GROUP_IDS as readonly string[]).includes(normalizeGroupId(groupId));
}

export function isAdminLevelGroup(groupId?: string | null): boolean {
  const g = normalizeGroupId(groupId);
  return g === 'superuser' || g === 'admin';
}

export function isSuperuserLevelGroup(groupId?: string | null): boolean {
  return normalizeGroupId(groupId) === 'superuser';
}

import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { resolveMyAccessPayload } from '@/lib/myAccessResolve';
import type { MenuAccessKey } from '@/lib/menuAccessKeys';
import {
  type AccountingPermissionKey,
  canAccessAccountingSection,
} from '@/lib/accounting/menuStructure';

export class AccountingAccessError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export async function requireAccountingAccess(
  req: Request,
  permission: AccountingPermissionKey = 'accounting',
  storeId?: string,
) {
  const authUser = await verifyToken(req);
  if (!authUser) {
    throw new AccountingAccessError('Unauthorized', 401);
  }

  const access = await resolveMyAccessPayload(authUser.uid, authUser.email, storeId || null);
  if (access.isSuperuser) {
    return { uid: authUser.uid, email: authUser.email, access };
  }

  const menuAccess = access.menuAccess as Partial<Record<MenuAccessKey, boolean>>;
  if (!canAccessAccountingSection(menuAccess, permission)) {
    throw new AccountingAccessError('회계 모듈 접근 권한이 없습니다.', 403);
  }

  return { uid: authUser.uid, email: authUser.email, access };
}

export function handleAccountingApiError(e: unknown) {
  if (e instanceof AccountingAccessError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  const msg = e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: msg }, { status: 500 });
}

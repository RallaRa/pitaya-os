import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { getDashboardLayoutData } from '@/lib/dashboardLayoutServer';
import { getDashboardWidgetPermissions } from '@/lib/dashboardWidgetPermissionsServer';
import { resolveMyAccessPayload } from '@/lib/myAccessResolve';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const uid = searchParams.get('uid') || authUser.uid;
  const storeId = searchParams.get('storeId') || '';

  try {
    const [myAccess, widgetPermissions, layout] = await Promise.all([
      resolveMyAccessPayload(authUser.uid, authUser.email, storeId || null),
      getDashboardWidgetPermissions(storeId || 'global'),
      getDashboardLayoutData(uid, storeId || null),
    ]);

    return NextResponse.json({ myAccess, widgetPermissions, layout });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

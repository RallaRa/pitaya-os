import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import {
  getDashboardWidgetPermissions,
} from '@/lib/dashboardWidgetPermissionsServer';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || 'global';

  const data = await getDashboardWidgetPermissions(storeId);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body    = await req.json();
    const { storeId = 'global', widgets } = body;

    const sanitized: Record<string, Record<string, boolean>> = {};
    for (const [key, perms] of Object.entries(widgets as Record<string, Record<string, boolean>>)) {
      sanitized[key] = { ...perms, master: true };
    }

    await adminDb.collection('dashboard_widget_permissions').doc(storeId).set(
      { widgets: sanitized, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

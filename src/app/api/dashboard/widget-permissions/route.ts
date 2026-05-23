import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

const DEFAULT_PERMISSIONS = {
  news:               { master: true, admin: true,  user: true,  staff: false },
  weather:            { master: true, admin: true,  user: true,  staff: true  },
  weekly_analysis:    { master: true, admin: true,  user: false, staff: false },
  yesterday_analysis: { master: true, admin: true,  user: true,  staff: false },
  quick_menu:         { master: true, admin: true,  user: true,  staff: true  },
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || 'global';

  try {
    const doc = await adminDb.collection('dashboard_widget_permissions').doc(storeId).get();
    const widgets = doc.exists ? { ...DEFAULT_PERMISSIONS, ...doc.data()?.widgets } : DEFAULT_PERMISSIONS;
    return NextResponse.json({ widgets });
  } catch (e: any) {
    return NextResponse.json({ widgets: DEFAULT_PERMISSIONS });
  }
}

export async function POST(req: Request) {
  try {
    const body    = await req.json();
    const { storeId = 'global', widgets } = body;

    // master는 항상 true
    const sanitized: any = {};
    for (const [key, perms] of Object.entries(widgets as Record<string, any>)) {
      sanitized[key] = { ...perms, master: true };
    }

    await adminDb.collection('dashboard_widget_permissions').doc(storeId).set(
      { widgets: sanitized, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

import { adminDb } from '@/lib/firebase/admin';

export interface DashboardLayoutPayload {
  layout: unknown;
  activeWidgets: string[] | null;
  layoutVersion: number | null;
  isMaster?: boolean;
}

export async function getDashboardLayoutData(
  uid: string,
  storeId: string | null,
): Promise<DashboardLayoutPayload> {
  if (!uid) return { layout: null, activeWidgets: null, layoutVersion: null };

  try {
    if (storeId) {
      const masterDoc = await adminDb.collection('dashboard_layouts').doc(`${storeId}_master`).get();
      if (masterDoc.exists) {
        return {
          layout: masterDoc.data()?.layout || null,
          activeWidgets: masterDoc.data()?.activeWidgets || null,
          layoutVersion: masterDoc.data()?.layoutVersion ?? null,
          isMaster: true,
        };
      }
    }

    const doc = await adminDb.collection('dashboard_layouts').doc(uid).get();
    if (!doc.exists) return { layout: null, activeWidgets: null, layoutVersion: null };
    return {
      layout: doc.data()?.layout || null,
      activeWidgets: doc.data()?.activeWidgets || null,
      layoutVersion: doc.data()?.layoutVersion ?? null,
      isMaster: false,
    };
  } catch {
    return { layout: null, activeWidgets: null, layoutVersion: null };
  }
}

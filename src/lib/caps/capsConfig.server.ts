import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { decrypt, encrypt } from '@/lib/encryption';
import type { CapsCamera, CapsCameraPublic, CapsConfig } from '@/lib/caps/capsTypes';

const DOC_PATH = 'platform_config/caps_cameras';

function parseEnvCameras(): CapsCamera[] {
  const raw = process.env.CAPS_CAMERAS_JSON?.trim();
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown[];
    if (!Array.isArray(list)) return [];
    return list.map((row, i) => normalizeCamera(row, i)).filter(Boolean) as CapsCamera[];
  } catch {
    return [];
  }
}

function normalizeCamera(row: unknown, index: number): CapsCamera | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const streamUrl = String(r.streamUrl || '').trim();
  if (!streamUrl) return null;
  return {
    id: String(r.id || `cam_${index + 1}`),
    name: String(r.name || `카메라 ${index + 1}`),
    storeId: r.storeId ? String(r.storeId) : undefined,
    storeName: r.storeName ? String(r.storeName) : undefined,
    streamType: (['hls', 'mjpeg', 'snapshot'].includes(String(r.streamType))
      ? r.streamType
      : 'snapshot') as CapsCamera['streamType'],
    streamUrl,
    enabled: r.enabled !== false,
  };
}

function decryptStreamUrl(encrypted: string, fallback = ''): string {
  if (!encrypted) return fallback;
  try {
    return decrypt(encrypted);
  } catch {
    return fallback;
  }
}

function toPublic(cam: CapsCamera): CapsCameraPublic {
  return {
    id: cam.id,
    name: cam.name,
    storeId: cam.storeId,
    storeName: cam.storeName,
    streamType: cam.streamType,
    enabled: cam.enabled,
  };
}

export async function getCapsConfig(): Promise<CapsConfig> {
  const snap = await adminDb.doc(DOC_PATH).get();
  const envFallback = parseEnvCameras();
  const capsliveUrl = process.env.CAPS_LIVE_URL || 'https://capslive.co.kr';

  if (!snap.exists) {
    return { cameras: envFallback, capsliveUrl };
  }

  const d = snap.data()!;
  const encryptedList = d.camerasEncrypted as string | undefined;
  let cameras: CapsCamera[] = envFallback;

  if (encryptedList) {
    try {
      const parsed = JSON.parse(decrypt(encryptedList)) as CapsCamera[];
      if (Array.isArray(parsed) && parsed.length) cameras = parsed;
    } catch {
      /* env fallback */
    }
  } else if (Array.isArray(d.cameras)) {
    cameras = (d.cameras as CapsCamera[]).map((c, i) => normalizeCamera(c, i)).filter(Boolean) as CapsCamera[];
  }

  return {
    cameras: cameras.filter(c => c.enabled !== false),
    capsliveUrl: String(d.capsliveUrl || capsliveUrl),
    updatedAt: d.updatedAt?.toDate?.()?.toISOString?.() || undefined,
    updatedBy: d.updatedBy ? String(d.updatedBy) : undefined,
  };
}

export async function listPublicCapsCameras(): Promise<{
  cameras: CapsCameraPublic[];
  capsliveUrl: string;
  updatedAt: string | null;
}> {
  const config = await getCapsConfig();
  return {
    cameras: config.cameras.filter(c => c.enabled).map(toPublic),
    capsliveUrl: config.capsliveUrl || 'https://capslive.co.kr',
    updatedAt: config.updatedAt || null,
  };
}

export async function getCapsCameraById(cameraId: string): Promise<CapsCamera | null> {
  const config = await getCapsConfig();
  return config.cameras.find(c => c.id === cameraId && c.enabled) || null;
}

export async function saveCapsConfig(params: {
  cameras: CapsCamera[];
  capsliveUrl?: string;
  uid: string;
}) {
  const payload = params.cameras.map(c => ({
    ...c,
    streamUrl: String(c.streamUrl || '').trim(),
  })).filter(c => c.id && c.streamUrl);

  await adminDb.doc(DOC_PATH).set({
    camerasEncrypted: encrypt(JSON.stringify(payload)),
    capsliveUrl: params.capsliveUrl || 'https://capslive.co.kr',
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: params.uid,
  }, { merge: true });

  return listPublicCapsCameras();
}

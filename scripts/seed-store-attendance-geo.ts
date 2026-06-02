/**
 * 매장 출퇴근 좌표 백필 (attendanceLat / attendanceLng / attendanceRadiusM)
 *
 * 1) 매장 주소가 있으면 카카오 주소 검색 API로 좌표 조회
 * 2) 없으면 .env KAKAO_STORE_LAT/LNG 사용
 *
 * Usage:
 *   npx tsx scripts/seed-store-attendance-geo.ts
 *   npx tsx scripts/seed-store-attendance-geo.ts --store STR-1779194754785
 *   npx tsx scripts/seed-store-attendance-geo.ts --all
 */
import dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { DEFAULT_ATTENDANCE_RADIUS_M } from '../src/lib/kakao/location';

dotenv.config({ path: '.env.local' });

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (sa.private_key?.includes('\\n')) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const KAKAO_REST = process.env.KAKAO_REST_API_KEY || '';
const ENV_LAT = parseFloat(process.env.KAKAO_STORE_LAT || '37.5509');
const ENV_LNG = parseFloat(process.env.KAKAO_STORE_LNG || '126.8495');
const ENV_RADIUS = parseInt(process.env.KAKAO_ATTENDANCE_RADIUS || String(DEFAULT_ATTENDANCE_RADIUS_M), 10);

function parseArgs() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const storeIdx = args.indexOf('--store');
  const storeId = storeIdx >= 0 ? args[storeIdx + 1] : process.env.POS_STORE_ID || '';
  return { all, storeId };
}

interface GeoResult {
  lat: number;
  lng: number;
  source: string;
  addressLabel?: string;
}

async function geocodeByKakao(query: string): Promise<GeoResult | null> {
  if (!KAKAO_REST || !query.trim()) return null;

  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query.trim())}&size=1`;
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${KAKAO_REST}` },
  });

  if (!res.ok) {
    const text = await res.text();
    console.warn(`  카카오 주소 API ${res.status}: ${text.slice(0, 120)}`);
    return null;
  }

  const json = await res.json() as {
    documents?: Array<{ y?: string; x?: string; address_name?: string; road_address_name?: string }>;
  };

  const doc = json.documents?.[0];
  if (!doc?.y || !doc?.x) return null;

  return {
    lat: parseFloat(doc.y),
    lng: parseFloat(doc.x),
    source: 'kakao_address',
    addressLabel: doc.road_address_name || doc.address_name,
  };
}

function buildAddressQuery(store: FirebaseFirestore.DocumentData): string {
  const parts = [
    store.address,
    store.region,
    store.regionSigungu,
    store.regionSido,
    store.storeName,
  ].filter(Boolean).map(String);
  return parts.join(' ').trim();
}

async function resolveGeo(store: FirebaseFirestore.DocumentData): Promise<GeoResult> {
  const existingLat = Number(store.attendanceLat);
  const existingLng = Number(store.attendanceLng);
  if (existingLat && existingLng && !process.argv.includes('--force')) {
    return {
      lat: existingLat,
      lng: existingLng,
      source: 'existing',
      addressLabel: store.attendanceAddressLabel,
    };
  }

  const query = buildAddressQuery(store);
  if (query) {
    const fromKakao = await geocodeByKakao(query);
    if (fromKakao) return fromKakao;
  }

  if (store.storeName?.includes('강서')) {
    const gangseo = await geocodeByKakao('서울 강서구 강서정육점');
    if (gangseo) return gangseo;
  }

  return {
    lat: ENV_LAT,
    lng: ENV_LNG,
    source: 'env_default',
    addressLabel: '.env KAKAO_STORE_LAT/LNG',
  };
}

async function updateStore(docId: string, data: FirebaseFirestore.DocumentData) {
  const geo = await resolveGeo(data);
  const radiusM = ENV_RADIUS >= 100 ? ENV_RADIUS : DEFAULT_ATTENDANCE_RADIUS_M;

  const patch = {
    attendanceLat: geo.lat,
    attendanceLng: geo.lng,
    attendanceRadiusM: radiusM,
    attendanceAddressLabel: geo.addressLabel || data.attendanceAddressLabel || '',
    attendanceGeoSource: geo.source,
    attendanceGeoUpdatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await db.collection('stores').doc(docId).set(patch, { merge: true });

  console.log(`✅ ${data.storeName || docId}`);
  console.log(`   좌표: ${geo.lat}, ${geo.lng} (${geo.source})`);
  if (geo.addressLabel) console.log(`   주소: ${geo.addressLabel}`);
  console.log(`   반경: ${patch.attendanceRadiusM}m`);
}

async function main() {
  const { all, storeId } = parseArgs();

  console.log('=== 매장 출퇴근 좌표 백필 ===');
  console.log(`기본 반경: ${ENV_RADIUS >= 100 ? ENV_RADIUS : DEFAULT_ATTENDANCE_RADIUS_M}m\n`);

  if (all) {
    const snap = await db.collection('stores').get();
    if (snap.empty) {
      console.log('매장 없음');
      return;
    }
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.status && data.status !== 'active') continue;
      await updateStore(doc.id, { ...data, storeId: doc.id });
    }
    return;
  }

  if (!storeId) {
    console.error('사용법: npx tsx scripts/seed-store-attendance-geo.ts [--store STORE_ID | --all] [--force]');
    process.exit(1);
  }

  const doc = await db.collection('stores').doc(storeId).get();
  if (!doc.exists) {
    console.error(`매장 없음: ${storeId}`);
    process.exit(1);
  }

  await updateStore(doc.id, { ...doc.data(), storeId: doc.id });
  console.log('\n완료 — 출퇴근·사이드바에서 매장 좌표 기준 500m(또는 설정값) 적용됩니다.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

/**
 * 회원정보 화면(98000001 / 01033018262) 기준 DB·Pitaya 수집 가능 여부 점검
 * Usage: npx tsx scripts/check-member-screen-phone.ts [cusCode]
 */
import dotenv from 'dotenv';
import path from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { decrypt } from '../src/lib/encryption';
import { decryptEnUKey2, isPosUKeyDecryptReady } from '../src/lib/posUKeyDecrypt';
import { isMaskedPhone, normalizePhoneDigits, phoneMatchKey } from '../src/lib/phonePii';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const STORE_ID = process.env.POS_STORE_ID || 'STR-1779194754785';
const CUS_CODE = process.argv[2] || '98000001';
const SCREEN_PHONE = '01033018262';

function initDb() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY missing');
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  return getFirestore();
}

async function main() {
  const db = initDb();
  const snap = await db.collection('pos_customers').doc(`${STORE_ID}_${CUS_CODE}`).get();
  const d = (snap.data() || {}) as Record<string, unknown>;

  let pitayaPlain = '';
  try {
    if (d.phoneEncrypted) pitayaPlain = decrypt(String(d.phoneEncrypted));
  } catch {
    pitayaPlain = '(복호화 실패)';
  }

  const masked = String(d.phoneMasked || '');
  const maskKey = phoneMatchKey(masked);
  const screenKey = phoneMatchKey(SCREEN_PHONE);

  console.log('\n=== 회원정보 화면 기준 수집 가능 여부 ===');
  console.log(`회원번호: ${CUS_CODE}`);
  console.log(`화면 휴대폰: ${SCREEN_PHONE}`);
  console.log(`Pitaya 문서 존재: ${snap.exists}`);
  console.log('');

  console.log('[Pitaya pos_customers 현재 상태]');
  console.log(`  phoneSource: ${d.phoneSource || '(없음)'}`);
  console.log(`  phoneMasked: ${masked || '(없음)'}`);
  console.log(`  phoneEncrypted: ${d.phoneEncrypted ? '있음' : '없음'}`);
  console.log(`  복호화 번호: ${pitayaPlain && pitayaPlain !== '(복호화 실패)' ? pitayaPlain : '(없음)'}`);
  console.log(`  화면 번호와 일치: ${pitayaPlain === SCREEN_PHONE ? 'YES' : 'NO'}`);
  console.log(`  마스킹키 일치(앞5_뒤4): ${maskKey && screenKey && maskKey === screenKey ? 'YES' : 'NO'} (${maskKey} vs ${screenKey})`);
  console.log(`  왓쳐 캡처: ${d.phoneScreenCapturedAt || '(없음)'} source=${d.phoneScreenSource || '-'}`);
  console.log(`  en_uKey2 복호화 키 설정: ${isPosUKeyDecryptReady() ? 'YES' : 'NO'}`);
  console.log('');

  console.log('[DB SELECT 경로 (bridge.js fetchCustomerInfo)]');
  console.log('  해당 화면 데이터 소스:');
  console.log('    Customer_Info.Cus_Code     → 회원번호');
  console.log('    Customer_Info.Cus_Name     → 회원성명');
  console.log('    Customer_Info.Cus_Mobile   → 보통 마스킹 (01033**8262)');
  console.log('    Cus_Mst.Cus_HP             → 평문 가능 (있으면 화면과 동일)');
  console.log('    Customer_Info.en_uKey2     → 암호문 → POS/서버 복호화 시 평문');
  console.log('');

  const dbPaths: Array<{ path: string; canGetPlain: string; note: string }> = [
    {
      path: 'SELECT Cus_Mobile FROM Customer_Info WHERE Cus_Code=...',
      canGetPlain: masked && isMaskedPhone(masked) ? '불가(마스킹만)' : pitayaPlain ? '가능' : '미확인',
      note: '화면 평문과 SQL 결과가 다른 경우가 많음',
    },
    {
      path: 'SELECT Cus_HP FROM Cus_Mst JOIN ...',
      canGetPlain: pitayaPlain === SCREEN_PHONE ? '가능(이미 반영됨)' : 'POS PC에서 dry-run 필요',
      note: 'bridge가 최우선 사용',
    },
    {
      path: 'SELECT en_uKey2 + POSON_UKEY2_KEY 복호화',
      canGetPlain: isPosUKeyDecryptReady() ? '키 있음 → 가능' : '키 없음 → 불가',
      note: 'POS 화면이 보여주는 방식과 동일 계열',
    },
    {
      path: '회원정보 화면 UI 스크랩 (왓쳐)',
      canGetPlain: d.phoneScreenSource === 'pos_member_lookup_screen' || d.phoneScreenSource === 'pos_payment_screen'
        ? '이미 캡처됨' : '가능(스크립트 배포 후)',
      note: 'DB에 평문 없을 때 fallback',
    },
  ];

  for (const p of dbPaths) {
    console.log(`  · ${p.path}`);
    console.log(`    → ${p.canGetPlain} | ${p.note}`);
  }

  console.log('');
  console.log('[결론]');
  if (pitayaPlain === SCREEN_PHONE) {
    console.log('  ✅ Pitaya에 화면과 동일 평문 이미 저장됨. DB/왓쳐 추가 작업 불필요.');
  } else if (maskKey && screenKey && maskKey === screenKey) {
    console.log('  ⚠️  마스킹만 있고 평문 없음. Cus_HP 또는 en_uKey2 복호화로 DB에서 가져올 수 있음.');
    console.log('      POS PC: node bridge.js sync-customers --dry-run 후 98000001 확인');
  } else {
    console.log('  ⚠️  화면 평문 미반영. DB 경로(Cus_HP/en_uKey2) 또는 회원정보 화면 왓쳐 필요.');
  }

  console.log('\nPOS PC 확인 명령:');
  console.log(`  node bridge.js sync-customers --dry-run   # Cus_HP/mobile/en_uKey2 샘플`);
  console.log(`  powershell -File probe-pos-member-screen.ps1  # 회원정보 화면 열린 상태`);
  console.log('');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

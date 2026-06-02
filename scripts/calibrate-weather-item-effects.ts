/**
 * 품목별 매출 × 날씨·공휴일 비교 → weather_impact_variables.itemEffects 채우기
 *
 * npx tsx scripts/calibrate-weather-item-effects.ts [storeId]
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const storeId = process.argv[2] || 'STR-1779194754785';

async function main() {
  const { runWeatherItemCalibration } = await import('../src/lib/weatherItemCalibration');
  const { adminDb } = await import('../src/lib/firebase/admin');

  let regionSido: string | undefined;
  try {
    const snap = await adminDb.collection('stores').doc(storeId).get();
    regionSido = snap.data()?.regionSido as string | undefined;
    console.log(`매장: ${snap.data()?.storeName || storeId} (${regionSido || '서울'})`);
  } catch {
    console.log(`매장 ID: ${storeId}`);
  }

  console.log('매출·날씨·공휴일 비교 분석 중...');
  const result = await runWeatherItemCalibration(storeId, { regionSido, force: true });

  if (result.skipped) {
    console.log('건너뜀:', result.reason);
    process.exit(1);
  }

  console.log(`\n분석 일수: ${result.seriesDays}일`);
  console.log(`완료 시각: ${result.calibratedAt}\n`);

  for (const d of result.details) {
    const v = result.variables.find(x => (x.id || x.name) === d.id);
    const top = v?.itemEffects
      ? Object.entries(v.itemEffects)
          .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
          .slice(0, 5)
          .map(([n, p]) => `${n} ${p > 0 ? '+' : ''}${p}%`)
          .join(', ')
      : '(없음)';
    console.log(`[${d.name}] 조건일 ${d.matchDays}일 · 품목 ${d.itemCount}개`);
    if (top && top !== '(없음)') console.log(`  → ${top}`);
  }

  console.log('\n저장 완료: weather_impact_variables/' + storeId);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

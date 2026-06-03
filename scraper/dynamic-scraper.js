require('./node18-polyfill');
require('dotenv').config();
const { normalizeItem, extractUnit } = require('./normalizer');
const { getDb, uploadPrices, uploadPendingAliases } = require('./firestore-upload');
const { scrapeCategory } = require('./site-adapters');

async function fetchAliasesFromFirestore() {
  try {
    const db = getDb();
    const snap = await db.collection('alias_dictionary').doc('global').get();
    return snap.exists ? (snap.data().items || {}) : {};
  } catch {
    return {};
  }
}

async function scrapeSource(source, firestoreAliases) {
  const results = [];
  const pending = [];

  for (const category of (source.categories || [])) {
    try {
      console.log(`[${source.name}] ${category.name}`);
      const parsed = await scrapeCategory(source, category);

      for (const item of parsed) {
        const normalized = normalizeItem(item.rawName, firestoreAliases);

        if (!normalized.aliasMatched) {
          pending.push({
            originalName: item.rawName,
            source: source.id,
            sourceName: source.name,
            price: item.price,
            url: item.url,
            category: item.category,
            animalType: normalized.animalType,
            origin: normalized.origin,
            storageType: normalized.storageType,
          });
        }

        results.push({
          source: source.id,
          sourceName: source.name,
          originalName: item.rawName,
          standardName: normalized.standardName,
          animalType: normalized.animalType,
          origin: normalized.origin,
          brand: normalized.brand,
          grade: normalized.grade,
          storageType: normalized.storageType,
          aliasMatched: normalized.aliasMatched,
          groupKey: normalized.groupKey,
          unit: extractUnit(item.rawName),
          price: item.price,
          url: item.url,
          scrapedAt: new Date().toISOString().slice(0, 10),
        });
      }

      await new Promise(r => setTimeout(r, 1200));
    } catch (e) {
      console.error(`[${source.name}] ${category.name} 실패:`, e.message);
    }
  }

  console.log(`[${source.name}] ${results.length}개, 미정의 ${pending.length}개`);
  return { results, pending };
}

async function runAll(options = {}) {
  const sourceId = options.sourceId;
  console.log('🥩 스크래핑 시작:', new Date().toISOString().slice(0, 10));

  const db = getDb();
  const [sourcesSnap, firestoreAliases] = await Promise.all([
    sourceId
      ? db.collection('scraper_sources').doc(sourceId).get().then(d => ({ docs: d.exists ? [d] : [] }))
      : db.collection('scraper_sources').where('enabled', '==', true).get(),
    fetchAliasesFromFirestore(),
  ]);

  const sources = sourcesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`${sources.length}개 소스`);

  if (sources.length === 0) {
    console.log('⚠️ 활성 소스 없음. node init-sources.js 먼저 실행하세요.');
    return { totalItems: 0, totalPending: 0, sources: [] };
  }

  const allResults = [];
  const allPending = [];
  const sourceStats = [];

  for (const source of sources) {
    const { results, pending } = await scrapeSource(source, firestoreAliases);
    allResults.push(...results);
    allPending.push(...pending);
    sourceStats.push({ id: source.id, name: source.name, itemCount: results.length, pendingCount: pending.length });

    await db.collection('scraper_sources').doc(source.id).update({
      lastScraped: new Date(),
      itemCount: results.length,
      pendingCount: pending.length,
    }).catch(() => {});
  }

  console.log(`\n📊 합계: ${allResults.length}개, 미정의: ${allPending.length}개`);

  if (!options.dryRun) {
    if (allResults.length > 0) await uploadPrices(allResults);
    if (allPending.length > 0) await uploadPendingAliases(allPending);
    console.log('✅ 완료');
  } else {
    console.log('🔍 미리보기 모드 — Firestore 저장 생략');
    console.log(JSON.stringify({
      itemCount: allResults.length,
      pendingCount: allPending.length,
      sources: sourceStats,
      items: allResults.slice(0, 30).map(r => ({
        originalName: r.originalName,
        standardName: r.standardName,
        price: r.price,
        url: r.url,
        origin: r.origin,
        animalType: r.animalType,
        storageType: r.storageType,
      })),
    }));
  }

  return {
    totalItems: allResults.length,
    totalPending: allPending.length,
    sources: sourceStats,
    sample: allResults.slice(0, 20),
    pendingSample: allPending.slice(0, 20),
  };
}

if (require.main === module) {
  const sourceId = process.argv.find(a => a.startsWith('--source='))?.split('=')[1];
  const dryRun = process.argv.includes('--dry-run');
  runAll({ sourceId, dryRun }).catch(e => {
    console.error('❌', e.message);
    process.exit(1);
  });
}

module.exports = { runAll, scrapeSource };

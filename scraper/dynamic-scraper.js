require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
const { normalizeItem, normalizePrice, extractUnit } = require('./normalizer');
const { getDb, uploadPrices, uploadPendingAliases } = require('./firestore-upload');

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
      const isEucKr = source.encoding === 'euc-kr';
      const res = await axios.get(category.url, {
        responseType: isEucKr ? 'arraybuffer' : 'text',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: 'text/html',
          'Accept-Language': 'ko-KR,ko;q=0.9',
          Referer: source.url,
        },
        timeout: 20000,
      });

      const html = isEucKr
        ? iconv.decode(Buffer.from(res.data), 'EUC-KR')
        : res.data;

      const $ = cheerio.load(html);
      const sel = source.selectors || {};

      $(sel.item || '.goods-item').each((_, el) => {
        const rawName = $(el).find(sel.name || '.name').first().text().trim();
        const rawPrice = $(el).find(sel.price || '.price').first().text().trim();
        const href = $(el).find('a').first().attr('href') || '';
        const itemUrl = href.startsWith('http')
          ? href
          : (href ? `${source.url.replace(/\/$/, '')}${href.startsWith('/') ? '' : '/'}${href}` : category.url);

        if (!rawName || !rawPrice) return;
        const price = normalizePrice(rawPrice);
        if (!price || price < 1000) return;

        const normalized = normalizeItem(rawName, firestoreAliases);

        if (!normalized.aliasMatched) {
          pending.push({
            originalName: rawName,
            source: source.id,
            sourceName: source.name,
            price,
            url: itemUrl,
            category: category.name,
            animalType: normalized.animalType,
            origin: normalized.origin,
            storageType: normalized.storageType,
          });
        }

        results.push({
          source: source.id,
          sourceName: source.name,
          originalName: rawName,
          standardName: normalized.standardName,
          animalType: normalized.animalType,
          origin: normalized.origin,
          brand: normalized.brand,
          grade: normalized.grade,
          storageType: normalized.storageType,
          aliasMatched: normalized.aliasMatched,
          groupKey: normalized.groupKey,
          unit: extractUnit(rawName),
          price,
          url: itemUrl,
          scrapedAt: new Date().toISOString().slice(0, 10),
        });
      });

      await new Promise(r => setTimeout(r, 1500));
    } catch (e) {
      console.error(`[${source.name}] ${category.name} 실패:`, e.message);
    }
  }

  console.log(`[${source.name}] ${results.length}개, 미정의 ${pending.length}개`);
  return { results, pending };
}

async function runAll() {
  console.log('🥩 스크래핑 시작:', new Date().toISOString().slice(0, 10));

  const db = getDb();
  const [sourcesSnap, firestoreAliases] = await Promise.all([
    db.collection('scraper_sources').where('enabled', '==', true).get(),
    fetchAliasesFromFirestore(),
  ]);

  const sources = sourcesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`${sources.length}개 소스`);

  if (sources.length === 0) {
    console.log('⚠️ 활성 소스 없음. node init-sources.js 먼저 실행하세요.');
    return;
  }

  const allResults = [];
  const allPending = [];

  for (const source of sources) {
    const { results, pending } = await scrapeSource(source, firestoreAliases);
    allResults.push(...results);
    allPending.push(...pending);

    await db.collection('scraper_sources').doc(source.id).update({
      lastScraped: new Date(),
      itemCount: results.length,
      pendingCount: pending.length,
    }).catch(() => {});
  }

  console.log(`\n📊 합계: ${allResults.length}개, 미정의: ${allPending.length}개`);

  if (allResults.length > 0) await uploadPrices(allResults);
  if (allPending.length > 0) await uploadPendingAliases(allPending);

  console.log('✅ 완료');
}

if (require.main === module) {
  runAll().catch(e => {
    console.error('❌', e.message);
    process.exit(1);
  });
}

module.exports = { runAll, scrapeSource };

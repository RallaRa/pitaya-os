require('./node18-polyfill');
require('dotenv').config();
const { getDb } = require('./firestore-upload');
const { scrapeSource } = require('./dynamic-scraper');

async function preview(sourceId) {
  const db = getDb();
  const doc = await db.collection('scraper_sources').doc(sourceId).get();
  if (!doc.exists) {
    console.error(JSON.stringify({ error: '소스를 찾을 수 없습니다.' }));
    process.exit(1);
  }

  const source = { id: doc.id, ...doc.data() };
  const aliasSnap = await db.collection('alias_dictionary').doc('global').get();
  const aliases = aliasSnap.exists ? (aliasSnap.data().items || {}) : {};
  const { results, pending } = await scrapeSource(source, aliases);

  console.log(JSON.stringify({
    source: { id: source.id, name: source.name },
    itemCount: results.length,
    pendingCount: pending.length,
    items: results.slice(0, 30).map(r => ({
      originalName: r.originalName,
      standardName: r.standardName,
      price: r.price,
      url: r.url,
      origin: r.origin,
      animalType: r.animalType,
    })),
  }));
}

const sourceId = process.argv[2];
if (!sourceId) {
  console.error('Usage: node preview-source.js <sourceId>');
  process.exit(1);
}

preview(sourceId).catch(e => {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
});

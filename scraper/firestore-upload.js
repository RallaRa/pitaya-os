let _db = null;

function getDb() {
  if (_db) return _db;
  const { initializeApp, cert, getApps } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  if (!getApps().length) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    initializeApp({ credential: cert(sa) });
  }
  _db = getFirestore();
  return _db;
}

async function uploadPrices(items) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const batchSize = 400;
  let total = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = db.batch();
    const chunk = items.slice(i, i + batchSize);
    for (const item of chunk) {
      const key = (item.groupKey || item.standardName).replace(/[\s/]/g, '_');
      const docId = `${item.source}_${key}_${today}`;
      batch.set(db.collection('market_prices').doc(docId), {
        ...item,
        updatedAt: new Date(),
      });
      const histId = `${item.source}_${key}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      batch.set(db.collection('market_price_history').doc(histId), {
        ...item,
        createdAt: new Date(),
      });
    }
    await batch.commit();
    total += chunk.length;
    console.log(`Firestore 저장: ${total}/${items.length}`);
  }

  await db.collection('scraper_meta').doc('last_run').set({
    lastRun: new Date(),
    totalItems: items.length,
    sources: [...new Set(items.map(i => i.sourceName))],
    date: today,
  });

  console.log(`✅ ${total}개 저장 완료`);
}

async function uploadPendingAliases(pending) {
  if (!pending.length) return;
  const db = getDb();
  const deduped = {};
  for (const p of pending) {
    const key = `${p.source}_${p.originalName}`;
    deduped[key] = p;
  }
  await db.collection('alias_dictionary').doc('global').set({
    pending: Object.values(deduped),
    pendingUpdatedAt: new Date(),
  }, { merge: true });
  console.log(`⚠️ 미정의 ${Object.keys(deduped).length}개 저장`);
}

module.exports = { getDb, uploadPrices, uploadPendingAliases };

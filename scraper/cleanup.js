require('dotenv').config();
const { getDb } = require('./firestore-upload');

async function cleanup() {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  let totalDeleted = 0;
  let hasMore = true;

  while (hasMore) {
    const snap = await db.collection('market_price_history')
      .where('createdAt', '<', cutoff)
      .limit(400)
      .get();

    if (snap.empty) {
      hasMore = false;
      break;
    }

    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    totalDeleted += snap.docs.length;
    console.log(`삭제 진행: ${totalDeleted}개`);
  }

  console.log(totalDeleted ? `✅ ${totalDeleted}개 삭제` : '삭제할 데이터 없음');
}

cleanup().catch(console.error);

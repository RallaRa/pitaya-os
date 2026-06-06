/**
 * POS 회원 영수증(SaT) 데이터 기간 조회
 * Usage: node probe-member-sales-range.js
 */
require('dotenv').config();
const sql = require('mssql');

const DB_CONFIG = {
  server: process.env.DB_SERVER || 'localhost',
  port: Number(process.env.DB_PORT || 18973),
  user: process.env.DB_USER || 'sa',
  database: process.env.DB_DATABASE || 'tips',
  password: process.env.DB_PASSWORD,
  options: { encrypt: false, trustServerCertificate: true },
};

async function main() {
  const pool = await sql.connect(DB_CONFIG);
  const tables = await pool.request().query(`
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME LIKE 'SaT_%'
    ORDER BY TABLE_NAME
  `);

  let minDate = null;
  let maxDate = null;
  let totalReceipts = 0;
  let totalLinesEstimate = 0;

  for (const row of tables.recordset) {
    const sat = row.TABLE_NAME;
    const ym = sat.replace('SaT_', '');
    const sad = `SaD_${ym}`;
    try {
      const r = await pool.request().query(`
        SELECT MIN(Sale_Date) AS mn, MAX(Sale_Date) AS mx, COUNT(*) AS cnt
        FROM ${sat}
        WHERE Cus_Code IS NOT NULL AND Cus_Code <> ''
      `);
      const cnt = Number(r.recordset[0]?.cnt || 0);
      if (!cnt) continue;
      totalReceipts += cnt;
      const mn = String(r.recordset[0].mn || '').slice(0, 10);
      const mx = String(r.recordset[0].mx || '').slice(0, 10);
      if (mn && (!minDate || mn < minDate)) minDate = mn;
      if (mx && (!maxDate || mx > maxDate)) maxDate = mx;

      try {
        const lj = await pool.request().query(`
          SELECT COUNT(*) AS lineCnt
          FROM ${sat} t
          INNER JOIN ${sad} d ON t.Sale_Num = d.Sale_Num AND t.Sale_Date = d.Sale_Date
          WHERE t.Cus_Code IS NOT NULL AND t.Cus_Code <> '' AND d.Sale_YN = 1
        `);
        totalLinesEstimate += Number(lj.recordset[0]?.lineCnt || 0);
      } catch {
        // SaD table may not exist for very old months
      }
    } catch {
      // skip
    }
  }

  console.log(JSON.stringify({
    tables: tables.recordset.length,
    minDate,
    maxDate,
    totalMemberReceipts: totalReceipts,
    estimatedPurchaseLines: totalLinesEstimate,
  }));

  await pool.close();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

/**
 * POS Goods 테이블 조사 (품명·품목코드 컬럼 확인)
 * Usage: node probe-goods-table.js
 */
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const OUT_FILE = path.join(__dirname, 'probe-goods-table.txt');
const lines = [];
function out(msg) {
  lines.push(msg);
  console.log(msg);
}

const DB_CONFIG = {
  server: process.env.DB_SERVER || 'localhost',
  port: parseInt(process.env.DB_PORT || '1433', 10),
  database: process.env.DB_DATABASE || 'POS_DB',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    connectTimeout: 15000,
  },
};

function ym(dateStr) {
  return dateStr.slice(0, 7).replace('-', '');
}

function todayKST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

async function safeQuery(pool, label, sqlText) {
  out('');
  out(`--- ${label} ---`);
  try {
    const r = await pool.request().query(sqlText);
    return r.recordset;
  } catch (e) {
    out(`  ERROR: ${e.message}`);
    return null;
  }
}

async function main() {
  out('=== Pitaya probe-goods-table ===');
  out(`time: ${new Date().toISOString()}`);
  out(`DB: ${DB_CONFIG.server}:${DB_CONFIG.port}/${DB_CONFIG.database}`);

  const pool = await sql.connect(DB_CONFIG);

  const goodsCols = await safeQuery(
    pool,
    'Goods columns',
    `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME = 'Goods'
     ORDER BY ORDINAL_POSITION`,
  );
  if (goodsCols?.length) {
    goodsCols.forEach(c => {
      out(`  ${c.COLUMN_NAME} (${c.DATA_TYPE}${c.CHARACTER_MAXIMUM_LENGTH ? `,${c.CHARACTER_MAXIMUM_LENGTH}` : ''})`);
    });
  }

  const cnt = await safeQuery(pool, 'Goods count', 'SELECT COUNT(*) AS cnt FROM Goods');
  if (cnt?.[0]) out(`  total: ${cnt[0].cnt}`);

  const goodsTop = await safeQuery(pool, 'Goods TOP 20', 'SELECT TOP 20 * FROM Goods');
  if (goodsTop?.length) {
    goodsTop.forEach((r, i) => out(`  [${i + 1}] ${JSON.stringify(r)}`));
  } else if (goodsTop) {
    out('  (no rows)');
  }

  const codeCols = await safeQuery(
    pool,
    'Goods code/name-like columns',
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME = 'Goods'
       AND (
         COLUMN_NAME LIKE '%Code%'
         OR COLUMN_NAME LIKE '%Barcode%'
         OR COLUMN_NAME LIKE 'G[_]%'
         OR COLUMN_NAME LIKE '%Name%'
         OR COLUMN_NAME LIKE '%Barcode%'
       )
     ORDER BY COLUMN_NAME`,
  );
  if (codeCols?.length) codeCols.forEach(c => out(`  ${c.COLUMN_NAME}`));

  const dateStr = todayKST();
  const sadTable = `SaD_${ym(dateStr)}`;

  const joinAttempts = [
    ['JOIN Goods ON Barcode', `
      SELECT TOP 10
        d.Barcode AS sale_barcode,
        d.G_Name AS sale_name,
        g.Barcode AS g_barcode,
        g.G_Code,
        g.G_Name
      FROM ${sadTable} d
      LEFT JOIN Goods g ON RTRIM(g.Barcode) = RTRIM(d.Barcode)
      WHERE d.Sale_Date = '${dateStr}' AND d.Sale_YN = 1
      ORDER BY d.TSell_Pri DESC
    `],
    ['JOIN Goods ON G_Code = Barcode', `
      SELECT TOP 10
        d.Barcode AS sale_barcode,
        d.G_Name AS sale_name,
        g.Barcode AS g_barcode,
        g.G_Code,
        g.G_Name
      FROM ${sadTable} d
      LEFT JOIN Goods g ON CAST(g.G_Code AS varchar(40)) = RTRIM(d.Barcode)
      WHERE d.Sale_Date = '${dateStr}' AND d.Sale_YN = 1
      ORDER BY d.TSell_Pri DESC
    `],
    ['JOIN Goods_Info ON Barcode', `
      SELECT TOP 10
        d.Barcode AS sale_barcode,
        d.G_Name AS sale_name,
        i.Barcode AS info_barcode,
        i.goods_name AS info_name,
        i.goods_cate
      FROM ${sadTable} d
      LEFT JOIN Goods_Info i ON RTRIM(i.Barcode) = RTRIM(d.Barcode)
      WHERE d.Sale_Date = '${dateStr}' AND d.Sale_YN = 1
      ORDER BY d.TSell_Pri DESC
    `],
  ];

  for (const [label, q] of joinAttempts) {
    const rows = await safeQuery(pool, label, q);
    if (rows?.length) {
      rows.forEach((r, i) => out(`  [${i + 1}] ${JSON.stringify(r)}`));
    } else if (rows) {
      out('  (no rows)');
    }
  }

  await pool.close();
  fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
  out('');
  out(`Saved: ${OUT_FILE}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

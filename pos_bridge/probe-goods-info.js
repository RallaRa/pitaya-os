/**
 * POS 품목코드·Goods_Info 조사 (조회만, Pitaya 전송 없음)
 * Usage: node probe-goods-info.js
 */
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const OUT_FILE = path.join(__dirname, 'probe-goods-info.txt');
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

async function main() {
  out('=== Pitaya probe-goods-info ===');
  out(`time: ${new Date().toISOString()}`);
  out(`DB: ${DB_CONFIG.server}/${DB_CONFIG.database}`);

  const pool = await sql.connect(DB_CONFIG);

  out('');
  out('--- tables: Goods / Scale / Item / Barcode ---');
  try {
    const t = await pool.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND (
          TABLE_NAME LIKE '%Goods%'
          OR TABLE_NAME LIKE '%Scale%'
          OR TABLE_NAME LIKE '%Item%'
          OR TABLE_NAME LIKE '%Barcode%'
        )
      ORDER BY TABLE_NAME
    `);
    if (!t.recordset.length) out('  (none)');
    else t.recordset.forEach(r => out(`  ${r.TABLE_NAME}`));
  } catch (e) {
    out(`  ERROR: ${e.message}`);
  }

  out('');
  out('--- Goods_Info columns ---');
  try {
    const cols = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Goods_Info'
      ORDER BY ORDINAL_POSITION
    `);
    if (!cols.recordset.length) {
      out('  (table not found or no columns)');
    } else {
      cols.recordset.forEach(c => {
        out(`  ${c.COLUMN_NAME} (${c.DATA_TYPE}${c.CHARACTER_MAXIMUM_LENGTH ? `,${c.CHARACTER_MAXIMUM_LENGTH}` : ''})`);
      });
    }
  } catch (e) {
    out(`  ERROR: ${e.message}`);
  }

  out('');
  out('--- Goods_Info code-like columns ---');
  try {
    const cc = await pool.request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Goods_Info'
        AND (
          COLUMN_NAME LIKE '%Code%'
          OR COLUMN_NAME LIKE '%Barcode%'
          OR COLUMN_NAME LIKE 'G[_]%'
          OR COLUMN_NAME LIKE '%No%'
        )
      ORDER BY COLUMN_NAME
    `);
    cc.recordset.forEach(c => out(`  ${c.COLUMN_NAME}`));
  } catch (e) {
    out(`  ERROR: ${e.message}`);
  }

  out('');
  out('--- Goods_Info count ---');
  try {
    const cnt = await pool.request().query('SELECT COUNT(*) AS cnt FROM Goods_Info');
    out(`  total: ${cnt.recordset[0].cnt}`);
  } catch (e) {
    out(`  ERROR: ${e.message}`);
  }

  out('');
  out('--- Goods_Info TOP 15 ---');
  try {
    const rows = await pool.request().query('SELECT TOP 15 * FROM Goods_Info');
    if (!rows.recordset.length) out('  (no rows)');
    else {
      rows.recordset.forEach((r, i) => {
        out(`  [${i + 1}] ${JSON.stringify(r)}`);
      });
    }
  } catch (e) {
    out(`  ERROR: ${e.message}`);
  }

  const dateStr = todayKST();
  const sadTable = `SaD_${ym(dateStr)}`;
  out('');
  out(`--- ${sadTable} today Barcode sample (TOP 20) ---`);
  try {
    const s = await pool.request()
      .input('date', sql.VarChar(10), dateStr)
      .query(`
        SELECT TOP 20
          Barcode, G_Name, S_Code, S_Name, Sale_Count, TSell_Pri
        FROM ${sadTable}
        WHERE Sale_Date = @date AND Sale_YN = 1
        ORDER BY TSell_Pri DESC
      `);
    if (!s.recordset.length) out('  (no sales today)');
    else {
      s.recordset.forEach((r, i) => {
        out(`  [${i + 1}] barcode=${r.Barcode} name=${r.G_Name} cat=${r.S_Code}/${r.S_Name}`);
      });
    }
  } catch (e) {
    out(`  ERROR: ${e.message}`);
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

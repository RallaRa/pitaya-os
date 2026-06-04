/**
 * 저울 3자리 = POS BarCode(6자리) 뒤 3자리 가설 검증
 * Usage: node probe-scale-code-match.js
 */
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const OUT = path.join(__dirname, 'probe-scale-code-match.txt');
const lines = [];
function out(s) {
  lines.push(s);
  console.log(s);
}

const DB = {
  server: process.env.DB_SERVER || 'localhost',
  port: parseInt(process.env.DB_PORT || '1433', 10),
  database: process.env.DB_DATABASE || 'POS_DB',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  options: { encrypt: false, trustServerCertificate: true, connectTimeout: 15000 },
};

function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '');
}

function last3(bar) {
  const d = digitsOnly(bar);
  return d.length >= 3 ? d.slice(-3) : d.padStart(3, '0');
}

function isSixDigitPosCode(bar) {
  const d = digitsOnly(bar);
  return d.length === 6 && /^[0-9]+$/.test(d);
}

async function main() {
  out('=== 저울3자리 = POS BarCode 뒤3자리 검증 ===');
  out(`time: ${new Date().toISOString()}`);
  const pool = await sql.connect(DB);

  const goods = await pool.request().query(`
    SELECT BarCode, G_Name, Scale_Use, S_Name
    FROM Goods
    WHERE Goods_Use = '1' OR Goods_Use IS NULL
    ORDER BY BarCode
  `);

  const all = goods.recordset;
  const six = all.filter(r => isSixDigitPosCode(r.BarCode));
  const scaleUse = all.filter(r => String(r.Scale_Use) === '1');

  out('');
  out(`--- Goods 전체: ${all.length}건, 6자리숫자 BarCode: ${six.length}건, Scale_Use=1: ${scaleUse.length}건 ---`);

  out('');
  out('--- Scale_Use=1 샘플 (BarCode / 뒤3자리 / 품명) ---');
  scaleUse.slice(0, 30).forEach((r, i) => {
    out(`  [${i + 1}] ${r.BarCode} -> ${last3(r.BarCode)} | ${r.G_Name} | ${r.S_Name || ''}`);
  });

  out('');
  out('--- 6자리 BarCode 중 Scale_Use=1 (뒤3자리 분포) ---');
  const sixScale = six.filter(r => String(r.Scale_Use) === '1');
  out(`  6자리+저울: ${sixScale.length}건`);
  sixScale.slice(0, 25).forEach((r, i) => {
    const b = digitsOnly(r.BarCode);
    out(`  [${i + 1}] ${b} = ${b.slice(0, 3)} + ${b.slice(3)} | 뒤3=${last3(r.BarCode)} | ${r.G_Name}`);
  });

  // 뒤3자리 중복 검사 (6자리만)
  const map3 = new Map();
  six.forEach(r => {
    const k = last3(r.BarCode);
    if (!map3.has(k)) map3.set(k, []);
    map3.get(k).push(r);
  });
  const dupes = [...map3.entries()].filter(([, arr]) => arr.length > 1);
  out('');
  out(`--- 뒤3자리 중복 (6자리 BarCode 기준): ${dupes.length}개 키 ---`);
  dupes.slice(0, 15).forEach(([k, arr]) => {
    out(`  scale3=${k}: ${arr.map(x => `${x.BarCode}(${x.G_Name})`).join(' | ')}`);
  });

  // 오늘 매출 Barcode와 Goods 조인
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  const ym = today.slice(0, 7).replace('-', '');
  const sad = `SaD_${ym}`;

  out('');
  out(`--- 오늘 매출(${today}) Barcode vs Goods.BarCode ---`);
  try {
    const sales = await pool.request().input('d', sql.VarChar(10), today).query(`
      SELECT DISTINCT d.Barcode AS sale_barcode, d.G_Name AS sale_name
      FROM ${sad} d
      WHERE d.Sale_Date = @d AND d.Sale_YN = 1
        AND LEN(REPLACE(d.Barcode,' ','')) >= 3
      ORDER BY d.Barcode
    `);

    let matchFull = 0;
    let matchLast3 = 0;
    let sixSales = 0;
    const samples = [];

    for (const row of sales.recordset) {
      const sb = digitsOnly(row.sale_barcode);
      if (sb.length === 6) sixSales++;
      const gFull = all.find(g => digitsOnly(g.BarCode) === sb);
      const gLast3 = six.find(g => last3(g.BarCode) === last3(sb) && digitsOnly(g.BarCode).length === 6);
      if (gFull) matchFull++;
      if (gLast3 && !gFull) matchLast3++;
      if (samples.length < 20 && sb.length >= 3) {
        const goodsRow = gFull || gLast3;
        samples.push({
          sale: sb,
          saleLast3: last3(sb),
          goods: goodsRow ? digitsOnly(goodsRow.BarCode) : null,
          goodsLast3: goodsRow ? last3(goodsRow.BarCode) : null,
          saleName: row.sale_name,
          goodsName: goodsRow?.G_Name || null,
          fullMatch: !!gFull,
          last3Only: !!gLast3 && !gFull,
        });
      }
    }

    out(`  매출 품목(고유 Barcode): ${sales.recordset.length}건`);
    out(`  그중 6자리: ${sixSales}건`);
    out(`  Goods.BarCode 완전일치: ${matchFull}건`);
    out(`  뒤3자리만 일치(완전불일치): ${matchLast3}건`);

    out('');
    out('--- 매출 샘플 (sale / 뒤3 / goods BarCode / 일치) ---');
    samples.forEach((s, i) => {
      out(
        `  [${i + 1}] sale=${s.sale} 뒤3=${s.saleLast3} | goods=${s.goods || '-'} goods뒤3=${s.goodsLast3 || '-'} | `
        + `${s.fullMatch ? 'FULL' : s.last3Only ? 'LAST3' : 'NO'} | ${s.saleName}`
        + (s.goodsName ? ` <> ${s.goodsName}` : ''),
      );
    });
  } catch (e) {
    out(`  ERROR: ${e.message}`);
  }

  // BarCode 201xxx 패턴: 앞3=201, 뒤3=품목번호?
  out('');
  out('--- 201xxx / 203xxx 패턴 (앞3자리별 개수) ---');
  const prefixCount = {};
  six.forEach(r => {
    const d = digitsOnly(r.BarCode);
    const pre = d.slice(0, 3);
    prefixCount[pre] = (prefixCount[pre] || 0) + 1;
  });
  Object.entries(prefixCount).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([pre, n]) => {
    out(`  ${pre}xxx: ${n}건`);
  });

  out('');
  out('--- 결론 힌트 ---');
  out('  저울번호(3자리) = BarCode 숫자 6자리 중 마지막 3자리 (예: 201036 -> 036)');
  out('  Scale_Use=1 품목은 대부분 201xxx 한우 / 별도 203xxx 등 접두로 구분');
  out('  매출 Barcode가 13자리 EAN이면 뒤3 규칙은 라벨별 별도 규칙 필요');

  await pool.close();
  fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
  out('');
  out(`Saved: ${OUT}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

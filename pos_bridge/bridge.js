/**
 * Pitaya OS - POS 브릿지 v3
 * 포스 PC(Windows) MSSQL → Pitaya OS API 전송
 *
 * 실행 방법:
 *   node bridge.js                      # 오늘 매출 전송
 *   node bridge.js today                # 오늘 데이터 전송 (+ 사원/고객)
 *   node bridge.js realtime             # 30초마다 반복 (+ 사원/고객)
 *   node bridge.js date 2026-05-30      # 특정 날짜
 *   node bridge.js migrate START END    # 기간 마이그레이션
 *   node bridge.js customers            # Cus_Mst 고객 마스터 (레거시)
 *   node bridge.js sync-employees       # 사원정보만 동기화
 *   node bridge.js sync-customers       # Customer_Info 고객 동기화
 *   node bridge.js sync-goods          # Goods 품목→Pitaya 저울코드 동기화
 *   node bridge.js probe-customer-phones # DB 전화 컬럼 원본 확인
 *   node bridge.js probe-unmasked-phones # 마스킹 안 된 전화 컬럼 전체 스캔
 *   node bridge.js probe-member-use     # 사용중 회원 조회 조건 탐색
 *   node bridge.js check-tables         # DB 테이블 확인
 *   node bridge.js --dry-run            # 조회만
 *
 * 사전 설치:
 *   npm install mssql axios dotenv
 */

'use strict';

require('dotenv').config();
const fs    = require('fs');
const path  = require('path');
const sql   = require('mssql');
const axios = require('axios');

const MEMBER_PROBE_OUT = path.join(__dirname, 'find-pos-member-export.txt');

// ── 설정 ──────────────────────────────────────────────────────────
const API_BASE = (process.env.PITAYA_API_URL || 'https://pitaya-osv1.vercel.app/api/pos/sync')
  .replace(/\/api\/pos\/sync$/, '');
const API_URL  = `${API_BASE}/api/pos/sync`;
const CUSTOMERS_API_URL  = `${API_BASE}/api/pos/sync-customers`;
const EMPLOYEES_API_URL  = `${API_BASE}/api/pos/sync-employees`;
const GOODS_API_URL      = `${API_BASE}/api/pos/sync-goods`;
const API_KEY  = process.env.POS_BRIDGE_KEY || '';
const STORE_ID = process.env.STORE_ID       || '';

const DB_CONFIG = {
  server:   process.env.DB_SERVER   || 'localhost',
  port:     parseInt(process.env.DB_PORT || '1433'),
  database: process.env.DB_DATABASE || 'POS_DB',
  user:     process.env.DB_USER     || 'sa',
  password: process.env.DB_PASSWORD || '',
  options: {
    encrypt:                  false,
    trustServerCertificate:   true,
    cryptoCredentialsDetails: { minVersion: 'TLSv1' },
    connectTimeout:           15000,
  },
};

const REALTIME_INTERVAL_MS = parseInt(process.env.REALTIME_INTERVAL_MS || '30000', 10); // 기본 30초
/** realtime 모드에서 고객 전체 동기화 간격 (기본 6시간). 매출은 REALTIME_INTERVAL_MS마다 전송 */
const CUSTOMER_SYNC_EVERY_MS = parseInt(process.env.CUSTOMER_SYNC_EVERY_MS || String(6 * 60 * 60 * 1000), 10);

// ── 유틸 ──────────────────────────────────────────────────────────
const toInt = v => (v == null ? 0 : parseInt(v, 10) || 0);

function log(msg)  { console.log(`[${now()} KST] ${msg}`); }
function warn(msg) { console.warn(`[${now()} KST] ⚠️  ${msg}`); }
function err(msg)  { console.error(`[${now()} KST] ❌ ${msg}`); }

// YYYYMM 추출 (SaT_202605 형식 테이블명용)
function ym(dateStr) {
  return dateStr.slice(0, 7).replace('-', '');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/** 로그·오늘 날짜 — 항상 KST(Asia/Seoul). (UTC toISOString 사용 금지) */
function getKSTTodayYMD(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(date);
}

function now() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
}

// ── DB 연결 ───────────────────────────────────────────────────────
let pool = null;

async function getPool() {
  if (pool) return pool;
  pool = await sql.connect(DB_CONFIG);
  return pool;
}

async function closePool() {
  if (pool) { await pool.close(); pool = null; }
}

// ── 매출 헤더 조회 (SaT_YYYYMM) ──────────────────────────────────
async function fetchHeaders(dateStr) {
  const table = `SaT_${ym(dateStr)}`;
  const p = await getPool();
  const result = await p.request()
    .input('date', sql.VarChar(10), dateStr)
    .query(`
      SELECT
        Sale_Date,
        SUM(TSell_Pri)  AS totalSale,
        SUM(Card_Pri)   AS cardSale,
        SUM(Cash_Pri)   AS cashSale,
        SUM(ProFit_Pri) AS profitSale,
        COUNT(*)        AS tranCount
      FROM ${table}
      WHERE Sale_Date = @date
      GROUP BY Sale_Date
    `);

  if (!result.recordset.length) return [];
  const r = result.recordset[0];
  return [{
    totalSale:  toInt(r.totalSale),
    cardSale:   toInt(r.cardSale),
    cashSale:   toInt(r.cashSale),
    profitPri:  toInt(r.profitSale),
    transCount: toInt(r.tranCount),
  }];
}

// ── SaT Sale_Num → Sale_Time 매핑 ───────────────────────────────
async function fetchSaleTimeMap(dateStr) {
  const table = `SaT_${ym(dateStr)}`;
  const p = await getPool();
  try {
    const result = await p.request()
      .input('date', sql.VarChar(10), dateStr)
      .query(`
        SELECT Sale_Num, Sale_Time,
          SUBSTRING(Sale_Num, 11, 2) as POS_No
        FROM ${table}
        WHERE Sale_Date = @date
      `);
    const map = {};
    for (const r of result.recordset) {
      map[String(r.Sale_Num)] = {
        saleTime: String(r.Sale_Time || '').trim(),
        posNo: String(r.POS_No || '01'),
      };
    }
    return map;
  } catch (e) {
    return {};
  }
}

// ── 매출 상세 조회 (SaD_YYYYMM) ──────────────────────────────────
async function fetchDetails(dateStr, timeMap = {}) {
  const table = `SaD_${ym(dateStr)}`;
  const p = await getPool();
  const result = await p.request()
    .input('date', sql.VarChar(10), dateStr)
    .query(`
      SELECT
        Sale_Num,
        Sale_Date,
        Barcode,
        G_Name,
        S_Code,
        S_Name,
        Sale_Count,
        Sell_Pri,
        TSell_Pri,
        Pur_Pri,
        Profit_Pri
      FROM ${table}
      WHERE Sale_Date = @date
        AND Sale_YN = 1
    `);

  return result.recordset.map(r => {
    const saleNum = String(r.Sale_Num || '');
    const meta = timeMap[saleNum] || {};
    return {
      saleNum,
      saleTime: meta.saleTime || '',
      posNo:    meta.posNo || (saleNum.length >= 12 ? saleNum.substring(10, 12) : '01'),
      barcode:      String(r.Barcode     || ''),
      goodsName:    String(r.G_Name      || ''),
      categoryCode: String(r.S_Code      || ''),
      categoryName: String(r.S_Name      || ''),
      saleCount:    toInt(r.Sale_Count),
      sellPrice:    toInt(r.Sell_Pri),
      totalPrice:   toInt(r.TSell_Pri),
      purPrice:     toInt(r.Pur_Pri),
      profitPrice:  toInt(r.Profit_Pri),
    };
  });
}

// ── 일마감 조회 (Finish_Total) — 다중 POS 전체 합산 ──────────────
async function fetchFinish(dateStr) {
  const p = await getPool();

  // POS별 상세 (로그용)
  let perPos = [];
  try {
    const detail = await p.request()
      .input('date2', sql.VarChar(10), dateStr)
      .query(`
        SELECT
          Pos_No,
          S_ToSale   AS totalSale,
          S_Sale     AS netSale,
          S_CashSale AS cashSale,
          S_CardSale AS cardSale,
          S_ToReCnt  AS returnCount,
          S_ToReSale AS returnSale
        FROM Finish_Total
        WHERE S_SaleDate = @date2
        ORDER BY Pos_No
      `);
    perPos = detail.recordset.map(r => ({
      posNo:       String(r.Pos_No || ''),
      totalSale:   toInt(r.totalSale),
      netSale:     toInt(r.netSale),
      cashSale:    toInt(r.cashSale),
      cardSale:    toInt(r.cardSale),
      returnCount: toInt(r.returnCount),
      returnSale:  toInt(r.returnSale),
    }));
  } catch { /* Pos_No 컬럼 없는 경우 무시 */ }

  // 전체 합산
  const result = await p.request()
    .input('date', sql.VarChar(10), dateStr)
    .query(`
      SELECT
        SUM(S_ToSale)   AS totalSale,
        SUM(S_Sale)     AS netSale,
        SUM(S_CashSale) AS cashSale,
        SUM(S_CardSale) AS cardSale,
        SUM(S_ToReCnt)  AS returnCount,
        SUM(S_ToReSale) AS returnSale,
        SUM(S_CusPoint) AS cusPoint
      FROM Finish_Total
      WHERE S_SaleDate = @date
    `);

  if (!result.recordset.length) return null;
  const r = result.recordset[0];
  if (!toInt(r.totalSale)) return null;

  return {
    totalSale:   toInt(r.totalSale),
    netSale:     toInt(r.netSale) || toInt(r.totalSale),
    cashSale:    toInt(r.cashSale),
    cardSale:    toInt(r.cardSale),
    returnCount: toInt(r.returnCount),
    returnSale:  toInt(r.returnSale),
    cusPoint:    toInt(r.cusPoint),
    perPos,
  };
}

function maskPhone(phone) {
  if (!phone) return null;
  if (String(phone).includes('*')) return phone;
  const str = String(phone).replace(/[^0-9]/g, '');
  if (str.length >= 10) {
    return str.substring(0, 3) + '-****-' + str.substring(str.length - 4);
  }
  return phone;
}

function isMaskedPhone(phone) {
  if (!phone) return true;
  const s = String(phone);
  return s.includes('*') || /x{2,}/i.test(s);
}

/** Cus_Mst Cus_HP 우선 — DB 원본 숫자 */
function pickBestPhone(...candidates) {
  const list = candidates.map(c => String(c || '').trim()).filter(Boolean);
  const full = list.find(p => !isMaskedPhone(p));
  return full || list[0] || '';
}

function normalizePhoneDigits(phone) {
  if (!phone || isMaskedPhone(phone)) return '';
  const d = String(phone).replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('1')) return '0' + d;
  if (d.length >= 9 && d.length <= 11) return d;
  return '';
}

function auditCustomerPhones(customers) {
  let fullCount = 0;
  let maskedCount = 0;
  let emptyCount = 0;
  let recoverableFromMst = 0;

  for (const c of customers) {
    const mobile = String(c.mobile || '');
    const tel = String(c.tel || '');
    const cusHp = String(c.cusHp || '');
    const digits = normalizePhoneDigits(pickBestPhone(cusHp, tel, mobile));

    if (!digits && !mobile && !tel && !cusHp) { emptyCount++; continue; }
    if (digits) fullCount++;
    else {
      maskedCount++;
      if ((isMaskedPhone(mobile) || isMaskedPhone(tel)) && cusHp && !isMaskedPhone(cusHp)) {
        recoverableFromMst++;
      }
    }
  }

  log(`전화 원본 숫자: ${fullCount}명 | DB 마스킹만: ${maskedCount}명 | 빈값: ${emptyCount}명`);
  if (recoverableFromMst > 0) {
    log(`Cus_Mst(Cus_HP)로 복구 가능: ${recoverableFromMst}명`);
  }
  if (maskedCount > 0 && fullCount === 0) {
    warn('Customer_Info 전화가 전부 마스킹입니다. Cus_Mst 조인·Cus_HP 컬럼을 확인하세요.');
  }
}

// ── 사원 조회 (Admin_User) ───────────────────────────────────────
async function fetchEmployees(pool) {
  try {
    const result = await pool.request().query(`
      SELECT
        User_ID        as userId,
        User_Name      as name,
        Job_Position   as jobPosition,
        PayMent_Gubun  as paymentType,
        Salary         as salary,
        Tel1           as tel1,
        Tel2           as tel2,
        Enter_Date     as enterDate,
        Retire_Date    as retireDate,
        Admin_Gubun    as adminGrade,
        OFFICE_CODE    as officeCode,
        Write_Date     as writeDate,
        Edit_Date      as editDate
      FROM Admin_User
      WHERE Gubun = '1'
      ORDER BY User_ID
    `);
    log(`사원 정보 ${result.recordset.length}명 조회`);
    return result.recordset;
  } catch (e) {
    log('사원 조회 실패: ' + e.message);
    return [];
  }
}

// ── 고객 조회 (Customer_Info + Cus_Mst Cus_HP 원본) ───────────────
async function fetchCustomerInfo(pool) {
  const sqlJoin = `
    SELECT
      ci.Cus_Code       as cusCode,
      ci.Cus_Name       as name,
      ci.Cus_Gubun      as cusGubun,
      ci.Cus_Class      as cusClass,
      ci.Cus_Mobile     as mobile,
      ci.Cus_Tel        as tel,
      cm.Cus_HP         as cusHp,
      ci.Cus_BirDay     as birthday,
      ci.Mem_Day        as joinDate,
      ci.Vis_Date       as lastVisitDate,
      ci.last_eDATE     as lastEventDate,
      ci.Cus_Point      as point,
      ci.Cus_TPoint     as totalPoint,
      ci.Cus_UsePoint   as usedPoint,
      ci.Pur_Pri        as totalPurchase,
      ci.Dec_Pri        as totalDiscount,
      ci.Vis_Count      as visitCount,
      ci.cPoint_Use     as pointUseYn,
      ci.Cus_Use        as isActive,
      ci.Email          as email,
      ci.en_uKey2       as enUKey2
    FROM Customer_Info ci
    LEFT JOIN Cus_Mst cm ON ci.Cus_Code = cm.Cus_Code
    WHERE ci.Cus_Use = '1'
    ORDER BY ci.Vis_Date DESC
  `;

  const sqlPlain = `
    SELECT
      Cus_Code       as cusCode,
      Cus_Name       as name,
      Cus_Gubun      as cusGubun,
      Cus_Class      as cusClass,
      Cus_Mobile     as mobile,
      Cus_Tel        as tel,
      Cus_BirDay     as birthday,
      Mem_Day        as joinDate,
      Vis_Date       as lastVisitDate,
      last_eDATE     as lastEventDate,
      Cus_Point      as point,
      Cus_TPoint     as totalPoint,
      Cus_UsePoint   as usedPoint,
      Pur_Pri        as totalPurchase,
      Dec_Pri        as totalDiscount,
      Vis_Count      as visitCount,
      cPoint_Use     as pointUseYn,
      Cus_Use        as isActive,
      Email          as email,
      en_uKey2       as enUKey2
    FROM Customer_Info
    WHERE Cus_Use = '1'
    ORDER BY Vis_Date DESC
  `;

  try {
    let result;
    try {
      result = await pool.request().query(sqlJoin);
      log(`고객 정보 ${result.recordset.length}명 (Customer_Info + Cus_Mst Cus_HP)`);
    } catch (joinErr) {
      warn('Cus_Mst JOIN 실패, Customer_Info 단독 조회: ' + joinErr.message);
      result = await pool.request().query(sqlPlain);
      log(`고객 정보 ${result.recordset.length}명 (Customer_Info만)`);
    }
    return result.recordset;
  } catch (e) {
    log('고객 조회 실패: ' + e.message);
    return [];
  }
}

// ── 고객 마스터 조회 (Cus_Mst, 레거시) ───────────────────────────
async function fetchCusMstCustomers() {
  const p = await getPool();
  const result = await p.request().query(`
    SELECT
      Cus_Code, Cus_Name, Cus_HP, Cus_Birth, Cus_Grade,
      Cus_Point, Write_Date
    FROM Cus_Mst
    WHERE Cus_YN = 1
  `);
  return result.recordset.map(r => ({
    Cus_Code:   String(r.Cus_Code  || '').trim(),
    Cus_Name:   String(r.Cus_Name  || '').trim(),
    Cus_HP:     String(r.Cus_HP    || '').trim(),
    Cus_Birth:  String(r.Cus_Birth || '').trim(),
    Cus_Grade:  String(r.Cus_Grade || '').trim(),
    Cus_Point:  toInt(r.Cus_Point),
    Write_Date: r.Write_Date
      ? new Date(r.Write_Date).toISOString().slice(0, 10)
      : '',
  }));
}

// ── 당일 고객 구매이력 조회 (SaT_YYYYMM 기반) ────────────────────
async function fetchCustomerSales(dateStr) {
  const table = `SaT_${ym(dateStr)}`;
  const p = await getPool();
  try {
    const result = await p.request()
      .input('date', sql.VarChar(10), dateStr)
      .query(`
        SELECT
          Cus_Code,
          @date         AS Sale_Date,
          SUM(TSell_Pri) AS totalSale,
          COUNT(*)       AS visitCount
        FROM ${table}
        WHERE Sale_Date = @date
          AND Cus_Code IS NOT NULL
          AND Cus_Code <> ''
        GROUP BY Cus_Code
      `);
    return result.recordset.map(r => ({
      Cus_Code:   String(r.Cus_Code  || '').trim(),
      Sale_Date:  dateStr,
      totalSale:  toInt(r.totalSale),
      visitCount: toInt(r.visitCount),
    })).filter(r => r.Cus_Code);
  } catch {
    return [];
  }
}

// ── 고객 마스터 전송 ──────────────────────────────────────────────
async function sendCustomersToApi(customers) {
  const CHUNK = 500;
  let total = 0, failed = 0;
  for (let i = 0; i < customers.length; i += CHUNK) {
    const chunk = customers.slice(i, i + CHUNK);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await axios.post(CUSTOMERS_API_URL, {
          storeId: STORE_ID,
          customers: chunk,
          syncedAt: new Date().toISOString(),
        }, {
          headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
          timeout: 60000,
        });
        if (res.data?.success) { total += res.data.saved || chunk.length; break; }
        if (attempt === 3) failed += chunk.length;
      } catch (e) {
        if (attempt < 3) await sleep(5000);
        else failed += chunk.length;
      }
    }
  }
  return { total, failed };
}

// ── POS Goods 품목 마스터 ─────────────────────────────────────────
function digitsOnlyBar(s) {
  return String(s || '').replace(/\D/g, '');
}

function isSixDigitBar(bar) {
  const d = digitsOnlyBar(bar);
  return d.length === 6 && /^[0-9]+$/.test(d);
}

async function fetchGoodsMaster(pool) {
  const result = await pool.request().query(`
    SELECT BarCode, G_Name, S_Code, S_Name, Scale_Use, Sell_Pri, Goods_Use
    FROM Goods
    WHERE (Goods_Use = '1' OR Goods_Use IS NULL)
    ORDER BY BarCode
  `);
  return result.recordset
    .map(r => ({
      posBarCode:   digitsOnlyBar(r.BarCode).padStart(6, '0').slice(-6),
      name:         String(r.G_Name || '').trim(),
      categoryCode: String(r.S_Code || '').trim(),
      categoryName: String(r.S_Name || '').trim(),
      scaleUse:     String(r.Scale_Use || '').trim(),
      sellPri:      toInt(r.Sell_Pri),
    }))
    .filter(g => isSixDigitBar(g.posBarCode))
    .map(g => ({ ...g, name: g.name || g.posBarCode }));
}

async function sendGoodsToApi(goodsList) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.post(GOODS_API_URL, {
        storeId: STORE_ID,
        goods: goodsList,
        syncedAt: new Date().toISOString(),
      }, {
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 180000,
      });
      if (res.data?.success) {
        return {
          synced: res.data.synced || 0,
          pendingGroups: res.data.pendingGroups || 0,
          pendingItems: res.data.pendingItems || 0,
        };
      }
      if (attempt === 3) throw new Error(JSON.stringify(res.data));
    } catch (e) {
      if (attempt < 3) await sleep(5000);
      else throw e;
    }
  }
  return { synced: 0, pendingGroups: 0, pendingItems: 0 };
}

async function syncGoods(pool) {
  log('━━━ POS 품목(Goods) → Pitaya 저울코드 동기화 ━━━');
  const goods = await fetchGoodsMaster(pool);
  log(`6자리 품목코드 ${goods.length}건 조회`);
  if (!goods.length) {
    warn('동기화할 6자리 BarCode 없음');
    return;
  }
  const { synced, pendingGroups, pendingItems } = await sendGoodsToApi(goods);
  log(`✅ 저울코드 반영 ${synced}건 | 펜딩(뒤3자리 중복) ${pendingGroups}그룹 ${pendingItems}건`);
}

// ── 사원 정보 동기화 ──────────────────────────────────────────────
async function syncEmployees(pool) {
  log('━━━ 사원 정보 동기화 시작 ━━━');
  const employees = await fetchEmployees(pool);
  if (employees.length === 0) {
    log('사원 정보 없음');
    return;
  }

  const processed = employees.map(emp => ({
    userId:       String(emp.userId       || '').trim(),
    name:         String(emp.name         || '').trim(),
    jobPosition:  String(emp.jobPosition  || '').trim(),
    paymentType:  String(emp.paymentType  || '').trim(),
    salary:       toInt(emp.salary),
    enterDate:    String(emp.enterDate    || '').trim(),
    retireDate:   String(emp.retireDate   || '').trim(),
    adminGrade:   String(emp.adminGrade   || '').trim(),
    officeCode:   String(emp.officeCode   || '').trim(),
    writeDate:    emp.writeDate ? String(emp.writeDate) : '',
    editDate:     emp.editDate  ? String(emp.editDate)  : '',
    tel1Masked:   maskPhone(emp.tel1),
    tel2Masked:   maskPhone(emp.tel2),
    storeId:      STORE_ID,
    syncedAt:     new Date().toISOString(),
    source:       'pos_bridge',
  })).filter(e => e.userId);

  try {
    await axios.post(
      EMPLOYEES_API_URL,
      { storeId: STORE_ID, employees: processed },
      {
        headers: {
          Authorization:  `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );
    log(`✅ 사원정보 ${processed.length}명 동기화 완료`);
  } catch (e) {
    err(`사원정보 전송 실패: ${e.message}`);
  }
}

// ── 고객 정보 동기화 (Customer_Info) ─────────────────────────────
async function syncCustomers(pool) {
  log('━━━ 고객 정보 동기화 시작 (원본 전화번호) ━━━');
  const customers = await fetchCustomerInfo(pool);
  if (customers.length === 0) {
    log('고객 정보 없음');
    return;
  }

  auditCustomerPhones(customers);

  const batchSize = 400;
  let totalSynced = 0;

  for (let i = 0; i < customers.length; i += batchSize) {
    const batch = customers.slice(i, i + batchSize).map(c => {
      const rawBest = pickBestPhone(c.cusHp, c.tel, c.mobile);
      const phoneFull = normalizePhoneDigits(rawBest);
      return {
        cusCode:        String(c.cusCode        || '').trim(),
        name:           String(c.name           || '').trim(),
        cusGubun:       String(c.cusGubun       || '').trim(),
        cusClass:       String(c.cusClass       || '').trim(),
        mobile:         String(c.mobile         || '').trim(),
        tel:            String(c.tel            || '').trim(),
        cusHp:          String(c.cusHp          || '').trim(),
        phoneFull,
        birthday:       String(c.birthday       || '').trim(),
        joinDate:       String(c.joinDate       || '').trim(),
        lastVisitDate:  String(c.lastVisitDate  || '').trim(),
        lastEventDate:  String(c.lastEventDate  || '').trim(),
        point:          toInt(c.point),
        totalPoint:     toInt(c.totalPoint),
        usedPoint:      toInt(c.usedPoint),
        totalPurchase:  toInt(c.totalPurchase),
        totalDiscount:  toInt(c.totalDiscount),
        visitCount:     toInt(c.visitCount),
        pointUseYn:     String(c.pointUseYn     || '').trim(),
        isActive:       String(c.isActive       || '1').trim(),
        email:          String(c.email          || '').trim(),
        enUKey2:        String(c.enUKey2        || '').trim(),
      };
    }).filter(c => c.cusCode);

    try {
      await axios.post(
        CUSTOMERS_API_URL,
        { storeId: STORE_ID, customers: batch, syncedAt: new Date().toISOString() },
        {
          headers: {
            Authorization:  `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      );
      totalSynced += batch.length;
      log(`고객 배치 전송: ${totalSynced}/${customers.length}`);
    } catch (e) {
      err(`고객 배치 전송 실패 (${i}~${i + batchSize}): ${e.message}`);
    }
  }

  log(`✅ 고객정보 총 ${totalSynced}명 동기화 완료`);
}

// ── POS 「사용」 회원 조회 조건 탐색 ───────────────────────────────
async function probeMemberUse(pool) {
  const lines = [];
  const out = (m) => {
    lines.push(m);
    log(m);
  };

  out(`=== probe-member-use ${new Date().toISOString()} ===`);
  out(`TARGET: POS excel export count = 2828 (사용 기준)`);
  out('');

  async function cnt(label, query) {
    try {
      const r = await pool.request().query(query);
      const n = r.recordset[0].cnt ?? r.recordset[0].CNT ?? Object.values(r.recordset[0])[0];
      out(`  ${label}: ${n}`);
      return Number(n);
    } catch (e) {
      out(`  ${label}: ERROR ${e.message}`);
      return null;
    }
  }

  out('--- Customer_Info counts ---');
  const total = await cnt('total rows', 'SELECT COUNT(*) AS cnt FROM Customer_Info');
  await cnt("Cus_Use = '1'", "SELECT COUNT(*) AS cnt FROM Customer_Info WHERE Cus_Use = '1'");
  await cnt("Cus_Use = '0'", "SELECT COUNT(*) AS cnt FROM Customer_Info WHERE Cus_Use = '0'");
  await cnt('Cus_Use NULL or empty', "SELECT COUNT(*) AS cnt FROM Customer_Info WHERE Cus_Use IS NULL OR Cus_Use = ''");
  await cnt('en_uKey2 present', "SELECT COUNT(*) AS cnt FROM Customer_Info WHERE en_uKey2 IS NOT NULL AND en_uKey2 <> ''");
  await cnt('Cus_Mobile has * (masked)', "SELECT COUNT(*) AS cnt FROM Customer_Info WHERE Cus_Mobile LIKE '%*%'");
  await cnt('Cus_Mobile 11 digits no *', "SELECT COUNT(*) AS cnt FROM Customer_Info WHERE Cus_Mobile NOT LIKE '%*%' AND LEN(REPLACE(REPLACE(Cus_Mobile,'-',''),' ','')) = 11");

  out('');
  out('--- Cus_Use distribution ---');
  try {
    const dist = await pool.request().query(`
      SELECT ISNULL(NULLIF(RTRIM(Cus_Use), ''), '(empty)') AS Cus_Use, COUNT(*) AS cnt
      FROM Customer_Info
      GROUP BY Cus_Use
      ORDER BY cnt DESC
    `);
    dist.recordset.forEach(r => out(`  Cus_Use=[${r.Cus_Use}] → ${r.cnt}`));
  } catch (e) {
    out(`  ERROR: ${e.message}`);
  }

  out('');
  out('--- Match 2828? (filter candidates) ---');
  const candidates = [
    ["Cus_Use='1'", "SELECT COUNT(*) AS cnt FROM Customer_Info WHERE Cus_Use = '1'"],
    ["Cus_Use='1' AND en_uKey2<>''", "SELECT COUNT(*) AS cnt FROM Customer_Info WHERE Cus_Use = '1' AND en_uKey2 IS NOT NULL AND en_uKey2 <> ''"],
    ["Cus_Use IN ('1','Y')", "SELECT COUNT(*) AS cnt FROM Customer_Info WHERE Cus_Use IN ('1','Y')"],
    ["Cus_Use <> '0' OR NULL", "SELECT COUNT(*) AS cnt FROM Customer_Info WHERE Cus_Use IS NULL OR Cus_Use <> '0'"],
    ['all rows', 'SELECT COUNT(*) AS cnt FROM Customer_Info'],
  ];
  for (const [label, q] of candidates) {
    const n = await cnt(label, q);
    if (n === 2828) out(`  >>> MATCH 2828: ${label}`);
  }

  out('');
  out('--- bridge.js fetchCustomerInfo (current) ---');
  try {
    const list = await fetchCustomerInfo(pool);
    out(`  rows returned: ${list.length} (WHERE Cus_Use='1' ORDER BY Vis_Date DESC)`);
    list.slice(0, 5).forEach((c, i) => {
      out(`  [${i + 1}] ${c.cusCode} mobile=${c.mobile || '-'} vis=${c.lastVisitDate || '-'}`);
    });
  } catch (e) {
    out(`  ERROR: ${e.message}`);
  }

  out('');
  out('--- ORDER BY Cus_Code TOP 5 (excel order guess) ---');
  try {
    const r = await pool.request().query(`
      SELECT TOP 5 Cus_Code, Cus_Name, Cus_Mobile, Cus_Use, Vis_Date
      FROM Customer_Info WHERE Cus_Use = '1'
      ORDER BY Cus_Code
    `);
    r.recordset.forEach((row, i) => {
      out(`  [${i + 1}] ${row.Cus_Code} ${row.Cus_Mobile} use=${row.Cus_Use}`);
    });
  } catch (e) {
    out(`  ERROR: ${e.message}`);
  }

  out('');
  out('--- Active-related columns on Customer_Info ---');
  try {
    const cols = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Customer_Info'
        AND (COLUMN_NAME LIKE '%Use%' OR COLUMN_NAME LIKE '%YN%' OR COLUMN_NAME LIKE '%Active%'
          OR COLUMN_NAME LIKE '%Del%' OR COLUMN_NAME LIKE '%Stop%' OR COLUMN_NAME LIKE '%Stat%')
      ORDER BY COLUMN_NAME
    `);
    cols.recordset.forEach(c => out(`  ${c.COLUMN_NAME} (${c.DATA_TYPE})`));
  } catch (e) {
    out(`  ERROR: ${e.message}`);
  }

  out('');
  out('--- SQL modules referencing Customer_Info + Cus_Use ---');
  try {
    const mods = await pool.request().query(`
      SELECT TOP 30 o.type_desc, o.name
      FROM sys.sql_modules m
      JOIN sys.objects o ON m.object_id = o.object_id
      WHERE m.definition LIKE '%Customer_Info%'
        AND m.definition LIKE '%Cus_Use%'
      ORDER BY o.type_desc, o.name
    `);
    if (!mods.recordset.length) out('  (none found — logic may be in POS app EXE, not SQL proc)');
    mods.recordset.forEach(r => out(`  ${r.type_desc}: ${r.name}`));
  } catch (e) {
    out(`  ERROR: ${e.message}`);
  }

  out('');
  out('--- Objects named Cus / Customer / Member ---');
  try {
    const objs = await pool.request().query(`
      SELECT o.type_desc, o.name
      FROM sys.objects o
      WHERE o.type IN ('P','FN','IF','TF','V')
        AND (o.name LIKE '%Cus%' OR o.name LIKE '%Customer%' OR o.name LIKE '%Member%')
      ORDER BY o.type_desc, o.name
    `);
    objs.recordset.slice(0, 40).forEach(r => out(`  ${r.type_desc}: ${r.name}`));
    if (objs.recordset.length > 40) out(`  ... +${objs.recordset.length - 40} more`);
  } catch (e) {
    out(`  ERROR: ${e.message}`);
  }

  out('');
  out('--- Admin_Option (POS settings) ---');
  try {
    const opt = await pool.request().query('SELECT opt_ID, opt_YN FROM Admin_Option ORDER BY opt_ID');
    opt.recordset.forEach(r => out(`  opt_ID=${r.opt_ID} opt_YN=${r.opt_YN}`));
  } catch (e) {
    out(`  ERROR: ${e.message}`);
  }

  out('');
  out('--- Conclusion hints ---');
  if (total != null) out(`  DB total=${total}, POS excel=2828, bridge sync uses Cus_Use='1'`);
  out('  Decrypted phone in excel: POS COM Hyeongryeol.StringEncrypter / Ko3des (not raw SQL column)');
  out('  Next: SQL Profiler while POS [사용] search + excel, or run find-pos-member-export.ps1 for EXE strings');
  out('');
  out(`Saved: ${MEMBER_PROBE_OUT}`);

  fs.writeFileSync(MEMBER_PROBE_OUT, lines.join('\n'), 'utf8');
}

// ── 마스킹되지 않은 전화번호 DB 전역 탐색 ─────────────────────────
async function probeUnmaskedPhones(pool) {
  log('======== 마스킹되지 않은 전화번호 탐색 ========');

  log('--- Customer_Info 요약 (Cus_Use=1) ---');
  try {
    const ci = await pool.request().query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN Cus_Mobile NOT LIKE '%*%' AND Cus_Mobile NOT LIKE '%x%'
          AND LEN(REPLACE(REPLACE(REPLACE(RTRIM(Cus_Mobile),'-',''),' ',''),'.','')) BETWEEN 10 AND 11
          THEN 1 ELSE 0 END) AS mobile_plain,
        SUM(CASE WHEN Cus_Tel NOT LIKE '%*%' AND Cus_Tel NOT LIKE '%x%'
          AND LEN(REPLACE(REPLACE(REPLACE(RTRIM(Cus_Tel),'-',''),' ',''),'.','')) BETWEEN 9 AND 11
          THEN 1 ELSE 0 END) AS tel_plain,
        SUM(CASE WHEN Cus_Mobile LIKE '%*%' OR Cus_Mobile LIKE '%x%' THEN 1 ELSE 0 END) AS mobile_masked,
        SUM(CASE WHEN en_uKey2 IS NOT NULL AND RTRIM(en_uKey2) <> '' THEN 1 ELSE 0 END) AS has_ukey2
      FROM Customer_Info
      WHERE Cus_Use = '1'
    `);
    const c = ci.recordset[0];
    log(`  사용고객 ${c.total}명 | Cus_Mobile 원본 ${c.mobile_plain}명 | Cus_Tel 원본 ${c.tel_plain}명 | 마스킹 ${c.mobile_masked}명 | en_uKey2 ${c.has_ukey2}명`);
  } catch (e) {
    warn(`Customer_Info 요약 실패: ${e.message}`);
  }

  log('');
  log('--- Cus_Mobile 원본 샘플 (최대 20명) ---');
  try {
    const samples = await pool.request().query(`
      SELECT TOP 20 Cus_Code, Cus_Name, Cus_Mobile, Cus_Tel
      FROM Customer_Info
      WHERE Cus_Use = '1'
        AND Cus_Mobile NOT LIKE '%*%' AND Cus_Mobile NOT LIKE '%x%'
        AND LEN(REPLACE(REPLACE(REPLACE(RTRIM(Cus_Mobile),'-',''),' ',''),'.','')) BETWEEN 10 AND 11
      ORDER BY Cus_Code
    `);
    if (!samples.recordset.length) {
      warn('  Cus_Mobile 원본 없음 — 전부 마스킹이거나 en_uKey2만 있음');
    } else {
      samples.recordset.forEach(r => {
        log(`  ${r.Cus_Code} | ${r.Cus_Name} | mobile=${r.Cus_Mobile} tel=${r.Cus_Tel || '-'}`);
      });
    }
  } catch (e) {
    warn(`샘플 조회 실패: ${e.message}`);
  }

  log('');
  log('--- en_uKey2 샘플 (암호화 전화, 복호화 필요) ---');
  try {
    const ukeys = await pool.request().query(`
      SELECT TOP 8 Cus_Code, Cus_Name, Cus_Mobile, en_uKey2
      FROM Customer_Info
      WHERE en_uKey2 IS NOT NULL AND RTRIM(en_uKey2) <> ''
      ORDER BY Cus_Code
    `);
    log(`  en_uKey2 보유 (전체는 probe-en-ukey 참고)`);
    ukeys.recordset.forEach(r => {
      const u2 = String(r.en_uKey2 || '');
      log(`  ${r.Cus_Code} | mask=${r.Cus_Mobile} | en_uKey2=${u2.length > 36 ? u2.slice(0, 36) + '...' : u2}`);
    });
  } catch (e) {
    warn(`en_uKey2 샘플 실패: ${e.message}`);
  }

  log('');
  log('--- 전화 관련 컬럼 전 테이블 스캔 ---');
  const hits = [];
  try {
    const cols = await pool.request().query(`
      SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo'
        AND DATA_TYPE IN ('varchar','nvarchar','char','nchar','text','ntext')
        AND (
          COLUMN_NAME LIKE '%HP%'
          OR COLUMN_NAME LIKE '%Mobile%'
          OR COLUMN_NAME LIKE '%Tel%'
          OR COLUMN_NAME LIKE '%Phone%'
          OR COLUMN_NAME LIKE '%uKey%'
        )
      ORDER BY TABLE_NAME, COLUMN_NAME
    `);

    for (const col of cols.recordset) {
      const table = col.TABLE_NAME;
      const column = col.COLUMN_NAME;
      try {
        const r = await pool.request().query(`
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN [${column}] IS NOT NULL AND RTRIM(CAST([${column}] AS NVARCHAR(100))) <> ''
              AND CAST([${column}] AS NVARCHAR(100)) NOT LIKE '%*%'
              AND CAST([${column}] AS NVARCHAR(100)) NOT LIKE '%x%'
              AND LEN(REPLACE(REPLACE(REPLACE(RTRIM(CAST([${column}] AS NVARCHAR(50))),'-',''),' ',''),'.','')) BETWEEN 10 AND 11
              THEN 1 ELSE 0 END) AS plain_cnt
          FROM [${table}]
        `);
        const total = Number(r.recordset[0].total ?? 0);
        const plain = Number(r.recordset[0].plain_cnt ?? 0);
        if (plain > 0) {
          log(`  ✅ ${table}.${column}: 원본 ${plain}건 / 전체 ${total}건`);
          hits.push({ table, column, plain, total });
        }
      } catch (e) {
        log(`  · ${table}.${column}: 스킵 (${e.message})`);
      }
    }
  } catch (e) {
    warn(`컬럼 스캔 실패: ${e.message}`);
  }

  log('');
  log('--- Cus / Customer 테이블 ---');
  try {
    const tables = await pool.request().query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND (TABLE_NAME LIKE '%Cus%' OR TABLE_NAME LIKE '%Customer%' OR TABLE_NAME LIKE '%Member%')
      ORDER BY TABLE_NAME
    `);
    tables.recordset.forEach(t => log(`  ${t.TABLE_NAME}`));
  } catch (e) {
    warn(`테이블 목록 실패: ${e.message}`);
  }

  for (const tname of ['Cus_Mst', 'Cus_MST', 'Customer_Mst', 'CUS_MST', 'Member_Mst']) {
    try {
      const r = await pool.request().query(`SELECT COUNT(*) AS cnt FROM [${tname}]`);
      log(`  ✅ 테이블 ${tname}: ${r.recordset[0].cnt}건`);
      try {
        const hp = await pool.request().query(`
          SELECT TOP 5 Cus_Code, Cus_HP, Cus_Name
          FROM [${tname}]
          WHERE Cus_HP IS NOT NULL AND RTRIM(Cus_HP) <> ''
            AND Cus_HP NOT LIKE '%*%'
            AND LEN(REPLACE(REPLACE(RTRIM(Cus_HP),'-',''),' ','')) BETWEEN 10 AND 11
        `);
        hp.recordset.forEach(row => log(`      ${row.Cus_Code} | ${row.Cus_Name || ''} | HP=${row.Cus_HP}`));
      } catch (hpErr) {
        log(`      Cus_HP 컬럼 없음 또는 조회 실패: ${hpErr.message}`);
      }
    } catch {
      /* table missing */
    }
  }

  log('');
  const list = await fetchCustomerInfo(pool);
  auditCustomerPhones(list);

  if (hits.length) {
    log(`결론: SQL 원본 전화 ${hits.length}개 컬럼 발견 → bridge Cus_HP/해당 컬럼 조인 검토`);
    hits.slice(0, 5).forEach(h => log(`  → ${h.table}.${h.column} (${h.plain}건)`));
  } else {
    warn('결론: SQL에 10~11자리 원본 전화 없음 → en_uKey2 COM 복호화(find-ukey2-phase9.ps1) 경로');
  }
  log('======== 탐색 완료 ========');
}

// ── DB 테이블 확인 ────────────────────────────────────────────────
async function checkTables(pool) {
  const tables = ['Admin_User', 'Customer_Info', 'Finish_Total'];
  for (const table of tables) {
    try {
      const result = await pool.request().query(`SELECT COUNT(*) AS cnt FROM ${table}`);
      log(`${table}: ${result.recordset[0].cnt}건`);
    } catch (e) {
      warn(`${table} 조회 실패: ${e.message}`);
    }
  }
  const today = getKSTTodayYMD();
  try {
    const sat = await fetchHeaders(today);
    log(`SaT_${ym(today)} 오늘 헤더: ${sat.length ? sat[0].totalSale.toLocaleString() + '원' : '없음'}`);
  } catch (e) {
    warn(`SaT 조회 실패: ${e.message}`);
  }
}

// ── 날씨 조회 (open-meteo 무료 API) ──────────────────────────────
async function fetchWeather(dateStr) {
  try {
    const today = getKSTTodayYMD();
    const base = dateStr < today
      ? 'https://archive-api.open-meteo.com/v1/archive'
      : 'https://api.open-meteo.com/v1/forecast';

    const url = `${base}?latitude=37.5509&longitude=126.8495` +
      `&start_date=${dateStr}&end_date=${dateStr}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode` +
      `&timezone=Asia%2FSeoul`;

    const res = await axios.get(url, { timeout: 10000 });
    const d = res.data.daily;
    if (!d) return null;

    const code = d.weathercode?.[0] ?? 0;
    const condition =
      code === 0 ? '맑음' :
      code <= 3  ? '구름' :
      code <= 48 ? '안개' :
      code <= 67 ? '비'   :
      code <= 77 ? '눈'   :
      code <= 82 ? '소나기' : '흐림';

    return {
      tempMax:     Math.round(d.temperature_2m_max?.[0] ?? 0),
      tempMin:     Math.round(d.temperature_2m_min?.[0] ?? 0),
      rainMm:      Math.round((d.precipitation_sum?.[0] ?? 0) * 10) / 10,
      condition,
      weatherCode: code,
    };
  } catch (e) {
    warn(`날씨 조회 실패 [${dateStr}]: ${e.message}`);
    return null;
  }
}

// ── 시간대별 매출 (SaT 시간·POS 집계) ────────────────────────────
async function fetchTimeSlots(dateStr) {
  const table = `SaT_${ym(dateStr)}`;
  const p = await getPool();
  try {
    const result = await p.request()
      .input('date', sql.VarChar(10), dateStr)
      .query(`
        SELECT
          SUBSTRING(Sale_Num, 11, 2) as POS_No,
          LEFT(Sale_Time, 2) as Hour,
          SUM(TSell_Pri) as totalSale,
          COUNT(*) as tranCount
        FROM ${table}
        WHERE Sale_Date = @date
        GROUP BY SUBSTRING(Sale_Num, 11, 2), LEFT(Sale_Time, 2)
        ORDER BY Hour
      `);
    return result.recordset.map(r => ({
      posNo:     String(r.POS_No || '01'),
      hour:      String(r.Hour   || '00'),
      totalSale: toInt(r.totalSale),
      tranCount: toInt(r.tranCount),
    }));
  } catch (e) {
    warn(`시간대별 조회 실패 [${dateStr}]: ${e.message}`);
    return [];
  }
}

// ── API 전송 ──────────────────────────────────────────────────────
async function sendToApi(payload) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await axios.post(API_URL, payload, {
        headers: {
          Authorization:  `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });

      if (res.data?.success) {
        const s = res.data.saved || {};
        log(`✅ 전송 성공 | 헤더:${s.headers}건 상세:${s.details}건 마감:${s.finish} 리포트:${s.dailyReport}`);
        return true;
      }
      warn(`응답 오류: ${JSON.stringify(res.data)}`);
    } catch (e) {
      warn(`네트워크 오류 (${attempt}/3): ${e.message}`);
      if (attempt < 3) await sleep(5000);
    }
  }
  return false;
}

// ── 단일 날짜 동기화 ──────────────────────────────────────────────
async function syncDate(dateStr, dryRun) {
  log(`-------- ${dateStr} 동기화 시작 --------`);

  let headers, details, finish, weather, customerSales, timeSlots;
  try {
    const timeMap = await fetchSaleTimeMap(dateStr);
    [headers, details, finish, weather, customerSales, timeSlots] = await Promise.all([
      fetchHeaders(dateStr),
      fetchDetails(dateStr, timeMap),
      fetchFinish(dateStr),
      fetchWeather(dateStr),
      fetchCustomerSales(dateStr),
      fetchTimeSlots(dateStr),
    ]);
  } catch (e) {
    err(`DB 조회 실패 [${dateStr}]: ${e.message}`);
    return false;
  }

  const satTotal = headers[0]?.totalSale || 0;
  const isClosed = !!(finish && finish.totalSale > 0);

  log(
    `DB 조회 완료 | SaT합계:${satTotal.toLocaleString()}원 ` +
    `품목:${details.length}건 ` +
    `일마감:${isClosed ? `${finish.totalSale.toLocaleString()}원 ✓` : '미마감'} ` +
    `고객:${customerSales.length}명 ` +
    `날씨:${weather ? `${weather.condition} ${weather.tempMin}°~${weather.tempMax}°` : '-'}`
  );

  // 헤더도 없고 상세도 없고 마감도 없으면 전송 건너뜀
  if (!headers.length && !details.length && !finish) {
    warn(`${dateStr} 데이터 없음 — 건너뜀`);
    return true;
  }

  const payload = {
    storeId:  STORE_ID,
    date:     dateStr,
    headers,
    details,
    finish,
    isClosed,
    weather,
    customerSales,
    timeSlots,
    syncedAt: new Date().toISOString(),
  };

  if (dryRun) {
    log('[DRY-RUN] 전송 생략. 페이로드 요약:');
    console.log(`  날짜: ${dateStr}`);
    console.log(`  헤더: ${headers.length}건 | SaT합계: ${satTotal.toLocaleString()}원`);
    console.log(`  상세: ${details.length}건`);
    if (isClosed && finish) {
      console.log(`  일마감: 완료`);
      console.log(`  ┌ 합산 총매출:  ${finish.totalSale.toLocaleString()}원`);
      console.log(`  ├ 합산 순매출:  ${finish.netSale.toLocaleString()}원`);
      console.log(`  ├ 합산 현금:    ${finish.cashSale.toLocaleString()}원`);
      console.log(`  ├ 합산 카드:    ${finish.cardSale.toLocaleString()}원`);
      console.log(`  └ 합산 반품:    ${finish.returnSale.toLocaleString()}원`);
      if (finish.perPos && finish.perPos.length > 0) {
        console.log(`  POS별 상세:`);
        finish.perPos.forEach(p =>
          console.log(`    [POS ${p.posNo}] 총매출:${p.totalSale.toLocaleString()} 순매출:${p.netSale.toLocaleString()} 현금:${p.cashSale.toLocaleString()} 카드:${p.cardSale.toLocaleString()}원`)
        );
      }
    } else {
      console.log(`  일마감: 미마감`);
    }
    console.log(`  날씨: ${weather ? `${weather.condition} ${weather.tempMin}°~${weather.tempMax}° 강수${weather.rainMm}mm` : '조회불가'}`);
    if (details.length > 0) {
      console.log('  상위 품목 3개:');
      details.slice(0, 3).forEach(d =>
        console.log(`    [${d.categoryName}] ${d.goodsName} × ${d.saleCount}개 = ${d.totalPrice.toLocaleString()}원`)
      );
    }
    return true;
  }

  return await sendToApi(payload);
}

// ── 모드별 실행 ───────────────────────────────────────────────────

// 오늘 1회
async function runToday(dryRun, opts = {}) {
  const { syncCustomerData = true } = opts;
  const dateStr = getKSTTodayYMD();
  log(`======== 오늘 동기화: ${dateStr} ========`);
  const ok = await syncDate(dateStr, dryRun);
  if (!dryRun && ok) {
    const p = await getPool();
    await syncEmployees(p);
    if (syncCustomerData) {
      await syncCustomers(p);
    } else {
      log('고객 동기화 스킵 (realtime — 매출·사원만, 고객은 주기적으로만)');
    }
  }
  log(`======== 완료 ${ok ? '✅' : '❌'} ========`);
  return ok;
}

// 실시간 반복 (30초)
async function runRealtime(dryRun) {
  const intervalLabel = REALTIME_INTERVAL_MS >= 60000
    ? `${REALTIME_INTERVAL_MS / 60000}분`
    : `${REALTIME_INTERVAL_MS / 1000}초`;
  const customerLabel = CUSTOMER_SYNC_EVERY_MS >= 3600000
    ? `${CUSTOMER_SYNC_EVERY_MS / 3600000}시간`
    : `${Math.round(CUSTOMER_SYNC_EVERY_MS / 60000)}분`;
  log(`======== 실시간 모드 시작 (매출 ${intervalLabel} / 고객 ${customerLabel}) ========`);
  log('종료하려면 Ctrl+C');
  let lastCustomerSyncAt = 0;
  while (true) {
    const shouldSyncCustomers = Date.now() - lastCustomerSyncAt >= CUSTOMER_SYNC_EVERY_MS;
    await runToday(dryRun, { syncCustomerData: shouldSyncCustomers });
    if (shouldSyncCustomers) lastCustomerSyncAt = Date.now();
    log(`다음 전송까지 ${intervalLabel} 대기...`);
    await sleep(REALTIME_INTERVAL_MS);
  }
}

// 특정 날짜
async function runDate(dateStr, dryRun) {
  log(`======== 날짜 지정 동기화: ${dateStr} ========`);
  const ok = await syncDate(dateStr, dryRun);
  log(`======== 완료 ${ok ? '✅' : '❌'} ========`);
  return ok;
}

// 기간 마이그레이션
async function runMigrate(startStr, endStr, dryRun) {
  const start = new Date(startStr);
  const end   = new Date(endStr);
  const total = Math.round((end - start) / 86400000) + 1;

  log(`======== 마이그레이션 시작: ${startStr} ~ ${endStr} (총 ${total}일) ========`);

  let ok = 0, fail = 0, skip = 0;

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    const done    = ok + fail + skip + 1;
    const pct     = Math.round((done / total) * 100);
    process.stdout.write(`\r[${pct}%] ${done}/${total} 처리 중... 현재: ${dateStr}   `);

    const success = await syncDate(dateStr, dryRun);
    if (success) { ok++; } else { fail++; }

    if (!dryRun && d < end) await sleep(500);
  }

  process.stdout.write('\n');
  log(`======== 마이그레이션 완료 ========`);
  log(`성공: ${ok}건 | 실패: ${fail}건 | 총: ${total}건`);
  if (fail > 0) warn(`실패한 날짜는 개별적으로 재시도: node bridge.js date YYYY-MM-DD`);
  return fail === 0;
}

// ── 메인 ─────────────────────────────────────────────────────────
async function main() {
  const argv    = process.argv.slice(2);
  const dryRun  = argv.includes('--dry-run');
  const args    = argv.filter(a => a !== '--dry-run');
  const mode    = args[0] || 'today';

  // 설정 검증 (dry-run이 아닐 때만)
  if (!dryRun) {
    if (!API_KEY)  { err('POS_BRIDGE_KEY 미설정 (.env 파일 확인)'); process.exit(1); }
    if (!STORE_ID) { err('STORE_ID 미설정 (.env 파일 확인)');       process.exit(1); }
  }

  log(`Pitaya OS 포스 브릿지 시작 | storeId=${STORE_ID} | 모드=${mode}${dryRun ? ' [DRY-RUN]' : ''}`);

  // DB 연결 확인
  try {
    await getPool();
    log(`DB 연결 성공 (${DB_CONFIG.server}:${DB_CONFIG.port}/${DB_CONFIG.database})`);
  } catch (e) {
    err(`DB 연결 실패: ${e.message}`);
    process.exit(1);
  }

  let success = true;

  try {
    switch (mode) {
      case 'today':
        success = await runToday(dryRun);
        break;

      case 'realtime':
        await runRealtime(dryRun); // 종료 안 됨 (Ctrl+C)
        break;

      case 'date': {
        const dateStr = args[1];
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          err('날짜 형식 오류. 사용법: node bridge.js date YYYY-MM-DD');
          process.exit(1);
        }
        success = await runDate(dateStr, dryRun);
        break;
      }

      case 'migrate': {
        const startStr = args[1];
        const endStr   = args[2];
        if (!startStr || !endStr ||
            !/^\d{4}-\d{2}-\d{2}$/.test(startStr) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
          err('사용법: node bridge.js migrate YYYY-MM-DD YYYY-MM-DD');
          process.exit(1);
        }
        success = await runMigrate(startStr, endStr, dryRun);
        break;
      }

      case 'customers': {
        log('======== Cus_Mst 고객 마스터 동기화 (레거시) ========');
        let cusList;
        try {
          cusList = await fetchCusMstCustomers();
        } catch (e) {
          err(`고객 DB 조회 실패: ${e.message}`);
          success = false;
          break;
        }
        log(`고객 ${cusList.length}명 조회 완료`);
        if (dryRun) {
          log('[DRY-RUN] 전송 생략. 상위 3명:');
          cusList.slice(0, 3).forEach(c =>
            console.log(`  [${c.Cus_Code}] ${c.Cus_Name} | 등급:${c.Cus_Grade} | 포인트:${c.Cus_Point}`)
          );
        } else if (cusList.length > 0) {
          const { total, failed } = await sendCustomersToApi(cusList);
          log(`고객 동기화 완료 | 성공:${total}명 실패:${failed}명`);
          success = failed === 0;
        }
        log(`======== 완료 ${success ? '✅' : '❌'} ========`);
        break;
      }

      case 'sync-employees': {
        const p = await getPool();
        if (dryRun) {
          const list = await fetchEmployees(p);
          log(`[DRY-RUN] 사원 ${list.length}명 조회. 상위 3명:`);
          list.slice(0, 3).forEach(e =>
            console.log(`  [${e.userId}] ${e.name} | ${e.jobPosition || '-'}`)
          );
        } else {
          await syncEmployees(p);
        }
        break;
      }

      case 'sync-customers': {
        const p = await getPool();
        if (dryRun) {
          const list = await fetchCustomerInfo(p);
          auditCustomerPhones(list);
          log(`[DRY-RUN] 고객 ${list.length}명. 전화 샘플 5명:`);
          list.slice(0, 5).forEach(c => {
            const digits = normalizePhoneDigits(pickBestPhone(c.cusHp, c.tel, c.mobile));
            console.log(
              `  [${c.cusCode}] Cus_HP:${c.cusHp || '-'} tel:${c.tel || '-'} mobile:${c.mobile || '-'} → digits:${digits || '(마스킹/없음)'}`
            );
          });
        } else {
          await syncCustomers(p);
        }
        break;
      }

      case 'sync-goods': {
        const p = await getPool();
        if (dryRun) {
          const list = await fetchGoodsMaster(p);
          log(`[DRY-RUN] 6자리 품목 ${list.length}건. 샘플 10건:`);
          list.slice(0, 10).forEach(g => {
            const sc3 = g.posBarCode.slice(-3);
            console.log(`  ${g.posBarCode} → 저울3=${sc3} | ${g.name}`);
          });
        } else {
          await syncGoods(p);
        }
        break;
      }

      case 'probe-customer-phones': {
        const p = await getPool();
        const list = await fetchCustomerInfo(p);
        auditCustomerPhones(list);
        log('── 전화 컬럼 샘플 (상위 10명) ──');
        list.slice(0, 10).forEach(c => {
          const digits = normalizePhoneDigits(pickBestPhone(c.cusHp, c.tel, c.mobile));
          console.log(JSON.stringify({
            cusCode: c.cusCode,
            cusHp: c.cusHp || null,
            tel: c.tel || null,
            mobile: c.mobile || null,
            syncDigits: digits || null,
          }));
        });
        break;
      }

      case 'probe-unmasked-phones': {
        const p = await getPool();
        await probeUnmaskedPhones(p);
        break;
      }

      case 'probe-member-use': {
        const p = await getPool();
        await probeMemberUse(p);
        break;
      }

      case 'probe-en-ukey': {
        const p = await getPool();
        const result = await p.request().query(`
          SELECT TOP 10
            Cus_Code   as cusCode,
            Cus_Mobile as mobile,
            en_uKey1, en_uKey2, en_uKey3, en_uKey4, en_uKey5
          FROM Customer_Info
          WHERE en_uKey2 IS NOT NULL AND en_uKey2 != ''
          ORDER BY Cus_Code
        `);
        const countResult = await p.request().query(`
          SELECT COUNT(*) as cnt FROM Customer_Info WHERE en_uKey2 IS NOT NULL AND en_uKey2 != ''
        `);
        log(`en_uKey2 보유 고객: ${countResult.recordset[0].cnt}명`);
        log('── en_uKey 샘플 (상위 10명) ──');
        result.recordset.forEach(r => {
          console.log(JSON.stringify({
            cusCode: r.cusCode,
            mobile: r.mobile,
            en_uKey1: r.en_uKey1 || null,
            en_uKey2: r.en_uKey2 || null,
            en_uKey3: r.en_uKey3 || null,
            en_uKey4: r.en_uKey4 || null,
            en_uKey5: r.en_uKey5 || null,
          }));
        });
        break;
      }

      case 'check-tables': {
        const p = await getPool();
        await checkTables(p);
        break;
      }

      default:
        // 첫 번째 인자가 날짜 형식이면 date 모드로
        if (/^\d{4}-\d{2}-\d{2}$/.test(mode)) {
          success = await runDate(mode, dryRun);
        } else {
          err(`알 수 없는 모드: ${mode}`);
          console.log('사용법: node bridge.js [today|realtime|date YYYY-MM-DD|migrate START END|customers|sync-employees|sync-customers|sync-goods|probe-customer-phones|probe-unmasked-phones|probe-member-use|probe-en-ukey|check-tables] [--dry-run]');
          process.exit(1);
        }
    }
  } finally {
    await closePool();
  }

  process.exit(success ? 0 : 1);
}

main().catch(e => {
  err(`치명적 오류: ${e.message}`);
  process.exit(1);
});

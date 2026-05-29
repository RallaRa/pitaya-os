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
 *   node bridge.js check-tables         # DB 테이블 확인
 *   node bridge.js --dry-run            # 조회만
 *
 * 사전 설치:
 *   npm install mssql axios dotenv
 */

'use strict';

require('dotenv').config();
const sql   = require('mssql');
const axios = require('axios');

// ── 설정 ──────────────────────────────────────────────────────────
const API_BASE = (process.env.PITAYA_API_URL || 'https://pitaya-osv1.vercel.app/api/pos/sync')
  .replace(/\/api\/pos\/sync$/, '');
const API_URL  = `${API_BASE}/api/pos/sync`;
const CUSTOMERS_API_URL  = `${API_BASE}/api/pos/sync-customers`;
const EMPLOYEES_API_URL  = `${API_BASE}/api/pos/sync-employees`;
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

const REALTIME_INTERVAL_MS = 30 * 1000; // 30초

// ── 유틸 ──────────────────────────────────────────────────────────
const toInt = v => (v == null ? 0 : parseInt(v, 10) || 0);

function now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}
function log(msg)  { console.log(`[${now()}] ${msg}`); }
function warn(msg) { console.warn(`[${now()}] ⚠️  ${msg}`); }
function err(msg)  { console.error(`[${now()}] ❌ ${msg}`); }

// YYYYMM 추출 (SaT_202605 형식 테이블명용)
function ym(dateStr) {
  return dateStr.slice(0, 7).replace('-', '');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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

// ── 고객 조회 (Customer_Info) ────────────────────────────────────
async function fetchCustomerInfo(pool) {
  try {
    const result = await pool.request().query(`
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
        Email          as email
      FROM Customer_Info
      WHERE Cus_Use = '1'
      ORDER BY Vis_Date DESC
    `);
    log(`고객 정보 ${result.recordset.length}명 조회`);
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
  log('━━━ 고객 정보 동기화 시작 ━━━');
  const customers = await fetchCustomerInfo(pool);
  if (customers.length === 0) {
    log('고객 정보 없음');
    return;
  }

  const batchSize = 400;
  let totalSynced = 0;

  for (let i = 0; i < customers.length; i += batchSize) {
    const batch = customers.slice(i, i + batchSize).map(c => ({
      cusCode:        String(c.cusCode        || '').trim(),
      name:           String(c.name           || '').trim(),
      cusGubun:       String(c.cusGubun       || '').trim(),
      cusClass:       String(c.cusClass       || '').trim(),
      mobile:         String(c.mobile         || '').trim(),
      tel:            String(c.tel            || '').trim(),
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
    })).filter(c => c.cusCode);

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
  const today = new Date().toISOString().slice(0, 10);
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
    const today = new Date().toISOString().slice(0, 10);
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
async function runToday(dryRun) {
  const dateStr = new Date().toISOString().slice(0, 10);
  log(`======== 오늘 동기화: ${dateStr} ========`);
  const ok = await syncDate(dateStr, dryRun);
  if (!dryRun && ok) {
    const p = await getPool();
    await syncEmployees(p);
    await syncCustomers(p);
  }
  log(`======== 완료 ${ok ? '✅' : '❌'} ========`);
  return ok;
}

// 실시간 반복 (30초)
async function runRealtime(dryRun) {
  const intervalLabel = REALTIME_INTERVAL_MS >= 60000
    ? `${REALTIME_INTERVAL_MS / 60000}분`
    : `${REALTIME_INTERVAL_MS / 1000}초`;
  log(`======== 실시간 모드 시작 (${intervalLabel} 간격) ========`);
  log('종료하려면 Ctrl+C');
  while (true) {
    await runToday(dryRun);
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
          log(`[DRY-RUN] 고객 ${list.length}명 조회. 상위 3명:`);
          list.slice(0, 3).forEach(c =>
            console.log(`  [${c.cusCode}] ${c.name || '-'} | 등급:${c.cusClass || '-'} | 포인트:${c.point || 0}`)
          );
        } else {
          await syncCustomers(p);
        }
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
          console.log('사용법: node bridge.js [today|realtime|date YYYY-MM-DD|migrate START END|customers|sync-employees|sync-customers|check-tables] [--dry-run]');
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

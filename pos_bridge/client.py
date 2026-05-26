"""
Pitaya OS - POS 브릿지 클라이언트
로컬 POS DB → /api/pos/sync 전송

사용법:
  python client.py                          # 오늘 데이터 전송
  python client.py 2026-05-26               # 특정 날짜 전송
  python client.py --range 2026-01-01 2026-05-25  # 날짜 범위 일괄 전송
  python client.py --dry-run                # 실제 전송 없이 조회만
"""
import sys
import json
import time
import logging
import argparse
from datetime import date, datetime, timedelta

import requests
import config as cfg

# ── 로거 설정 ─────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(cfg.LOG_FILE, encoding='utf-8'),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger('pos_bridge')


# ── DB 연결 ───────────────────────────────────────────────────────
def get_connection():
    if cfg.DB_TYPE == 'sqlite':
        import sqlite3
        return sqlite3.connect(cfg.DB_PATH)
    else:
        import pyodbc
        return pyodbc.connect(cfg.DB_DSN)


def rows_to_dicts(cursor):
    cols = [c[0] for c in cursor.description]
    return [dict(zip(cols, row)) for row in cursor.fetchall()]


def safe_int(v):
    try:
        return int(v) if v is not None else 0
    except (ValueError, TypeError):
        return 0


# ── POS 데이터 읽기 ───────────────────────────────────────────────
def fetch_headers(conn, target_date: str) -> list:
    cur = conn.cursor()
    cur.execute(
        f"SELECT * FROM {cfg.TABLE_HEADER} WHERE {cfg.COL_H_DATE} = ?",
        (target_date,),
    )
    rows = rows_to_dicts(cur)
    result = []
    for r in rows:
        result.append({
            'totalSale':  safe_int(r.get(cfg.COL_H_TOTALSALE)),
            'cardSale':   safe_int(r.get(cfg.COL_H_CARDSALE)),
            'cashSale':   safe_int(r.get(cfg.COL_H_CASHSALE)),
            'profitPri':  safe_int(r.get(cfg.COL_H_PROFITPRI)),
            'transCount': safe_int(r.get(cfg.COL_H_TRANSCOUNT)),
        })
    return result


def fetch_details(conn, target_date: str) -> list:
    cur = conn.cursor()
    cur.execute(
        f"SELECT * FROM {cfg.TABLE_DETAIL} WHERE {cfg.COL_D_DATE} = ?",
        (target_date,),
    )
    rows = rows_to_dicts(cur)
    result = []
    for r in rows:
        result.append({
            'barcode':      str(r.get(cfg.COL_D_BARCODE) or ''),
            'goodsName':    str(r.get(cfg.COL_D_GOODSNAME) or ''),
            'categoryCode': str(r.get(cfg.COL_D_CATCODE) or ''),
            'categoryName': str(r.get(cfg.COL_D_CATNAME) or ''),
            'saleCount':    safe_int(r.get(cfg.COL_D_SALECOUNT)),
            'sellPrice':    safe_int(r.get(cfg.COL_D_SELLPRICE)),
            'totalPrice':   safe_int(r.get(cfg.COL_D_TOTALPRICE)),
            'purPrice':     safe_int(r.get(cfg.COL_D_PURPRICE)),
            'profitPrice':  safe_int(r.get(cfg.COL_D_PROFITPRICE)),
        })
    return result


def fetch_finish(conn, target_date: str):
    cur = conn.cursor()
    cur.execute(
        f"SELECT * FROM {cfg.TABLE_FINISH} WHERE {cfg.COL_F_DATE} = ?",
        (target_date,),
    )
    rows = rows_to_dicts(cur)
    if not rows:
        return None
    r = rows[0]
    return {
        'totalSale':   safe_int(r.get(cfg.COL_F_TOTALSALE)),
        'netSale':     safe_int(r.get(cfg.COL_F_NETSALE)),
        'cashSale':    safe_int(r.get(cfg.COL_F_CASHSALE)),
        'cardSale':    safe_int(r.get(cfg.COL_F_CARDSALE)),
        'returnCount': safe_int(r.get(cfg.COL_F_RETURNCOUNT)),
        'returnSale':  safe_int(r.get(cfg.COL_F_RETURNSALE)),
        'cusPoint':    safe_int(r.get(cfg.COL_F_CUSPOINT)),
    }


# ── API 전송 ──────────────────────────────────────────────────────
def send_to_api(payload: dict, dry_run: bool) -> bool:
    log.info(f"[전송] storeId={payload['storeId']} date={payload['date']} "
             f"headers={len(payload['headers'])} details={len(payload['details'])} "
             f"finish={'있음' if payload['finish'] else '없음'}")

    if dry_run:
        log.info("[DRY-RUN] 실제 전송 생략")
        log.info(json.dumps(payload, ensure_ascii=False, indent=2))
        return True

    for attempt in range(1, cfg.RETRY_COUNT + 1):
        try:
            res = requests.post(
                cfg.API_URL,
                json=payload,
                headers={
                    'Authorization': f'Bearer {cfg.API_KEY}',
                    'Content-Type': 'application/json',
                },
                timeout=30,
            )
            data = res.json()

            if res.status_code == 200 and data.get('success'):
                saved = data.get('saved', {})
                log.info(f"[성공] headers={saved.get('headers')} "
                         f"details={saved.get('details')} "
                         f"finish={saved.get('finish')}")
                return True

            log.warning(f"[응답오류] status={res.status_code} body={data}")

        except requests.exceptions.RequestException as e:
            log.warning(f"[네트워크오류] attempt={attempt}/{cfg.RETRY_COUNT} error={e}")

        if attempt < cfg.RETRY_COUNT:
            log.info(f"[재시도] {cfg.RETRY_DELAY}초 후...")
            time.sleep(cfg.RETRY_DELAY)

    log.error("[실패] 최대 재시도 횟수 초과")
    return False


# ── 단일 날짜 동기화 ──────────────────────────────────────────────
def sync_date(target_date: str, dry_run: bool) -> bool:
    log.info(f"======== POS 브릿지 시작: {target_date} ========")

    try:
        conn = get_connection()
    except Exception as e:
        log.error(f"DB 연결 실패: {e}")
        return False

    try:
        headers = fetch_headers(conn, target_date)
        details = fetch_details(conn, target_date)
        finish  = fetch_finish(conn, target_date)
        log.info(f"DB 조회 완료 — 헤더 {len(headers)}건, 상세 {len(details)}건, "
                 f"일마감 {'있음' if finish else '없음'}")
    except Exception as e:
        log.error(f"DB 조회 실패: {e}")
        return False
    finally:
        conn.close()

    if not headers and not details and not finish:
        log.warning(f"{target_date} 데이터 없음 — 전송 건너뜀")
        return True  # 데이터 없는 날은 정상으로 취급

    payload = {
        'storeId':  cfg.STORE_ID,
        'date':     target_date,
        'headers':  headers,
        'details':  details,
        'finish':   finish,
        'syncedAt': datetime.utcnow().isoformat() + 'Z',
    }

    return send_to_api(payload, dry_run=dry_run)


# ── 메인 ─────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='Pitaya OS POS 브릿지')
    parser.add_argument('date', nargs='?', default=None,
                        help='동기화 날짜 YYYY-MM-DD (기본: 오늘)')
    parser.add_argument('--range', nargs=2, metavar=('START', 'END'),
                        help='날짜 범위 일괄 동기화 (예: --range 2026-01-01 2026-05-25)')
    parser.add_argument('--dry-run', action='store_true',
                        help='DB 조회만 수행, 실제 전송 안 함')
    args = parser.parse_args()

    # 설정 검증
    if not args.dry_run:
        if not cfg.API_KEY:
            log.error("POS_BRIDGE_KEY가 설정되지 않았습니다 (.env 파일 확인)")
            sys.exit(1)
        if not cfg.STORE_ID:
            log.error("STORE_ID가 설정되지 않았습니다 (.env 파일 확인)")
            sys.exit(1)

    # 범위 동기화
    if args.range:
        try:
            start_dt = datetime.strptime(args.range[0], '%Y-%m-%d').date()
            end_dt   = datetime.strptime(args.range[1], '%Y-%m-%d').date()
        except ValueError:
            log.error("날짜 형식 오류 (YYYY-MM-DD)")
            sys.exit(1)

        total = (end_dt - start_dt).days + 1
        log.info(f"범위 동기화 시작: {start_dt} ~ {end_dt} ({total}일)")

        ok = fail = skip = 0
        current = start_dt
        while current <= end_dt:
            ds = current.strftime('%Y-%m-%d')
            success = sync_date(ds, args.dry_run)
            if success:
                ok += 1
            else:
                fail += 1
                log.warning(f"[실패] {ds} — 계속 진행")
            current += timedelta(days=1)
            if not args.dry_run and current <= end_dt:
                time.sleep(0.5)  # API 과부하 방지

        log.info(f"범위 동기화 완료 — 성공 {ok}건 / 실패 {fail}건 / 총 {total}건")
        sys.exit(0 if fail == 0 else 1)

    # 단일 날짜 동기화
    target_date = args.date or date.today().strftime('%Y-%m-%d')
    try:
        datetime.strptime(target_date, '%Y-%m-%d')
    except ValueError:
        log.error(f"날짜 형식 오류: {target_date} (YYYY-MM-DD 형식 필요)")
        sys.exit(1)

    success = sync_date(target_date, args.dry_run)
    log.info("======== 완료 ========")
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()

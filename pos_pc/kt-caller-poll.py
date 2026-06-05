# -*- coding: utf-8 -*-
"""KT 통화매니저 KPD.dat (WAL) 읽기 전용 폴링 — stdout JSON"""
import json
import sqlite3
import sys

DB_PATH = r'C:\Program Files\통화매니저\KPD.dat'
SINCE = sys.argv[1] if len(sys.argv) > 1 else ''


def connect_db():
    # immutable=1 은 WAL 신규 통화를 못 읽는 경우가 있음 — mode=ro 로 최신 WAL 반영
    try:
        conn = sqlite3.connect(f'file:{DB_PATH}?mode=ro', uri=True, timeout=5.0)
    except sqlite3.OperationalError:
        conn = sqlite3.connect(DB_PATH, timeout=5.0)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA query_only=ON')
    return conn


def main():
    conn = connect_db()
    cur = conn.cursor()
    if SINCE:
        cur.execute(
            '''
            SELECT cl_caller, cl_callee, cl_name, cl_result, cl_idate, cl_absence
            FROM call_list
            WHERE cl_idate > ?
            ORDER BY cl_idate ASC
            ''',
            (SINCE,),
        )
    else:
        cur.execute(
            '''
            SELECT cl_caller, cl_callee, cl_name, cl_result, cl_idate, cl_absence
            FROM call_list
            ORDER BY cl_idate DESC
            LIMIT 1
            '''
        )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    print(json.dumps(rows, ensure_ascii=False))


if __name__ == '__main__':
    main()

# -*- coding: utf-8 -*-
"""KT 통화매니저 KPD.dat (WAL) 읽기 전용 폴링 — stdout JSON"""
import json
import sqlite3
import sys

DB_PATH = r'C:\Program Files\통화매니저\KPD.dat'
SINCE = sys.argv[1] if len(sys.argv) > 1 else ''


def main():
    uri = f'file:{DB_PATH}?mode=ro&immutable=1'
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
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

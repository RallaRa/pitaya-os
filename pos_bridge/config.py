"""
POS 브릿지 설정
.env 파일 또는 환경변수로 주입
"""
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

# ── Pitaya OS API ─────────────────────────────────────────────────
API_URL      = os.getenv('PITAYA_API_URL', 'https://pitaya-osv1.vercel.app/api/pos/sync')
API_KEY      = os.getenv('POS_BRIDGE_KEY', '')
STORE_ID     = os.getenv('STORE_ID', '')

# ── POS DB 연결 ───────────────────────────────────────────────────
# ODBC 연결문자열 예시:
#   SQL Server : "DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost;DATABASE=POS_DB;UID=sa;PWD=1234"
#   MS Access  : "DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=C:/POS/data.mdb"
#   SQLite     : DB_TYPE=sqlite, DB_PATH=C:/POS/pos.db
DB_TYPE      = os.getenv('DB_TYPE', 'odbc')   # 'odbc' | 'sqlite'
DB_DSN       = os.getenv('DB_DSN', '')        # ODBC 연결문자열
DB_PATH      = os.getenv('DB_PATH', '')       # SQLite 경로 (DB_TYPE=sqlite 일 때)

# ── 테이블/컬럼 매핑 ──────────────────────────────────────────────
# POS마다 테이블명·컬럼명이 다를 수 있으므로 환경변수로 오버라이드 가능

TABLE_HEADER = os.getenv('TABLE_HEADER', 'SaT')          # 매출헤더
TABLE_DETAIL = os.getenv('TABLE_DETAIL', 'SaD')          # 매출상세
TABLE_FINISH = os.getenv('TABLE_FINISH', 'Finish_Total') # 일마감

# SaT 컬럼명
COL_H_DATE       = os.getenv('COL_H_DATE',        'SaleDate')
COL_H_TOTALSALE  = os.getenv('COL_H_TOTALSALE',   'TotalSale')
COL_H_CARDSALE   = os.getenv('COL_H_CARDSALE',    'CardSale')
COL_H_CASHSALE   = os.getenv('COL_H_CASHSALE',    'CashSale')
COL_H_PROFITPRI  = os.getenv('COL_H_PROFITPRI',   'ProfitPri')
COL_H_TRANSCOUNT = os.getenv('COL_H_TRANSCOUNT',  'TransCount')

# SaD 컬럼명
COL_D_DATE        = os.getenv('COL_D_DATE',         'SaleDate')
COL_D_BARCODE     = os.getenv('COL_D_BARCODE',      'Barcode')
COL_D_GOODSNAME   = os.getenv('COL_D_GOODSNAME',    'GoodsName')
COL_D_CATCODE     = os.getenv('COL_D_CATCODE',      'CategoryCode')
COL_D_CATNAME     = os.getenv('COL_D_CATNAME',      'CategoryName')
COL_D_SALECOUNT   = os.getenv('COL_D_SALECOUNT',    'SaleCount')
COL_D_SELLPRICE   = os.getenv('COL_D_SELLPRICE',    'SellPrice')
COL_D_TOTALPRICE  = os.getenv('COL_D_TOTALPRICE',   'TotalPrice')
COL_D_PURPRICE    = os.getenv('COL_D_PURPRICE',     'PurPrice')
COL_D_PROFITPRICE = os.getenv('COL_D_PROFITPRICE',  'ProfitPrice')

# Finish_Total 컬럼명
COL_F_DATE        = os.getenv('COL_F_DATE',         'SaleDate')
COL_F_TOTALSALE   = os.getenv('COL_F_TOTALSALE',    'TotalSale')
COL_F_NETSALE     = os.getenv('COL_F_NETSALE',      'NetSale')
COL_F_CASHSALE    = os.getenv('COL_F_CASHSALE',     'CashSale')
COL_F_CARDSALE    = os.getenv('COL_F_CARDSALE',     'CardSale')
COL_F_RETURNCOUNT = os.getenv('COL_F_RETURNCOUNT',  'ReturnCount')
COL_F_RETURNSALE  = os.getenv('COL_F_RETURNSALE',   'ReturnSale')
COL_F_CUSPOINT    = os.getenv('COL_F_CUSPOINT',     'CusPoint')

# ── 동작 옵션 ─────────────────────────────────────────────────────
RETRY_COUNT  = int(os.getenv('RETRY_COUNT', '3'))
RETRY_DELAY  = int(os.getenv('RETRY_DELAY', '5'))   # 초
LOG_FILE     = os.getenv('LOG_FILE', os.path.join(os.path.dirname(__file__), 'bridge.log'))

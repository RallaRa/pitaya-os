'use client';

import { useState, useEffect, useRef } from 'react';
import WidgetWrapper from './WidgetWrapper';
import { db } from '@/lib/firebase/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { getKSTTodayYMD, getKSTYesterdayYMD } from '@/lib/dateUtils';
import { getDisplayTotalSale, getDisplayNetSales, posDailySalesDocId } from '@/lib/posDailySales';
import { dailyReportDocId } from '@/lib/reportCompare';
import { TrendingUp, RefreshCw } from 'lucide-react';

interface SalesDoc {
  isClosed?: boolean;
  headers?: Array<{ totalSale?: number }>;
  finish?: { totalSale?: number; netSale?: number };
  totalSales?: number;
  netSales?: number;
  syncedAt?: string;
}

export default function TodaySalesWidget({
  editMode, onRemove, storeId,
}: {
  editMode: boolean; onRemove: () => void; storeId?: string;
}) {
  const [todayDoc,     setTodayDoc]     = useState<SalesDoc | null>(null);
  const [yesterdayDoc, setYesterdayDoc] = useState<SalesDoc | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [updatedAt,    setUpdatedAt]    = useState<Date | null>(null);
  const unsubRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    unsubRef.current.forEach(u => u());
    unsubRef.current = [];

    if (!storeId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const todayStr = getKSTTodayYMD();
    const yesterdayStr = getKSTYesterdayYMD();

    let todayPos: SalesDoc | null = null;
    let todayReport: SalesDoc | null = null;
    let yesterdayPos: SalesDoc | null = null;
    let yesterdayReport: SalesDoc | null = null;

    const mergeToday = () => {
      setTodayDoc(todayPos ?? todayReport ?? null);
      setUpdatedAt(new Date());
      setLoading(false);
    };
    const mergeYesterday = () => {
      setYesterdayDoc(yesterdayPos ?? yesterdayReport ?? null);
    };

    const todayPosRef = doc(db, 'pos_daily_sales', posDailySalesDocId(storeId, todayStr));
    const todayReportRef = doc(db, 'daily_reports', dailyReportDocId(storeId, todayStr));
    const yesterdayPosRef = doc(db, 'pos_daily_sales', posDailySalesDocId(storeId, yesterdayStr));
    const yesterdayReportRef = doc(db, 'daily_reports', dailyReportDocId(storeId, yesterdayStr));

    const unsubTodayPos = onSnapshot(todayPosRef, snap => {
      todayPos = snap.exists() ? (snap.data() as SalesDoc) : null;
      mergeToday();
    }, err => {
      console.error('[TodaySalesWidget] today pos_daily_sales:', err);
      setError('당일 매출 데이터를 불러오지 못했습니다');
      setLoading(false);
    });

    const unsubTodayReport = onSnapshot(todayReportRef, snap => {
      todayReport = snap.exists() ? (snap.data() as SalesDoc) : null;
      mergeToday();
    }, err => console.error('[TodaySalesWidget] today daily_reports:', err));

    const unsubYesterdayPos = onSnapshot(yesterdayPosRef, snap => {
      yesterdayPos = snap.exists() ? (snap.data() as SalesDoc) : null;
      mergeYesterday();
    }, err => console.error('[TodaySalesWidget] yesterday pos_daily_sales:', err));

    const unsubYesterdayReport = onSnapshot(yesterdayReportRef, snap => {
      yesterdayReport = snap.exists() ? (snap.data() as SalesDoc) : null;
      mergeYesterday();
    }, err => console.error('[TodaySalesWidget] yesterday daily_reports:', err));

    unsubRef.current.push(unsubTodayPos, unsubTodayReport, unsubYesterdayPos, unsubYesterdayReport);

    return () => {
      unsubRef.current.forEach(u => u());
      unsubRef.current = [];
    };
  }, [storeId]);

  const fmt = (n: number) => (n || 0).toLocaleString('ko-KR');
  const todayTotal = getDisplayTotalSale(todayDoc);
  const todayNet   = getDisplayNetSales(todayDoc);
  const yesterdayTotal = getDisplayTotalSale(yesterdayDoc);
  const isClosed = todayDoc?.isClosed ?? false;
  const todayStr = getKSTTodayYMD();

  return (
    <WidgetWrapper
      title="📊 당일 매출 현황"
      editMode={editMode}
      onRemove={onRemove}
      updatedAt={updatedAt}
      loading={loading}
      error={error}
    >
      {!storeId ? (
        <div className="flex flex-col items-center justify-center h-full gap-2">
          <TrendingUp className="w-8 h-8 text-slate-700" />
          <p className="text-slate-500 text-xs text-center">매장을 선택하세요</p>
        </div>
      ) : (
        <div className="h-full p-3 flex flex-col gap-2 justify-center">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-[10px]">{todayStr}</span>
            <div className="flex items-center gap-1.5">
              {isClosed
                ? <span className="text-[10px] px-1.5 py-0.5 bg-emerald-900/50 text-emerald-400 rounded-full border border-emerald-700/40">마감완료</span>
                : <span className="text-[10px] px-1.5 py-0.5 bg-yellow-900/50 text-yellow-400 rounded-full border border-yellow-700/40 animate-pulse">영업 중</span>
              }
              <RefreshCw className="w-3 h-3 text-slate-600" />
            </div>
          </div>

          <div className="text-center">
            <p className="text-slate-500 text-[10px] mb-1">오늘 매출</p>
            <p className="text-3xl font-bold text-teal-300">
              ₩ {fmt(todayTotal)}
            </p>
            <p className="text-slate-500 text-[10px] mt-0.5">순매출 {fmt(todayNet)}원</p>
          </div>

          <p className="text-center text-sm text-slate-400 scale-[0.85] origin-center">
            어제 ₩ {fmt(yesterdayTotal)}
          </p>

          {todayDoc?.syncedAt && (
            <p className="text-slate-600 text-[9px] text-right">
              POS 동기화 {new Date(todayDoc.syncedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      )}
    </WidgetWrapper>
  );
}

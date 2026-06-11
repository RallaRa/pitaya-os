'use client';

import { overlay } from '@/components/overlay';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays, ChevronLeft, ChevronRight, Loader2, MessageCircle, Plus, RefreshCw,
} from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useStore } from '@/context/StoreContext';
import { db } from '@/lib/firebase/firebase';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import MessageCard from '@/components/messenger/MessageCard';
import type { MessengerCalendarEvent } from '@/lib/messenger/calendarTypes';

interface WeekData {
  events: MessengerCalendarEvent[];
  absences: Record<string, string[]>;
  scheduleChannelId?: string | null;
  weekStart?: string;
  weekEnd?: string;
}

function weekStartFrom(dateYmd: string): string {
  const d = new Date(`${dateYmd}T12:00:00+09:00`);
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default async function MessengerCalendarPageWrapper() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
      </div>
    }>
      <MessengerCalendarPage />
    </Suspense>
  );
}

function MessengerCalendarPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const today = getKSTTodayYMD();

  const [weekStart, setWeekStart] = useState(() => weekStartFrom(today));
  const [week, setWeek] = useState<WeekData>({ events: [], absences: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notifyResult, setNotifyResult] = useState('');
  const [form, setForm] = useState({ title: '', startDate: today, startTime: '', description: '' });

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysYMD(weekStart, i)),
    [weekStart],
  );

  const todayEvents = useMemo(
    () => week.events.filter(e => e.date === today),
    [week.events, today],
  );
  const todayAbsent = week.absences[today] || [];

  const loadWeek = useCallback(async () => {
    if (!storeId) { setLoading(false); return; }
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(
        `/api/messenger/calendar?storeId=${encodeURIComponent(storeId)}&from=${weekStart}&week=1`,
        { headers },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWeek({
        events: data.events || [],
        absences: data.absences || {},
        scheduleChannelId: data.scheduleChannelId,
        weekStart: data.weekStart,
        weekEnd: data.weekEnd,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [storeId, weekStart]);

  useEffect(() => { loadWeek(); }, [loadWeek]);

  useEffect(() => {
    if (!storeId) return;
    const qCal = query(collection(db, 'calendar_events'), where('storeId', '==', storeId));
    const qHr = query(collection(db, 'hr_calendar_events'), where('storeId', '==', storeId));
    const unsubCal = onSnapshot(qCal, () => { loadWeek(); });
    const unsubHr = onSnapshot(qHr, () => { loadWeek(); });
    return () => { unsubCal(); unsubHr(); };
  }, [storeId, loadWeek]);

  const handleCreate = async () => {
    if (!storeId || !form.title.trim()) return;
    setSaving(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/messenger/calendar', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForm({ title: '', startDate: today, startTime: '', description: '' });
    } catch (e: unknown) {
      await overlay.alert(e instanceof Error ? e.message : '등록 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleNotify = async () => {
    if (!storeId) return;
    setSaving(true);
    setNotifyResult('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/messenger/calendar', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNotifyResult(`발송 ${data.sent}건 / 스킵 ${data.skipped}건${data.items?.length ? `: ${data.items.join(', ')}` : ''}`);
    } catch (e: unknown) {
      await overlay.alert(e instanceof Error ? e.message : '알림 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem-2.5rem)] min-h-0 bg-slate-950 text-slate-200">
      <header className="shrink-0 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-teal-400" />
          <div>
            <h1 className="text-sm font-semibold text-slate-100">캘린더 통합</h1>
            <p className="text-[10px] text-slate-500">HR 캘린더 · 직원일정 채널 · 자동 알림</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={loadWeek} className="px-2.5 py-1.5 text-xs border border-slate-700 rounded-lg hover:bg-slate-800 inline-flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> 새로고침
          </button>
          {week.scheduleChannelId && (
            <Link
              href={`/dashboard/messenger?roomId=${encodeURIComponent(week.scheduleChannelId)}`}
              className="px-2.5 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg hover:border-teal-500 inline-flex items-center gap-1"
            >
              <MessageCircle className="w-3.5 h-3.5" /> 직원일정 채널
            </Link>
          )}
          <button
            type="button"
            onClick={handleNotify}
            disabled={saving}
            className="px-2.5 py-1.5 text-xs bg-teal-600 rounded-lg hover:bg-teal-500 disabled:opacity-50"
          >
            일정 알림 발송
          </button>
        </div>
      </header>

      {/* 오늘 요약 */}
      <div className="shrink-0 px-4 py-2 border-b border-slate-800/80 bg-slate-900/40 flex flex-wrap gap-3 text-xs">
        <span className="text-teal-400 font-medium">{today}</span>
        {todayAbsent.length > 0 && (
          <span className="text-amber-400">휴무: {todayAbsent.join(', ')}</span>
        )}
        {todayEvents.length > 0 && (
          <span className="text-slate-400">일정 {todayEvents.length}건</span>
        )}
        {notifyResult && <span className="text-teal-300">{notifyResult}</span>}
      </div>

      <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
        <section className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-xl p-4 min-h-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-300">주간 일정 · 휴무</h2>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setWeekStart(addDaysYMD(weekStart, -7))} className="p-1 rounded hover:bg-slate-800">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[11px] text-slate-500 px-1">{weekStart} ~ {addDaysYMD(weekStart, 6)}</span>
              <button type="button" onClick={() => setWeekStart(addDaysYMD(weekStart, 7))} className="p-1 rounded hover:bg-slate-800">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setWeekStart(weekStartFrom(today))} className="text-[10px] text-teal-400 ml-1 hover:underline">
                이번 주
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
          ) : (
            <div className="space-y-2">
              {weekDays.map(d => {
                const dayEvents = week.events.filter(e => e.date === d);
                const dayOff = week.absences[d] || [];
                const isToday = d === today;
                return (
                  <div
                    key={d}
                    className={`border rounded-lg p-3 ${isToday ? 'border-teal-500/40 bg-teal-950/20' : 'border-slate-800'}`}
                  >
                    <p className={`text-sm font-medium ${isToday ? 'text-teal-300' : 'text-slate-300'}`}>{d}</p>
                    {dayOff.length > 0 && (
                      <p className="text-xs text-amber-400/90 mt-1">휴무: {dayOff.join(', ')}</p>
                    )}
                    {dayEvents.length === 0 ? (
                      <p className="text-xs text-slate-600 mt-1">일정 없음</p>
                    ) : (
                      <ul className="mt-2 space-y-1">
                        {dayEvents.map(ev => (
                          <li key={`${ev.source}-${ev.id}`} className="text-sm text-slate-300 flex items-start gap-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${ev.source === 'hr' ? 'bg-orange-900/40 text-orange-300' : 'bg-slate-800 text-slate-400'}`}>
                              {ev.source === 'hr' ? 'HR' : '일정'}
                            </span>
                            <span>
                              {ev.title}
                              {ev.startTime ? ` (${ev.startTime})` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-1">
              <Plus className="w-4 h-4" /> 일정 등록
            </h2>
            <div className="space-y-2">
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="제목"
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-lg"
              />
              <input
                type="date"
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-lg"
              />
              <input
                type="time"
                value={form.startTime}
                onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-lg"
              />
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="메모 (선택)"
                rows={3}
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-700 rounded-lg resize-none"
              />
              <button
                type="button"
                onClick={handleCreate}
                disabled={saving || !form.title.trim()}
                className="w-full py-2 text-sm bg-teal-600 rounded-lg hover:bg-teal-500 disabled:opacity-50"
              >
                등록 + 직원일정 채널 카드
              </button>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-2">자동 알림 카드 예시</p>
            <MessageCard
              type="calendar_event"
              cardData={{
                title: '내일 납품 예정: 미트클럽 삼겹살 20kg',
                subtitle: addDaysYMD(today, 1),
                fields: [
                  { label: '거래처', value: '미트클럽' },
                  { label: '품목', value: '삼겹살 20kg' },
                ],
                footer: '발주·입고 준비를 확인하세요',
              }}
              actions={[{ id: 'detail', label: '캘린더 보기', style: 'ghost' }]}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

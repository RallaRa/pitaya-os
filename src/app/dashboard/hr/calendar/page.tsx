'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, Plus, X, Check, AlertCircle,
  Calendar, Clock, FileText, Users, Settings, Download,
  Upload, ExternalLink, RefreshCw, Trash2, Tag,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';

/* ── 타입 ── */
type ViewMode = 'month' | 'week' | 'day';
type TabType  = 'calendar' | 'my-requests' | 'settings';
type EventType = 'leave' | 'dayoff' | 'holiday' | 'task';
type EventSource = 'pitaya' | 'google' | 'naver' | 'ical';

interface CalEvent {
  id: string;
  title: string;
  startDate: string;  // YYYY-MM-DD
  endDate: string;
  type: EventType;
  source: EventSource;
  color?: string;
  status?: string;
  userId?: string;
  userName?: string;
  description?: string;
}

interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  createdAt: any;
}

interface DayoffRequest {
  id: string;
  userId: string;
  userName: string;
  type: string;
  dates: string[];
  reason: string;
  status: string;
  createdAt: any;
}

/* ── 공휴일 ── */
const HOLIDAYS: Record<string, string> = {
  '2024-01-01': '신정', '2024-02-09': '설날 연휴', '2024-02-10': '설날',
  '2024-02-11': '설날 연휴', '2024-02-12': '대체공휴일', '2024-03-01': '3·1절',
  '2024-04-10': '국회의원선거일', '2024-05-05': '어린이날', '2024-05-06': '대체공휴일',
  '2024-05-15': '부처님오신날', '2024-06-06': '현충일', '2024-08-15': '광복절',
  '2024-09-16': '추석 연휴', '2024-09-17': '추석', '2024-09-18': '추석 연휴',
  '2024-10-03': '개천절', '2024-10-09': '한글날', '2024-12-25': '크리스마스',
  '2025-01-01': '신정', '2025-01-28': '설날 연휴', '2025-01-29': '설날',
  '2025-01-30': '설날 연휴', '2025-03-01': '3·1절', '2025-03-03': '대체공휴일',
  '2025-05-05': '어린이날', '2025-05-06': '부처님오신날', '2025-06-06': '현충일',
  '2025-08-15': '광복절', '2025-10-03': '개천절', '2025-10-05': '추석 연휴',
  '2025-10-06': '추석', '2025-10-07': '추석 연휴', '2025-10-08': '대체공휴일',
  '2025-10-09': '한글날', '2025-12-25': '크리스마스',
  '2026-01-01': '신정', '2026-02-16': '설날 연휴', '2026-02-17': '설날',
  '2026-02-18': '설날 연휴', '2026-03-01': '3·1절', '2026-03-02': '대체공휴일',
  '2026-05-05': '어린이날', '2026-05-24': '부처님오신날', '2026-05-25': '대체공휴일',
  '2026-06-06': '현충일', '2026-08-15': '광복절', '2026-08-17': '대체공휴일',
  '2026-09-24': '추석', '2026-09-25': '추석 연휴', '2026-10-03': '개천절',
  '2026-10-05': '대체공휴일', '2026-10-09': '한글날', '2026-12-25': '크리스마스',
};

/* ── 색상 매핑 ── */
const TYPE_STYLE: Record<string, { bg: string; text: string; label: string; dot: string }> = {
  leave:   { bg: 'bg-green-500/20 border border-green-500/40',   text: 'text-green-300',  dot: 'bg-green-400',  label: '연차' },
  dayoff:  { bg: 'bg-blue-500/20 border border-blue-500/40',     text: 'text-blue-300',   dot: 'bg-blue-400',   label: '휴무' },
  holiday: { bg: 'bg-red-500/20 border border-red-500/40',       text: 'text-red-300',    dot: 'bg-red-400',    label: '공휴일' },
  task:    { bg: 'bg-yellow-500/20 border border-yellow-500/40', text: 'text-yellow-300', dot: 'bg-yellow-400', label: '업무' },
};

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  pending:  { label: '대기중',  cls: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700/40' },
  approved: { label: '승인됨',  cls: 'bg-green-900/40 text-green-300 border border-green-700/40' },
  rejected: { label: '거절됨',  cls: 'bg-red-900/40 text-red-300 border border-red-700/40' },
};

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: '연차', half_am: '반차(오전)', half_pm: '반차(오후)',
};
const DAYOFF_TYPE_LABELS: Record<string, string> = {
  regular: '정기휴무', substitute: '대체휴무', unpaid: '무급휴무',
};

/* ── 날짜 유틸 ── */
const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function getMonthDays(year: number, month: number): Date[] {
  const first  = new Date(year, month, 1);
  const dow    = first.getDay();
  const last   = new Date(year, month + 1, 0).getDate();
  const days: Date[] = [];
  for (let i = dow - 1; i >= 0; i--) days.push(new Date(year, month, -i));
  for (let d = 1; d <= last; d++)      days.push(new Date(year, month, d));
  while (days.length % 7 !== 0)        days.push(new Date(year, month + 1, days.length - dow - last + 1));
  return days;
}

function getWeekDays(date: Date): Date[] {
  const sun = new Date(date);
  sun.setDate(date.getDate() - date.getDay());
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(sun); d.setDate(sun.getDate() + i); return d; });
}

/* ══════════════════════════════════════ */
function HrCalendarContent() {
  const { user }         = useAuth();
  const { currentStore } = useStore();
  const searchParams     = useSearchParams();

  const [tab,       setTab]       = useState<TabType>('calendar');
  const [view,      setView]      = useState<ViewMode>('month');
  const [cursor,    setCursor]    = useState(new Date());
  const [events,    setEvents]    = useState<CalEvent[]>([]);
  const [leaves,    setLeaves]    = useState<LeaveRequest[]>([]);
  const [dayoffs,   setDayoffs]   = useState<DayoffRequest[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState<string | null>(null); // YYYY-MM-DD
  const [modal,     setModal]     = useState<'date' | 'leave' | 'dayoff' | 'event' | null>(null);
  const [toast,     setToast]     = useState<{ msg: string; ok: boolean } | null>(null);
  const [isAdmin,   setIsAdmin]   = useState(false);
  const [extEvents, setExtEvents] = useState<CalEvent[]>([]); // google + naver

  // 연동 상태
  const [googleConn, setGoogleConn] = useState<{ connected: boolean; email: string }>({ connected: false, email: '' });
  const [naverConn,  setNaverConn]  = useState<{ connected: boolean; name:  string }>({ connected: false, name: '' });
  const [connLoading, setConnLoading] = useState(false);

  // 연차 신청 폼
  const [leaveForm, setLeaveForm] = useState({ type: 'annual', startDate: '', endDate: '', reason: '' });
  const [dayoffForm, setDayoffForm] = useState({ type: 'regular', dates: [] as string[], reason: '' });
  const [dayoffDateInput, setDayoffDateInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 이벤트 등록 폼 (관리자)
  const [eventForm, setEventForm] = useState({ title: '', startDate: '', endDate: '', type: 'task', description: '' });

  // iCal 업로드
  const icalRef = useRef<HTMLInputElement>(null);
  const [icalEvents, setIcalEvents] = useState<CalEvent[]>([]);

  const uid       = user?.uid || '';
  const storeId   = currentStore?.storeId || '';
  const monthKey  = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;

  /* ── URL 파라미터로 탭 초기화 ── */
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'settings') setTab('settings');
  }, [searchParams]);

  /* ── 권한 확인 ── */
  useEffect(() => {
    if (!uid) return;
    fetch(`/api/permissions?type=myAccess&uid=${uid}${storeId ? `&storeId=${storeId}` : ''}`)
      .then(r => r.json())
      .then(d => {
        const role = d.role || '';
        setIsAdmin(['master', 'admin', 'owner'].includes(role));
      })
      .catch(() => {});
  }, [uid, storeId]);

  /* ── 데이터 로드 ── */
  const loadAll = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ month: monthKey });
      if (storeId) params.set('storeId', storeId);

      const [leaveRes, dayoffRes, eventsRes] = await Promise.all([
        isAdmin
          ? fetch(`/api/hr/leave?${params}`)
          : fetch(`/api/hr/leave?userId=${uid}&month=${monthKey}`),
        isAdmin
          ? fetch(`/api/hr/dayoff?${params}`)
          : fetch(`/api/hr/dayoff?userId=${uid}&month=${monthKey}`),
        fetch(`/api/hr/events?${params}`),
      ]);

      const [leaveData, dayoffData, eventsData] = await Promise.all([
        leaveRes.json(), dayoffRes.json(), eventsRes.json(),
      ]);

      const leaveList:  LeaveRequest[]  = leaveData.requests  || [];
      const dayoffList: DayoffRequest[] = dayoffData.requests || [];

      setLeaves(leaveList);
      setDayoffs(dayoffList);

      // 이벤트로 변환
      const evList: CalEvent[] = [];

      // 공휴일
      Object.entries(HOLIDAYS).forEach(([date, name]) => {
        evList.push({ id: `holiday_${date}`, title: name, startDate: date, endDate: date, type: 'holiday', source: 'pitaya' });
      });

      // 연차
      leaveList.filter(l => l.status === 'approved').forEach(l => {
        evList.push({
          id: `leave_${l.id}`, title: `${l.userName} ${LEAVE_TYPE_LABELS[l.type] || l.type}`,
          startDate: l.startDate, endDate: l.endDate, type: 'leave', source: 'pitaya',
          status: l.status, userId: l.userId, userName: l.userName,
        });
      });

      // 대기중 연차 (반투명)
      leaveList.filter(l => l.status === 'pending').forEach(l => {
        evList.push({
          id: `leave_pending_${l.id}`, title: `${l.userName} ${LEAVE_TYPE_LABELS[l.type] || l.type} (대기)`,
          startDate: l.startDate, endDate: l.endDate, type: 'leave', source: 'pitaya',
          status: 'pending', userId: l.userId, userName: l.userName,
        });
      });

      // 휴무
      dayoffList.filter(d => d.status === 'approved').forEach(d => {
        d.dates.forEach(date => {
          evList.push({
            id: `dayoff_${d.id}_${date}`, title: `${d.userName} ${DAYOFF_TYPE_LABELS[d.type] || d.type}`,
            startDate: date, endDate: date, type: 'dayoff', source: 'pitaya',
            status: d.status, userId: d.userId, userName: d.userName,
          });
        });
      });

      dayoffList.filter(d => d.status === 'pending').forEach(d => {
        d.dates.forEach(date => {
          evList.push({
            id: `dayoff_pending_${d.id}_${date}`, title: `${d.userName} ${DAYOFF_TYPE_LABELS[d.type] || d.type} (대기)`,
            startDate: date, endDate: date, type: 'dayoff', source: 'pitaya',
            status: 'pending', userId: d.userId, userName: d.userName,
          });
        });
      });

      // 업무 일정
      (eventsData.events || []).forEach((e: any) => {
        evList.push({ ...e, type: 'task' as EventType, source: 'pitaya' });
      });

      setEvents(evList);
    } finally {
      setLoading(false);
    }
  }, [uid, storeId, monthKey, isAdmin]);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* ── 외부 캘린더 로드 ── */
  const loadExternal = useCallback(async () => {
    if (!uid) return;
    const [gRes, nRes] = await Promise.all([
      fetch(`/api/calendar/google?action=events&uid=${uid}`),
      fetch(`/api/calendar/naver?action=events&uid=${uid}`),
    ]);
    const [gData, nData] = await Promise.all([gRes.json(), nRes.json()]);
    setExtEvents([...(gData.events || []), ...(nData.events || [])]);
  }, [uid]);

  /* ── 연동 상태 로드 ── */
  const loadConnStatus = useCallback(async () => {
    if (!uid) return;
    const [gRes, nRes] = await Promise.all([
      fetch(`/api/calendar/google?action=status&uid=${uid}`),
      fetch(`/api/calendar/naver?action=status&uid=${uid}`),
    ]);
    const [g, n] = await Promise.all([gRes.json(), nRes.json()]);
    setGoogleConn({ connected: g.connected, email: g.email || '' });
    setNaverConn({ connected: n.connected, name: n.name || '' });
  }, [uid]);

  useEffect(() => {
    if (tab === 'settings') loadConnStatus();
  }, [tab, loadConnStatus]);

  useEffect(() => {
    loadExternal();
  }, [loadExternal]);

  /* ── 전체 이벤트 (로컬 + 외부 + iCal) ── */
  const allEvents = [...events, ...extEvents, ...icalEvents];

  /* ── 날짜별 이벤트 ── */
  const eventsOnDate = (dateStr: string) =>
    allEvents.filter(e => e.startDate <= dateStr && e.endDate >= dateStr);

  /* ── Toast ── */
  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  /* ── 연차 신청 ── */
  const submitLeave = async () => {
    if (!leaveForm.startDate || !leaveForm.endDate) { showToast('날짜를 선택해주세요', false); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/hr/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: uid, userName: user?.displayName || user?.email || '이름없음',
          userEmail: user?.email, storeId,
          type: leaveForm.type, startDate: leaveForm.startDate,
          endDate: leaveForm.endDate, reason: leaveForm.reason,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast('연차 신청이 완료되었습니다');
      setModal(null);
      setLeaveForm({ type: 'annual', startDate: '', endDate: '', reason: '' });
      loadAll();
    } catch (e: any) {
      showToast(e.message || '신청 실패', false);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── 휴무 신청 ── */
  const submitDayoff = async () => {
    if (!dayoffForm.dates.length) { showToast('날짜를 선택해주세요', false); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/hr/dayoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: uid, userName: user?.displayName || user?.email || '이름없음',
          userEmail: user?.email, storeId,
          type: dayoffForm.type, dates: dayoffForm.dates, reason: dayoffForm.reason,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast('휴무 신청이 완료되었습니다');
      setModal(null);
      setDayoffForm({ type: 'regular', dates: [], reason: '' });
      loadAll();
    } catch (e: any) {
      showToast(e.message || '신청 실패', false);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── 업무 일정 등록 (관리자) ── */
  const submitEvent = async () => {
    if (!eventForm.title || !eventForm.startDate) { showToast('필수 항목 입력해주세요', false); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/hr/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...eventForm, storeId, createdBy: uid }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast('일정이 등록되었습니다');
      setModal(null);
      setEventForm({ title: '', startDate: '', endDate: '', type: 'task', description: '' });
      loadAll();
    } catch (e: any) {
      showToast(e.message || '등록 실패', false);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── 승인/거절 ── */
  const approve = async (type: 'leave' | 'dayoff', id: string, status: 'approved' | 'rejected') => {
    try {
      const url  = type === 'leave' ? '/api/hr/leave' : '/api/hr/dayoff';
      const res  = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, approvedBy: uid, approvedByName: user?.displayName }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast(status === 'approved' ? '승인되었습니다' : '거절되었습니다');
      loadAll();
    } catch (e: any) {
      showToast(e.message || '처리 실패', false);
    }
  };

  /* ── 취소 ── */
  const cancel = async (type: 'leave' | 'dayoff', id: string) => {
    try {
      const url = type === 'leave'
        ? `/api/hr/leave?id=${id}&userId=${uid}`
        : `/api/hr/dayoff?id=${id}&userId=${uid}`;
      const res  = await fetch(url, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast('취소되었습니다');
      loadAll();
    } catch (e: any) {
      showToast(e.message || '취소 실패', false);
    }
  };

  /* ── Google 연동 ── */
  const connectGoogle = async () => {
    setConnLoading(true);
    try {
      const res  = await fetch(`/api/calendar/google?action=auth&uid=${uid}`);
      const data = await res.json();
      if (data.error) { showToast(data.error, false); return; }
      window.location.href = data.authUrl;
    } finally {
      setConnLoading(false);
    }
  };

  const disconnectGoogle = async () => {
    await fetch(`/api/calendar/google?uid=${uid}`, { method: 'DELETE' });
    setGoogleConn({ connected: false, email: '' });
    setExtEvents(prev => prev.filter(e => e.source !== 'google'));
    showToast('구글 캘린더 연동이 해제되었습니다');
  };

  /* ── Naver 연동 ── */
  const connectNaver = async () => {
    setConnLoading(true);
    try {
      const res  = await fetch(`/api/calendar/naver?action=auth&uid=${uid}`);
      const data = await res.json();
      if (data.error) { showToast(data.error, false); return; }
      window.location.href = data.authUrl;
    } finally {
      setConnLoading(false);
    }
  };

  const disconnectNaver = async () => {
    await fetch(`/api/calendar/naver?uid=${uid}`, { method: 'DELETE' });
    setNaverConn({ connected: false, name: '' });
    setExtEvents(prev => prev.filter(e => e.source !== 'naver'));
    showToast('네이버 캘린더 연동이 해제되었습니다');
  };

  /* ── iCal 가져오기 ── */
  const handleIcalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    form.append('userId', uid);
    form.append('storeId', storeId);
    try {
      const res  = await fetch('/api/calendar/ical', { method: 'POST', body: form });
      const data = await res.json();
      if (data.error) { showToast(data.error, false); return; }
      setIcalEvents(data.events || []);
      showToast(`${data.count}개 일정을 가져왔습니다`);
    } catch {
      showToast('파일 파싱 실패', false);
    }
  };

  /* ── iCal 내보내기 ── */
  const exportIcal = () => {
    const params = new URLSearchParams({ userId: uid });
    if (storeId) params.set('storeId', storeId);
    window.open(`/api/calendar/ical?${params}`, '_blank');
  };

  /* ── 월 이동 ── */
  const prevMonth = () => { const d = new Date(cursor); d.setMonth(d.getMonth() - 1); setCursor(d); };
  const nextMonth = () => { const d = new Date(cursor); d.setMonth(d.getMonth() + 1); setCursor(d); };
  const prevWeek  = () => { const d = new Date(cursor); d.setDate(d.getDate() - 7);   setCursor(d); };
  const nextWeek  = () => { const d = new Date(cursor); d.setDate(d.getDate() + 7);   setCursor(d); };
  const prevDay   = () => { const d = new Date(cursor); d.setDate(d.getDate() - 1);   setCursor(d); };
  const nextDay   = () => { const d = new Date(cursor); d.setDate(d.getDate() + 1);   setCursor(d); };
  const goToday   = () => setCursor(new Date());

  const onPrev  = view === 'month' ? prevMonth : view === 'week' ? prevWeek : prevDay;
  const onNext  = view === 'month' ? nextMonth : view === 'week' ? nextWeek : nextDay;

  const todayStr = toDateStr(new Date());

  /* ── 월간 달력 ── */
  const renderMonth = () => {
    const days = getMonthDays(cursor.getFullYear(), cursor.getMonth());
    const DOW  = ['일', '월', '화', '수', '목', '금', '토'];

    return (
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-7 border-b border-slate-800">
          {DOW.map((d, i) => (
            <div key={d} className={`py-2 text-center text-xs font-semibold ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-500'}`}>
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 flex-1">
          {days.map((day, idx) => {
            const ds      = toDateStr(day);
            const isToday = ds === todayStr;
            const inMonth = day.getMonth() === cursor.getMonth();
            const isSun   = day.getDay() === 0;
            const isSat   = day.getDay() === 6;
            const dayEvs  = eventsOnDate(ds);
            const isSelected = selected === ds;

            return (
              <div
                key={idx}
                onClick={() => { setSelected(ds); setModal('date'); }}
                className={`min-h-[80px] md:min-h-[100px] p-1 border-b border-r border-slate-800/60 cursor-pointer hover:bg-slate-800/40 transition-colors ${
                  !inMonth ? 'opacity-30' : ''
                } ${isSelected ? 'ring-1 ring-inset ring-teal-500' : ''}`}
              >
                <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold mb-1 ${
                  isToday
                    ? 'bg-teal-500 text-black'
                    : isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-slate-400'
                }`}>
                  {day.getDate()}
                </div>
                <div className="space-y-0.5">
                  {dayEvs.slice(0, 3).map(ev => {
                    const s = TYPE_STYLE[ev.type] || TYPE_STYLE.task;
                    const isPending = ev.status === 'pending';
                    return (
                      <div key={ev.id} className={`text-[9px] md:text-[10px] px-1 py-0.5 rounded truncate ${s.bg} ${s.text} ${isPending ? 'opacity-50' : ''}`}>
                        {ev.source === 'google' && <span className="mr-0.5 font-bold">G</span>}
                        {ev.source === 'naver'  && <span className="mr-0.5 font-bold">N</span>}
                        {ev.title}
                      </div>
                    );
                  })}
                  {dayEvs.length > 3 && (
                    <div className="text-[9px] text-slate-500 px-1">+{dayEvs.length - 3}개 더</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /* ── 주간 보기 ── */
  const renderWeek = () => {
    const days = getWeekDays(cursor);
    const DOW  = ['일', '월', '화', '수', '목', '금', '토'];

    return (
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-7 border-b border-slate-800">
          {days.map((day, i) => {
            const ds      = toDateStr(day);
            const isToday = ds === todayStr;
            return (
              <div key={i} className={`py-3 text-center border-r border-slate-800/60 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'}`}>
                <div className="text-[10px] text-slate-500">{DOW[i]}</div>
                <div className={`mt-1 w-7 h-7 mx-auto flex items-center justify-center rounded-full text-sm font-semibold ${isToday ? 'bg-teal-500 text-black' : ''}`}>
                  {day.getDate()}
                </div>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const ds     = toDateStr(day);
            const dayEvs = eventsOnDate(ds);
            return (
              <div
                key={i}
                onClick={() => { setSelected(ds); setModal('date'); }}
                className="min-h-[300px] p-2 border-r border-b border-slate-800/60 cursor-pointer hover:bg-slate-800/30 transition-colors"
              >
                <div className="space-y-1">
                  {dayEvs.map(ev => {
                    const s = TYPE_STYLE[ev.type] || TYPE_STYLE.task;
                    const isPending = ev.status === 'pending';
                    return (
                      <div key={ev.id} className={`text-[10px] px-1.5 py-1 rounded ${s.bg} ${s.text} ${isPending ? 'opacity-50' : ''}`}>
                        {ev.source !== 'pitaya' && <span className="font-bold">{ev.source === 'google' ? 'G ' : 'N '}</span>}
                        <span className="truncate block">{ev.title}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /* ── 일간 보기 ── */
  const renderDay = () => {
    const ds     = toDateStr(cursor);
    const dayEvs = eventsOnDate(ds);
    const isToday = ds === todayStr;

    return (
      <div className="flex-1 p-4">
        <div className={`text-2xl font-bold mb-4 ${isToday ? 'text-teal-400' : 'text-slate-200'}`}>
          {cursor.getFullYear()}년 {cursor.getMonth() + 1}월 {cursor.getDate()}일
          {isToday && <span className="ml-2 text-sm bg-teal-500 text-black px-2 py-0.5 rounded-full">오늘</span>}
        </div>
        {dayEvs.length === 0 ? (
          <div className="text-slate-600 text-sm py-8 text-center">일정이 없습니다</div>
        ) : (
          <div className="space-y-2">
            {dayEvs.map(ev => {
              const s = TYPE_STYLE[ev.type] || TYPE_STYLE.task;
              return (
                <div key={ev.id} className={`p-3 rounded-xl ${s.bg} ${s.text} ${ev.status === 'pending' ? 'opacity-60' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
                    <span className="font-semibold">{ev.title}</span>
                    {ev.source !== 'pitaya' && (
                      <span className="text-[9px] bg-white/10 px-1 rounded">{ev.source === 'google' ? 'Google' : ev.source === 'naver' ? 'Naver' : 'iCal'}</span>
                    )}
                    {ev.status === 'pending' && <span className="text-[9px] bg-white/10 px-1 rounded">대기중</span>}
                  </div>
                  {ev.description && <p className="text-xs mt-1 opacity-70">{ev.description}</p>}
                </div>
              );
            })}
          </div>
        )}
        <button
          onClick={() => { setSelected(ds); setModal('date'); }}
          className="mt-4 flex items-center gap-2 text-sm text-teal-400 hover:text-teal-300"
        >
          <Plus className="w-4 h-4" /> 이 날에 신청하기
        </button>
      </div>
    );
  };

  /* ── 날짜 상세 모달 ── */
  const renderDateModal = () => {
    if (!selected) return null;
    const dayEvs = eventsOnDate(selected);
    const [y, m, d] = selected.split('-').map(Number);
    const dateLabel  = `${y}년 ${m}월 ${d}일`;
    const holiday    = HOLIDAYS[selected];

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-5 border-b border-slate-800">
            <div>
              <h3 className="text-slate-100 font-bold text-lg">{dateLabel}</h3>
              {holiday && <p className="text-red-400 text-xs mt-0.5">{holiday}</p>}
            </div>
            <button onClick={() => setModal(null)} className="text-slate-500 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 max-h-64 overflow-y-auto">
            {dayEvs.length === 0 ? (
              <p className="text-slate-600 text-sm text-center py-4">일정이 없습니다</p>
            ) : (
              <div className="space-y-2">
                {dayEvs.map(ev => {
                  const s = TYPE_STYLE[ev.type] || TYPE_STYLE.task;
                  return (
                    <div key={ev.id} className={`flex items-center gap-2 p-2.5 rounded-lg ${s.bg}`}>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${s.text}`}>{ev.title}</p>
                        {ev.userName && <p className="text-xs text-slate-500">{ev.userName}</p>}
                      </div>
                      {ev.status && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${STATUS_STYLE[ev.status]?.cls || ''}`}>
                          {STATUS_STYLE[ev.status]?.label}
                        </span>
                      )}
                      {/* 관리자 승인 버튼 */}
                      {isAdmin && ev.status === 'pending' && ev.source === 'pitaya' && (
                        <div className="flex gap-1 ml-1">
                          <button
                            onClick={() => {
                              const type  = ev.type as 'leave' | 'dayoff';
                              const rawId = ev.id.replace(/^(leave|dayoff)_pending_/, '').replace(/_\d{4}-\d{2}-\d{2}$/, '');
                              approve(type, rawId, 'approved');
                            }}
                            className="w-5 h-5 rounded-full bg-green-600 hover:bg-green-500 flex items-center justify-center"
                          >
                            <Check className="w-3 h-3 text-white" />
                          </button>
                          <button
                            onClick={() => {
                              const type  = ev.type as 'leave' | 'dayoff';
                              const rawId = ev.id.replace(/^(leave|dayoff)_pending_/, '').replace(/_\d{4}-\d{2}-\d{2}$/, '');
                              approve(type, rawId, 'rejected');
                            }}
                            className="w-5 h-5 rounded-full bg-red-700 hover:bg-red-600 flex items-center justify-center"
                          >
                            <X className="w-3 h-3 text-white" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-5 border-t border-slate-800 flex flex-wrap gap-2">
            <button
              onClick={() => { setLeaveForm(f => ({ ...f, startDate: selected, endDate: selected })); setModal('leave'); }}
              className="flex items-center gap-2 px-3 py-2 bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 text-green-300 rounded-lg text-sm"
            >
              <Calendar className="w-3.5 h-3.5" /> 연차 신청
            </button>
            <button
              onClick={() => { setDayoffForm(f => ({ ...f, dates: [selected] })); setModal('dayoff'); }}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 rounded-lg text-sm"
            >
              <Clock className="w-3.5 h-3.5" /> 휴무 신청
            </button>
            {isAdmin && (
              <button
                onClick={() => { setEventForm(f => ({ ...f, startDate: selected, endDate: selected })); setModal('event'); }}
                className="flex items-center gap-2 px-3 py-2 bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-500/30 text-yellow-300 rounded-lg text-sm"
              >
                <Tag className="w-3.5 h-3.5" /> 일정 등록
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  /* ── 연차 신청 모달 ── */
  const renderLeaveModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setModal('date')}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h3 className="text-slate-100 font-bold">연차 신청</h3>
          <button onClick={() => setModal('date')} className="text-slate-500 hover:text-white p-1"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">연차 유형</label>
            <select
              value={leaveForm.type}
              onChange={e => setLeaveForm(f => ({ ...f, type: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
            >
              <option value="annual">연차</option>
              <option value="half_am">반차 (오전)</option>
              <option value="half_pm">반차 (오후)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">시작일</label>
              <input type="date" value={leaveForm.startDate} onChange={e => setLeaveForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">종료일</label>
              <input type="date" value={leaveForm.endDate} onChange={e => setLeaveForm(f => ({ ...f, endDate: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">사유 (선택)</label>
            <textarea value={leaveForm.reason} onChange={e => setLeaveForm(f => ({ ...f, reason: e.target.value }))}
              rows={3} placeholder="사유를 입력해주세요"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 resize-none" />
          </div>
        </div>
        <div className="p-5 border-t border-slate-800 flex gap-2 justify-end">
          <button onClick={() => setModal('date')} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">취소</button>
          <button onClick={submitLeave} disabled={submitting}
            className="px-4 py-2 text-sm bg-green-600 hover:bg-green-500 text-white rounded-lg disabled:opacity-50">
            {submitting ? '신청중...' : '신청하기'}
          </button>
        </div>
      </div>
    </div>
  );

  /* ── 휴무 신청 모달 ── */
  const renderDayoffModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setModal('date')}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h3 className="text-slate-100 font-bold">휴무 신청</h3>
          <button onClick={() => setModal('date')} className="text-slate-500 hover:text-white p-1"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">휴무 유형</label>
            <select value={dayoffForm.type} onChange={e => setDayoffForm(f => ({ ...f, type: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
              <option value="regular">정기휴무</option>
              <option value="substitute">대체휴무</option>
              <option value="unpaid">무급휴무</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">날짜 추가</label>
            <div className="flex gap-2">
              <input type="date" value={dayoffDateInput} onChange={e => setDayoffDateInput(e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
              <button
                onClick={() => {
                  if (dayoffDateInput && !dayoffForm.dates.includes(dayoffDateInput)) {
                    setDayoffForm(f => ({ ...f, dates: [...f.dates, dayoffDateInput].sort() }));
                    setDayoffDateInput('');
                  }
                }}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm"
              >추가</button>
            </div>
            {dayoffForm.dates.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {dayoffForm.dates.map(d => (
                  <span key={d} className="flex items-center gap-1 px-2 py-0.5 bg-blue-900/40 text-blue-300 text-xs rounded-full border border-blue-700/40">
                    {d}
                    <button onClick={() => setDayoffForm(f => ({ ...f, dates: f.dates.filter(x => x !== d) }))}
                      className="hover:text-red-400"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">사유 (선택)</label>
            <textarea value={dayoffForm.reason} onChange={e => setDayoffForm(f => ({ ...f, reason: e.target.value }))}
              rows={3} placeholder="사유를 입력해주세요"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 resize-none" />
          </div>
        </div>
        <div className="p-5 border-t border-slate-800 flex gap-2 justify-end">
          <button onClick={() => setModal('date')} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">취소</button>
          <button onClick={submitDayoff} disabled={submitting}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50">
            {submitting ? '신청중...' : '신청하기'}
          </button>
        </div>
      </div>
    </div>
  );

  /* ── 업무 일정 등록 모달 ── */
  const renderEventModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setModal('date')}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h3 className="text-slate-100 font-bold">업무 일정 등록</h3>
          <button onClick={() => setModal('date')} className="text-slate-500 hover:text-white p-1"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">일정 제목</label>
            <input type="text" value={eventForm.title} onChange={e => setEventForm(f => ({ ...f, title: e.target.value }))}
              placeholder="일정 제목 입력"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">시작일</label>
              <input type="date" value={eventForm.startDate} onChange={e => setEventForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">종료일</label>
              <input type="date" value={eventForm.endDate} onChange={e => setEventForm(f => ({ ...f, endDate: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">설명 (선택)</label>
            <textarea value={eventForm.description} onChange={e => setEventForm(f => ({ ...f, description: e.target.value }))}
              rows={2} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 resize-none" />
          </div>
        </div>
        <div className="p-5 border-t border-slate-800 flex gap-2 justify-end">
          <button onClick={() => setModal('date')} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">취소</button>
          <button onClick={submitEvent} disabled={submitting}
            className="px-4 py-2 text-sm bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg disabled:opacity-50">
            {submitting ? '등록중...' : '등록하기'}
          </button>
        </div>
      </div>
    </div>
  );

  /* ── 내 신청 현황 탭 ── */
  const renderMyRequests = () => {
    const myLeaves  = leaves.filter(l => isAdmin || l.userId === uid);
    const myDayoffs = dayoffs.filter(d => isAdmin || d.userId === uid);

    return (
      <div className="p-4 space-y-6">
        {/* 연차 목록 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-slate-300 font-semibold text-sm">연차 신청 내역</h3>
            <button onClick={() => { setLeaveForm({ type: 'annual', startDate: '', endDate: '', reason: '' }); setModal('leave'); setSelected(todayStr); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 border border-green-500/30 text-green-300 rounded-lg text-xs hover:bg-green-600/30">
              <Plus className="w-3.5 h-3.5" /> 연차 신청
            </button>
          </div>
          {myLeaves.length === 0 ? (
            <div className="text-slate-600 text-sm text-center py-6 bg-slate-800/30 rounded-xl">신청 내역이 없습니다</div>
          ) : (
            <div className="space-y-2">
              {myLeaves.map(l => (
                <div key={l.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {isAdmin && <p className="text-slate-400 text-xs mb-0.5">{l.userName}</p>}
                      <p className="text-slate-200 text-sm font-medium">{LEAVE_TYPE_LABELS[l.type] || l.type}</p>
                      <p className="text-slate-500 text-xs">{l.startDate} ~ {l.endDate}</p>
                      {l.reason && <p className="text-slate-600 text-xs mt-1">{l.reason}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_STYLE[l.status]?.cls || ''}`}>
                        {STATUS_STYLE[l.status]?.label || l.status}
                      </span>
                      {/* 관리자 승인 버튼 */}
                      {isAdmin && l.status === 'pending' && (
                        <div className="flex gap-1">
                          <button onClick={() => approve('leave', l.id, 'approved')}
                            className="w-6 h-6 rounded-full bg-green-700 hover:bg-green-600 flex items-center justify-center">
                            <Check className="w-3.5 h-3.5 text-white" />
                          </button>
                          <button onClick={() => approve('leave', l.id, 'rejected')}
                            className="w-6 h-6 rounded-full bg-red-800 hover:bg-red-700 flex items-center justify-center">
                            <X className="w-3.5 h-3.5 text-white" />
                          </button>
                        </div>
                      )}
                      {/* 본인 취소 */}
                      {l.userId === uid && l.status === 'pending' && (
                        <button onClick={() => cancel('leave', l.id)}
                          className="text-xs text-slate-500 hover:text-red-400">취소</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 휴무 목록 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-slate-300 font-semibold text-sm">휴무 신청 내역</h3>
            <button onClick={() => { setDayoffForm({ type: 'regular', dates: [], reason: '' }); setModal('dayoff'); setSelected(todayStr); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 text-blue-300 rounded-lg text-xs hover:bg-blue-600/30">
              <Plus className="w-3.5 h-3.5" /> 휴무 신청
            </button>
          </div>
          {myDayoffs.length === 0 ? (
            <div className="text-slate-600 text-sm text-center py-6 bg-slate-800/30 rounded-xl">신청 내역이 없습니다</div>
          ) : (
            <div className="space-y-2">
              {myDayoffs.map(d => (
                <div key={d.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {isAdmin && <p className="text-slate-400 text-xs mb-0.5">{d.userName}</p>}
                      <p className="text-slate-200 text-sm font-medium">{DAYOFF_TYPE_LABELS[d.type] || d.type}</p>
                      <p className="text-slate-500 text-xs">{d.dates.join(', ')}</p>
                      {d.reason && <p className="text-slate-600 text-xs mt-1">{d.reason}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_STYLE[d.status]?.cls || ''}`}>
                        {STATUS_STYLE[d.status]?.label || d.status}
                      </span>
                      {isAdmin && d.status === 'pending' && (
                        <div className="flex gap-1">
                          <button onClick={() => approve('dayoff', d.id, 'approved')}
                            className="w-6 h-6 rounded-full bg-green-700 hover:bg-green-600 flex items-center justify-center">
                            <Check className="w-3.5 h-3.5 text-white" />
                          </button>
                          <button onClick={() => approve('dayoff', d.id, 'rejected')}
                            className="w-6 h-6 rounded-full bg-red-800 hover:bg-red-700 flex items-center justify-center">
                            <X className="w-3.5 h-3.5 text-white" />
                          </button>
                        </div>
                      )}
                      {d.userId === uid && d.status === 'pending' && (
                        <button onClick={() => cancel('dayoff', d.id)}
                          className="text-xs text-slate-500 hover:text-red-400">취소</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ── 연동 설정 탭 ── */
  const renderSettings = () => (
    <div className="p-4 space-y-6">
      {/* 범례 */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-3">범례</h3>
        <div className="flex flex-wrap gap-3">
          {Object.entries(TYPE_STYLE).map(([key, val]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-sm ${val.dot}`} />
              <span className="text-xs text-slate-400">{val.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Google Calendar */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shrink-0">
            <span className="text-sm font-black text-slate-800">G</span>
          </div>
          <div className="flex-1">
            <h3 className="text-slate-200 font-semibold text-sm">구글 캘린더</h3>
            <p className="text-slate-500 text-xs">Google Calendar API v3 연동</p>
          </div>
          <div className={`text-[10px] px-2 py-0.5 rounded-full border ${googleConn.connected ? 'bg-green-900/40 text-green-300 border-green-700/40' : 'bg-slate-700 text-slate-400 border-slate-600'}`}>
            {googleConn.connected ? '연결됨' : '미연결'}
          </div>
        </div>
        {googleConn.connected ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">{googleConn.email}</p>
            <div className="flex gap-2">
              <button onClick={loadExternal} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs">
                <RefreshCw className="w-3 h-3" /> 새로고침
              </button>
              <button onClick={disconnectGoogle} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 border border-red-700/40 text-red-400 rounded-lg text-xs">
                연동 해제
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Google Calendar의 일정을 Pitaya OS에서 확인하세요.</p>
            {process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_ENABLED === 'true' ? (
              <button onClick={connectGoogle} disabled={connLoading}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm disabled:opacity-50">
                <ExternalLink className="w-3.5 h-3.5" />
                {connLoading ? '연결 중...' : '구글 캘린더 연동'}
              </button>
            ) : (
              <p className="text-xs text-slate-600 bg-slate-800 rounded-lg px-3 py-2">
                관리자가 GOOGLE_CALENDAR_CLIENT_ID를 설정하면 활성화됩니다.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Naver Calendar */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-sm font-black text-white">N</span>
          </div>
          <div className="flex-1">
            <h3 className="text-slate-200 font-semibold text-sm">네이버 캘린더</h3>
            <p className="text-slate-500 text-xs">Naver Calendar API 연동</p>
          </div>
          <div className={`text-[10px] px-2 py-0.5 rounded-full border ${naverConn.connected ? 'bg-green-900/40 text-green-300 border-green-700/40' : 'bg-slate-700 text-slate-400 border-slate-600'}`}>
            {naverConn.connected ? '연결됨' : '미연결'}
          </div>
        </div>
        {naverConn.connected ? (
          <div className="space-y-2">
            {naverConn.name && <p className="text-xs text-slate-500">{naverConn.name}</p>}
            <div className="flex gap-2">
              <button onClick={loadExternal} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs">
                <RefreshCw className="w-3 h-3" /> 새로고침
              </button>
              <button onClick={disconnectNaver} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 border border-red-700/40 text-red-400 rounded-lg text-xs">
                연동 해제
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">네이버 캘린더의 일정을 Pitaya OS에서 확인하세요.</p>
            {process.env.NEXT_PUBLIC_NAVER_CALENDAR_ENABLED === 'true' ? (
              <button onClick={connectNaver} disabled={connLoading}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm disabled:opacity-50">
                <ExternalLink className="w-3.5 h-3.5" />
                {connLoading ? '연결 중...' : '네이버 캘린더 연동'}
              </button>
            ) : (
              <p className="text-xs text-slate-600 bg-slate-800 rounded-lg px-3 py-2">
                관리자가 NAVER_CLIENT_ID를 설정하면 활성화됩니다.
              </p>
            )}
          </div>
        )}
      </div>

      {/* 삼성/애플 — iCal */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-slate-600 rounded-lg flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4 text-slate-300" />
          </div>
          <div className="flex-1">
            <h3 className="text-slate-200 font-semibold text-sm">삼성/애플 캘린더 (iCal)</h3>
            <p className="text-slate-500 text-xs">.ics 파일로 가져오기/내보내기</p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="bg-slate-900/60 rounded-lg p-3 text-xs text-slate-400 space-y-1">
            <p className="font-semibold text-slate-300">삼성/애플 캘린더 연동 방법</p>
            <p>1. 아래 내보내기로 .ics 파일을 다운로드합니다</p>
            <p>2. 삼성/애플 캘린더 앱에서 파일을 가져오기합니다</p>
            <p>3. 또는 삼성/애플에서 내보낸 .ics 파일을 업로드합니다</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={exportIcal}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm">
              <Download className="w-3.5 h-3.5" /> .ics 내보내기
            </button>
            <button onClick={() => icalRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm">
              <Upload className="w-3.5 h-3.5" /> .ics 가져오기
            </button>
            <input ref={icalRef} type="file" accept=".ics" onChange={handleIcalUpload} className="hidden" />
          </div>
          {icalEvents.length > 0 && (
            <div className="flex items-center justify-between bg-slate-700/50 rounded-lg px-3 py-2 text-xs">
              <span className="text-slate-400">{icalEvents.length}개 iCal 일정 로드됨</span>
              <button onClick={() => setIcalEvents([])} className="text-red-400 hover:text-red-300">제거</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  /* ── 헤더 타이틀 ── */
  const headerTitle = () => {
    if (view === 'month') return `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`;
    if (view === 'week') {
      const days = getWeekDays(cursor);
      return `${days[0].getMonth() + 1}월 ${days[0].getDate()}일 ~ ${days[6].getMonth() + 1}월 ${days[6].getDate()}일`;
    }
    return `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월 ${cursor.getDate()}일`;
  };

  /* ════════════════════════════ RENDER ════════════════════════════ */
  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* 페이지 헤더 */}
      <div className="px-4 md:px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-slate-100 font-bold text-lg">인사 달력</h1>
          <p className="text-slate-500 text-xs">연차·휴무 신청 및 일정 관리</p>
        </div>
        {/* 탭 */}
        <div className="flex gap-1 bg-slate-800 rounded-xl p-1">
          {([['calendar', <Calendar className="w-3.5 h-3.5" />, '달력'],
             ['my-requests', <FileText className="w-3.5 h-3.5" />, '내 신청'],
             ['settings', <Settings className="w-3.5 h-3.5" />, '설정']] as const).map(([key, icon, label]) => (
            <button key={key} onClick={() => setTab(key as TabType)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === key ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}>
              {icon}{label}
            </button>
          ))}
        </div>
      </div>

      {/* 달력 탭 */}
      {tab === 'calendar' && (
        <>
          {/* 달력 컨트롤 바 */}
          <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              <button onClick={onPrev} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-slate-200 font-semibold text-sm min-w-[140px] text-center">{headerTitle()}</span>
              <button onClick={onNext} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button onClick={goToday} className="px-3 py-1.5 text-xs border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 rounded-lg">
              오늘
            </button>
            <div className="ml-auto flex gap-1 bg-slate-800 rounded-lg p-0.5">
              {(['month', 'week', 'day'] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${view === v ? 'bg-slate-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                  {{ month: '월', week: '주', day: '일' }[v]}
                </button>
              ))}
            </div>
            <button onClick={() => loadAll()} className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* 범례 */}
          <div className="px-4 py-2 border-b border-slate-800/60 flex flex-wrap gap-3">
            {Object.entries(TYPE_STYLE).map(([key, val]) => (
              <div key={key} className="flex items-center gap-1">
                <span className={`w-2.5 h-2.5 rounded-sm ${val.dot}`} />
                <span className="text-[10px] text-slate-500">{val.label}</span>
              </div>
            ))}
            {extEvents.some(e => e.source === 'google') && (
              <div className="flex items-center gap-1">
                <span className="w-4 h-4 rounded bg-blue-600 flex items-center justify-center text-[9px] font-bold text-white">G</span>
                <span className="text-[10px] text-slate-500">구글</span>
              </div>
            )}
            {extEvents.some(e => e.source === 'naver') && (
              <div className="flex items-center gap-1">
                <span className="w-4 h-4 rounded bg-green-600 flex items-center justify-center text-[9px] font-bold text-white">N</span>
                <span className="text-[10px] text-slate-500">네이버</span>
              </div>
            )}
          </div>

          {/* 달력 뷰 */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-slate-600 animate-spin" />
              </div>
            ) : (
              <>
                {view === 'month' && renderMonth()}
                {view === 'week'  && renderWeek()}
                {view === 'day'   && renderDay()}
              </>
            )}
          </div>
        </>
      )}

      {/* 내 신청 현황 탭 */}
      {tab === 'my-requests' && (
        <div className="flex-1 overflow-y-auto">
          {renderMyRequests()}
        </div>
      )}

      {/* 설정 탭 */}
      {tab === 'settings' && (
        <div className="flex-1 overflow-y-auto">
          {renderSettings()}
        </div>
      )}

      {/* 모달 */}
      {modal === 'date'   && renderDateModal()}
      {modal === 'leave'  && renderLeaveModal()}
      {modal === 'dayoff' && renderDayoffModal()}
      {modal === 'event'  && renderEventModal()}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium ${
          toast.ok ? 'bg-teal-600 text-white' : 'bg-red-700 text-white'
        }`}>
          {toast.ok ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

export default function HrCalendarPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-6 h-6 text-slate-600 animate-spin" />
      </div>
    }>
      <HrCalendarContent />
    </Suspense>
  );
}

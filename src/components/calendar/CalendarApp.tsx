'use client';

import {
  useState, useEffect, useCallback, useRef, useMemo, KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, Plus, X, Check, Search, Printer,
  Download, Upload, RefreshCw, Eye, EyeOff, Trash2,
  Settings, MapPin, Video, Users, Bell, CheckSquare,
  List, Calendar as CalIcon, AlertCircle, ChevronDown, ChevronUp,
  SquarePen, ExternalLink, FileText, Clock, Bot, Send, Loader2,
} from 'lucide-react';
import {
  DragDropContext, Droppable, Draggable, DropResult,
} from '@hello-pangea/dnd';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import EventModal from './EventModal';
import {
  CalEvent, TodoItem, CalendarList, TodoList,
  ViewMode, GOOGLE_COLORS, DOW_KO, HOLIDAYS, RepeatConfig,
  toDateStr, getMonthDays, getWeekDays, getNDays, getWeekNumber,
  formatTime, timeToMinutes, eventsOnDate, getEventColor,
  SubTask,
} from './CalendarTypes';
import DateRangePicker from './DateRangePicker';
import LeavePanel from './LeavePanel';
import { isAdminLevelGroup } from '@/lib/roleMapping';

/** calendar_events 컬렉션으로 저장·수정 가능한 개인 일정인지 */
function isEditablePersonalEvent(ev: Partial<CalEvent> | CalEvent): boolean {
  if (!ev.id) return true;
  if (ev.type && ev.type !== 'event') return false;
  if (ev.source && ev.source !== 'pitaya') return false;
  if (ev.calendarId === 'hr' || ev.calendarId === 'holiday') return false;
  const id = ev.id;
  if (
    id.startsWith('holiday_') || id.startsWith('leave_') || id.startsWith('dayoff_') ||
    id.startsWith('google_') || id.startsWith('naver_') || id.startsWith('todo_')
  ) return false;
  return true;
}

/* ═══════════════════════ MINI CALENDAR ═══════════════════════ */
function MiniCalendar({
  cursor, onSelectDate, events,
}: { cursor: Date; onSelectDate: (d: Date) => void; events: CalEvent[] }) {
  const [miniCursor, setMiniCursor] = useState(new Date(cursor));
  const todayStr = toDateStr(new Date());
  const days = getMonthDays(miniCursor.getFullYear(), miniCursor.getMonth());

  const hasEvent = (ds: string) => events.some(e => e.startDate <= ds && e.endDate >= ds);

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-300">
          {miniCursor.getFullYear()}년 {miniCursor.getMonth() + 1}월
        </span>
        <div className="flex gap-0.5">
          <button onClick={() => { const d = new Date(miniCursor); d.setMonth(d.getMonth() - 1); setMiniCursor(d); }}
            className="p-1 text-slate-500 hover:text-slate-300 rounded">
            <ChevronLeft className="w-3 h-3" />
          </button>
          <button onClick={() => { const d = new Date(miniCursor); d.setMonth(d.getMonth() + 1); setMiniCursor(d); }}
            className="p-1 text-slate-500 hover:text-slate-300 rounded">
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {DOW_KO.map((d, i) => (
          <div key={d} className={`text-center text-[10px] font-semibold ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-600'}`}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day, idx) => {
          const ds     = toDateStr(day);
          const inMon  = day.getMonth() === miniCursor.getMonth();
          const isToday = ds === todayStr;
          const isCursor = ds === toDateStr(cursor);
          const isSun  = day.getDay() === 0;
          const isSat  = day.getDay() === 6;
          return (
            <button
              key={idx}
              onClick={() => onSelectDate(day)}
              className={`relative w-6 h-6 flex flex-col items-center justify-center rounded-full text-[10px] transition-colors mx-auto
                ${!inMon ? 'opacity-25' : ''}
                ${isToday ? 'bg-teal-600 text-black font-bold' : ''}
                ${isCursor && !isToday ? 'bg-slate-700 text-white' : ''}
                ${!isToday && !isCursor ? (isSun ? 'text-red-400 hover:bg-slate-800' : isSat ? 'text-blue-400 hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-800') : ''}
              `}
            >
              {day.getDate()}
              {hasEvent(ds) && !isToday && (
                <span className="absolute bottom-0.5 w-1 h-1 bg-teal-400 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════ EVENT BLOCK ═══════════════════════ */
function EventBlock({
  ev, calendars, compact = false, onClick,
}: {
  ev: CalEvent; calendars: CalendarList[]; compact?: boolean; onClick?: (ev: CalEvent) => void;
}) {
  const color = getEventColor(ev, calendars);
  const isPending = ev.status === 'pending';

  return (
    <div
      onClick={e => { e.stopPropagation(); onClick?.(ev); }}
      className={`rounded px-1.5 cursor-pointer select-none transition-opacity hover:opacity-80 ${
        compact ? 'py-0' : 'py-0.5'
      } ${isPending ? 'opacity-50' : ''}`}
      style={{ backgroundColor: color + '33', borderLeft: `3px solid ${color}` }}
    >
      <span className="text-[10px] md:text-xs truncate block font-medium" style={{ color }}>
        {ev.source === 'google' && <span className="font-bold mr-0.5">G·</span>}
        {ev.source === 'naver'  && <span className="font-bold mr-0.5">N·</span>}
        {ev.type === 'todo' && <CheckSquare className="inline w-2.5 h-2.5 mr-0.5" />}
        {ev.title}
      </span>
    </div>
  );
}

/* ═══════════════════════ EVENT POPOVER ═══════════════════════ */
function EventPopover({
  ev, calendars, onEdit, onDelete, onClose,
  position,
}: {
  ev: CalEvent; calendars: CalendarList[];
  onEdit: () => void; onDelete: () => void; onClose: () => void;
  position?: { x: number; y: number };
}) {
  const color = getEventColor(ev, calendars);
  const cal   = calendars.find(c => c.id === ev.calendarId);
  const editable = isEditablePersonalEvent(ev);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-80"
        style={{
          left: Math.min(position?.x ?? 200, window.innerWidth - 340),
          top:  Math.min(position?.y ?? 200, window.innerHeight - 300),
        }}
      >
        <div className="p-4 border-b border-slate-800" style={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTop: `4px solid ${color}` }}>
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-slate-100 font-semibold text-sm leading-snug">{ev.title}</h3>
            <div className="flex items-center gap-1 shrink-0">
              {editable && (
                <>
                  <button onClick={onEdit}  className="p-1 text-slate-500 hover:text-teal-400 rounded"><SquarePen className="w-3.5 h-3.5" /></button>
                  <button onClick={onDelete} className="p-1 text-slate-500 hover:text-red-400 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                </>
              )}
              <button onClick={onClose} className="p-1 text-slate-500 hover:text-white rounded"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>
          {cal && <p className="text-[10px] text-slate-500 mt-0.5">{cal.name}</p>}
        </div>
        <div className="p-4 space-y-2.5">
          {/* 시간 */}
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>
              {ev.allDay
                ? `${ev.startDate}${ev.endDate !== ev.startDate ? ` ~ ${ev.endDate}` : ''} · 하루 종일`
                : `${ev.startDate} ${formatTime(ev.startTime)} ~ ${ev.endDate} ${formatTime(ev.endTime)}`
              }
            </span>
          </div>
          {ev.location && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <MapPin className="w-3.5 h-3.5 shrink-0" /> <span>{ev.location}</span>
            </div>
          )}
          {ev.meetingUrl && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Video className="w-3.5 h-3.5 shrink-0" />
              <a href={ev.meetingUrl} target="_blank" rel="noreferrer" className="text-teal-400 hover:underline truncate flex items-center gap-1">
                화상회의 참여 <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
          {ev.attendees && ev.attendees.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-slate-400">
              <Users className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                {ev.attendees.map((a, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span>{a.name}</span>
                    <span className={`text-[9px] px-1 rounded-full ${
                      a.status === 'accepted' ? 'bg-green-900/50 text-green-300' :
                      a.status === 'declined' ? 'bg-red-900/50 text-red-300' :
                      'bg-slate-700 text-slate-400'
                    }`}>
                      {{ accepted: '수락', declined: '거절', tentative: '미정', invited: '초대됨' }[a.status]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {ev.description && (
            <div className="flex items-start gap-2 text-xs text-slate-400">
              <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <p className="line-clamp-3">{ev.description}</p>
            </div>
          )}
          {ev.status === 'pending' && (
            <p className="text-[10px] text-yellow-400 bg-yellow-900/20 px-2 py-1 rounded">승인 대기 중</p>
          )}
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════ MONTH VIEW ═══════════════════════ */
function MonthView({
  cursor, events, todos, calendars, todayStr,
  onDateClick, onEventClick, onCellDrop,
}: {
  cursor: Date; events: CalEvent[]; todos: TodoItem[]; calendars: CalendarList[];
  todayStr: string; onDateClick: (ds: string) => void; onEventClick: (ev: CalEvent, pos: { x: number; y: number }) => void;
  onCellDrop?: (eventId: string, date: string) => void;
}) {
  const days = getMonthDays(cursor.getFullYear(), cursor.getMonth());

  // todos with dueDate → show as events
  const todoEvents: CalEvent[] = todos
    .filter(t => t.dueDate)
    .map(t => ({
      id: `todo_${t.id}`, title: t.title,
      startDate: t.dueDate!, endDate: t.dueDate!,
      type: 'todo' as const, source: 'pitaya' as const,
      calendarId: 'default', allDay: true,
    }));

  const allEvs = [...events, ...todoEvents];

  return (
    <div className="flex-1 overflow-auto">
      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b border-slate-800 sticky top-0 bg-slate-950 z-10">
        {DOW_KO.map((d, i) => (
          <div key={d} className={`py-2 text-center text-xs font-semibold ${
            i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-500'
          }`}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7" style={{ gridTemplateRows: `repeat(${days.length / 7}, minmax(100px,1fr))` }}>
        {days.map((day, idx) => {
          const ds      = toDateStr(day);
          const isToday = ds === todayStr;
          const inMonth = day.getMonth() === cursor.getMonth();
          const isSun   = day.getDay() === 0;
          const isSat   = day.getDay() === 6;
          const isWkend = isSun || isSat;
          const dayEvs  = eventsOnDate(allEvs, ds);
          const holiday = HOLIDAYS[ds];

          return (
            <div
              key={idx}
              onClick={() => onDateClick(ds)}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const eid = e.dataTransfer.getData('eventId');
                if (eid) onCellDrop?.(eid, ds);
              }}
              className={`min-h-[100px] p-1 border-b border-r border-slate-800/60 cursor-pointer hover:bg-slate-800/30 transition-colors ${
                !inMonth ? 'opacity-30' : ''
              } ${isWkend ? 'bg-slate-900/30' : ''}`}
            >
              <div className="flex items-start justify-between mb-0.5">
                <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold ${
                  isToday ? 'bg-teal-500 text-black' :
                  isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-slate-400'
                }`}>
                  {day.getDate()}
                </div>
                {holiday && <span className="text-[9px] text-red-400 truncate ml-1">{holiday}</span>}
              </div>

              <div className="space-y-0.5">
                {dayEvs.slice(0, 3).map(ev => (
                  <div
                    key={ev.id}
                    draggable
                    onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('eventId', ev.id); }}
                    onClick={e => { e.stopPropagation(); onEventClick(ev, { x: e.clientX, y: e.clientY }); }}
                  >
                    <EventBlock ev={ev} calendars={calendars} compact />
                  </div>
                ))}
                {dayEvs.length > 3 && (
                  <div className="text-[9px] text-slate-500 px-1 cursor-pointer hover:text-slate-300">
                    +{dayEvs.length - 3}개 더
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════ WEEK/4DAY VIEW ═══════════════════════ */
function TimeGridView({
  days, events, todos, calendars, todayStr,
  onEventClick, onTimeClick, onCellDrop,
}: {
  days: Date[]; events: CalEvent[]; todos: TodoItem[]; calendars: CalendarList[];
  todayStr: string; onEventClick: (ev: CalEvent, pos: { x: number; y: number }) => void;
  onTimeClick: (ds: string, time: string) => void;
  onCellDrop?: (eventId: string, date: string, time: string) => void;
}) {
  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const now   = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 현재 시간으로 스크롤
    if (scrollRef.current) {
      const scrollTo = Math.max(0, nowMin - 60) / 1440 * scrollRef.current.scrollHeight;
      scrollRef.current.scrollTop = scrollTo;
    }
  }, []);

  const allDayEvs = days.map(d => {
    const ds = toDateStr(d);
    return events.filter(e => (e.allDay || !e.startTime) && eventsOnDate([e], ds).length > 0);
  });

  const timedEvs = days.map(d => {
    const ds = toDateStr(d);
    return events.filter(e => !e.allDay && e.startTime && e.startDate <= ds && e.endDate >= ds);
  });

  const todoEvs = days.map(d => {
    const ds = toDateStr(d);
    return todos.filter(t => t.dueDate === ds && t.dueTime);
  });

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* 요일 헤더 */}
      <div className="grid border-b border-slate-800 bg-slate-950 z-10 shrink-0"
        style={{ gridTemplateColumns: `48px repeat(${days.length}, 1fr)` }}>
        <div className="py-2" />
        {days.map((day, i) => {
          const ds = toDateStr(day);
          const isToday = ds === todayStr;
          const isSun = day.getDay() === 0;
          const isSat = day.getDay() === 6;
          const weekNum = getWeekNumber(day);
          return (
            <div key={i} className={`py-2 text-center border-l border-slate-800/60 ${isSun ? 'bg-red-900/5' : isSat ? 'bg-blue-900/5' : ''}`}>
              <div className={`text-[10px] ${isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-slate-500'}`}>
                {DOW_KO[day.getDay()]}
                {days.length === 7 && i === 0 && <span className="ml-1 text-slate-700">W{weekNum}</span>}
              </div>
              <div className={`mt-0.5 mx-auto w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold ${
                isToday ? 'bg-teal-500 text-black' : 'text-slate-300'
              }`}>
                {day.getDate()}
              </div>
              {/* 하루종일 이벤트 */}
              <div className="px-1 space-y-0.5 mt-1">
                {allDayEvs[i].slice(0, 2).map(ev => (
                  <div key={ev.id} onClick={e => { e.stopPropagation(); onEventClick(ev, { x: e.clientX, y: e.clientY }); }}>
                    <EventBlock ev={ev} calendars={calendars} compact />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 시간 그리드 */}
      <div ref={scrollRef} className="flex-1 overflow-auto relative">
        <div className="relative" style={{ height: `${24 * 60}px` }}>
          {/* 시간 레이블 + 그리드 */}
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `48px repeat(${days.length}, 1fr)` }}>
            {/* 시간 레이블 열 */}
            <div className="relative">
              {HOURS.map(h => (
                <div key={h} className="absolute w-full border-t border-slate-800/60 flex items-start justify-end pr-2"
                  style={{ top: `${h * 60}px`, height: '60px' }}>
                  <span className="text-[9px] text-slate-600 -translate-y-2">{h}:00</span>
                </div>
              ))}
            </div>
            {/* 날짜 열 */}
            {days.map((day, colIdx) => {
              const ds     = toDateStr(day);
              const isSun  = day.getDay() === 0;
              const isSat  = day.getDay() === 6;
              const isToday = ds === todayStr;
              const colEvs = timedEvs[colIdx];
              const colTodos = todoEvs[colIdx];

              return (
                <div
                  key={colIdx}
                  className={`relative border-l border-slate-800/60 ${isSun ? 'bg-red-900/5' : isSat ? 'bg-blue-900/5' : ''}`}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    const eid = e.dataTransfer.getData('eventId');
                    const rect = e.currentTarget.getBoundingClientRect();
                    const minFromTop = Math.floor((e.clientY - rect.top) / 60) * 60;
                    const h = Math.floor(minFromTop / 60);
                    const m = minFromTop % 60;
                    onCellDrop?.(eid, ds, `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
                  }}
                >
                  {/* 시간 선 */}
                  {HOURS.map(h => (
                    <div key={h}
                      className="absolute w-full border-t border-slate-800/40 cursor-pointer hover:bg-teal-500/5"
                      style={{ top: `${h * 60}px`, height: '60px' }}
                      onClick={() => onTimeClick(ds, `${String(h).padStart(2, '0')}:00`)}
                    />
                  ))}

                  {/* 현재 시간 선 */}
                  {isToday && (
                    <div
                      className="absolute left-0 right-0 z-20 pointer-events-none"
                      style={{ top: `${nowMin}px` }}
                    >
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1.5 -mt-1.5 absolute" />
                      <div className="border-t-2 border-red-500 w-full" />
                    </div>
                  )}

                  {/* 이벤트 블록 */}
                  {colEvs.map(ev => {
                    const startMin = timeToMinutes(ev.startTime || '00:00');
                    const endMin   = ev.endTime ? timeToMinutes(ev.endTime) : startMin + 60;
                    const height   = Math.max(endMin - startMin, 30);
                    const color    = getEventColor(ev, calendars);
                    return (
                      <div
                        key={ev.id}
                        draggable
                        onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('eventId', ev.id); }}
                        onClick={e => { e.stopPropagation(); onEventClick(ev, { x: e.clientX, y: e.clientY }); }}
                        className="absolute left-0.5 right-0.5 rounded px-1.5 overflow-hidden cursor-pointer hover:brightness-110 z-10"
                        style={{
                          top: `${startMin}px`,
                          height: `${height}px`,
                          backgroundColor: color + '33',
                          borderLeft: `3px solid ${color}`,
                        }}
                      >
                        <p className="text-[10px] font-medium leading-tight" style={{ color }}>{ev.title}</p>
                        <p className="text-[9px] opacity-70" style={{ color }}>
                          {formatTime(ev.startTime)} ~ {formatTime(ev.endTime)}
                        </p>
                      </div>
                    );
                  })}

                  {/* 투두 블록 */}
                  {colTodos.map(todo => {
                    const startMin = timeToMinutes(todo.dueTime || '09:00');
                    return (
                      <div
                        key={todo.id}
                        className="absolute left-0.5 right-0.5 rounded px-1.5 overflow-hidden z-10"
                        style={{ top: `${startMin}px`, height: '28px', backgroundColor: '#7986cb33', borderLeft: '3px solid #7986cb' }}
                      >
                        <p className="text-[10px] font-medium text-indigo-300 flex items-center gap-0.5">
                          <CheckSquare className="w-2.5 h-2.5" /> {todo.title}
                        </p>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ YEAR VIEW ═══════════════════════ */
function YearView({
  cursor, events, onMonthClick,
}: { cursor: Date; events: CalEvent[]; onMonthClick: (month: number) => void }) {
  const year     = cursor.getFullYear();
  const todayStr = toDateStr(new Date());

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
        {Array.from({ length: 12 }, (_, m) => {
          const days = getMonthDays(year, m);
          return (
            <div key={m} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 cursor-pointer hover:border-teal-500/50 transition-colors"
              onClick={() => onMonthClick(m)}>
              <p className="text-xs font-semibold text-slate-300 mb-2">{m + 1}월</p>
              <div className="grid grid-cols-7 gap-px">
                {DOW_KO.map((d, i) => (
                  <div key={d} className={`text-center text-[8px] ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-700'}`}>{d}</div>
                ))}
                {days.map((day, idx) => {
                  const ds      = toDateStr(day);
                  const inMon   = day.getMonth() === m;
                  const isToday = ds === todayStr;
                  const hasEv   = events.some(e => e.startDate <= ds && e.endDate >= ds);
                  return (
                    <div key={idx} className={`relative flex items-center justify-center text-[8px] rounded-full w-4 h-4 mx-auto
                      ${!inMon ? 'opacity-20' : ''}
                      ${isToday ? 'bg-teal-500 text-black font-bold' : 'text-slate-500'}
                    `}>
                      {day.getDate()}
                      {hasEv && inMon && !isToday && <span className="absolute bottom-0 w-0.5 h-0.5 bg-teal-400 rounded-full" />}
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
}

/* ═══════════════════════ LIST VIEW ═══════════════════════ */
function ListView({
  events, calendars, onEventClick,
}: { events: CalEvent[]; calendars: CalendarList[]; onEventClick: (ev: CalEvent, pos: { x: number; y: number }) => void }) {
  const sorted = [...events].sort((a, b) => a.startDate.localeCompare(b.startDate));

  // 날짜별 그룹
  const groups: { date: string; evs: CalEvent[] }[] = [];
  sorted.forEach(ev => {
    const last = groups[groups.length - 1];
    if (last && last.date === ev.startDate) {
      last.evs.push(ev);
    } else {
      groups.push({ date: ev.startDate, evs: [ev] });
    }
  });

  const todayStr = toDateStr(new Date());

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      {groups.length === 0 && (
        <div className="text-center text-slate-600 py-16">이 기간에 일정이 없습니다</div>
      )}
      {groups.map(g => {
        const [y, mo, d] = g.date.split('-').map(Number);
        const day  = new Date(y, mo - 1, d);
        const dow  = DOW_KO[day.getDay()];
        const isToday = g.date === todayStr;
        return (
          <div key={g.date}>
            <div className={`flex items-baseline gap-2 mb-2 pb-1 border-b border-slate-800 ${isToday ? 'border-teal-500/50' : ''}`}>
              <span className={`text-sm font-bold ${isToday ? 'text-teal-400' : 'text-slate-300'}`}>
                {mo}월 {d}일
              </span>
              <span className={`text-xs ${day.getDay() === 0 ? 'text-red-400' : day.getDay() === 6 ? 'text-blue-400' : 'text-slate-500'}`}>
                ({dow})
              </span>
              {HOLIDAYS[g.date] && <span className="text-xs text-red-400">{HOLIDAYS[g.date]}</span>}
            </div>
            <div className="space-y-1.5 pl-2">
              {g.evs.map(ev => {
                const color = getEventColor(ev, calendars);
                return (
                  <div
                    key={ev.id}
                    onClick={e => onEventClick(ev, { x: e.clientX, y: e.clientY })}
                    className="flex items-center gap-3 p-2.5 rounded-xl cursor-pointer hover:bg-slate-800/60 transition-colors"
                    style={{ borderLeft: `3px solid ${color}` }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 font-medium truncate">{ev.title}</p>
                      {!ev.allDay && ev.startTime && (
                        <p className="text-xs text-slate-500">{formatTime(ev.startTime)} ~ {formatTime(ev.endTime)}</p>
                      )}
                      {ev.location && <p className="text-xs text-slate-500 truncate">{ev.location}</p>}
                    </div>
                    {ev.status === 'pending' && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-yellow-900/40 text-yellow-300 rounded-full shrink-0">대기중</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════ TODO PANEL ═══════════════════════ */
function TodoPanel({
  todos, storeId, uid, onTodosChange, showToast,
}: {
  todos: TodoItem[]; storeId: string; uid: string;
  onTodosChange: () => void;
  showToast: (msg: string, ok?: boolean) => void;
}) {
  const [input, setInput]             = useState('');
  const [selectedTodo, setSelected]   = useState<TodoItem | null>(null);
  const [showCompleted, setShowComp]  = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [editTitle, setEditTitle]     = useState('');
  const [subtaskInput, setSubInput]   = useState('');

  const active    = todos.filter(t => !t.completed);
  const completed = todos.filter(t => t.completed);

  const addTodo = async () => {
    if (!input.trim()) return;
    if (!storeId) { showToast('매장을 선택해주세요', false); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/calendar/todos', {
        method: 'POST',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({
          title: input.trim(), storeId, createdBy: uid,
          listId: 'default', subTasks: [], priority: 'medium',
          order: Date.now(),
        }),
      });
      const d = await res.json();
      if (!res.ok || d.error) throw new Error(d.error || '저장 실패');
      setInput('');
      onTodosChange();
    } catch (e: any) {
      showToast(e.message || '저장 실패', false);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleComplete = async (todo: TodoItem) => {
    try {
      const res = await fetch('/api/calendar/todos', {
        method: 'PUT',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({ id: todo.id, completed: !todo.completed }),
      });
      const d = await res.json();
      if (!res.ok || d.error) throw new Error(d.error || '저장 실패');
      if (selectedTodo?.id === todo.id) setSelected(prev => prev ? { ...prev, completed: !prev.completed } : null);
      onTodosChange();
    } catch (e: any) {
      showToast(e.message || '저장 실패', false);
    }
  };

  const updateTodo = async (updates: Partial<TodoItem>) => {
    if (!selectedTodo) return;
    try {
      const res = await fetch('/api/calendar/todos', {
        method: 'PUT',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({ id: selectedTodo.id, ...updates }),
      });
      const d = await res.json();
      if (!res.ok || d.error) throw new Error(d.error || '저장 실패');
      setSelected(prev => prev ? { ...prev, ...updates } : null);
      onTodosChange();
    } catch (e: any) {
      showToast(e.message || '저장 실패', false);
    }
  };

  const deleteTodo = async (id: string) => {
    try {
      const res = await fetch(`/api/calendar/todos?id=${id}`, { method: 'DELETE', headers: await getAuthHeaders() });
      const d = await res.json();
      if (!res.ok || d.error) throw new Error(d.error || '삭제 실패');
      if (selectedTodo?.id === id) setSelected(null);
      onTodosChange();
    } catch (e: any) {
      showToast(e.message || '삭제 실패', false);
    }
  };

  const addSubTask = async () => {
    if (!subtaskInput.trim() || !selectedTodo) return;
    const sub: SubTask = { id: Date.now().toString(), title: subtaskInput.trim(), completed: false };
    const subTasks = [...(selectedTodo.subTasks || []), sub];
    await updateTodo({ subTasks });
    setSubInput('');
  };

  const toggleSubTask = async (subId: string) => {
    if (!selectedTodo) return;
    const subTasks = selectedTodo.subTasks.map(s =>
      s.id === subId ? { ...s, completed: !s.completed } : s
    );
    await updateTodo({ subTasks });
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const reordered = Array.from(active);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    // update order
    const authHeaders = await getAuthJsonHeaders();
    await Promise.all(reordered.map((t, i) =>
      fetch('/api/calendar/todos', {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ id: t.id, order: i * 1000 }),
      })
    ));
    onTodosChange();
  };

  return (
    <div className="flex h-full">
      {/* 할 일 목록 */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-slate-800">
        {/* 입력 */}
        <div className="p-3 border-b border-slate-800">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="할 일 추가..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTodo()}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500"
            />
            <button onClick={addTodo} disabled={submitting}
              className="p-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl disabled:opacity-50">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 목록 */}
        <div className="flex-1 overflow-y-auto">
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="todos">
              {provided => (
                <div {...provided.droppableProps} ref={provided.innerRef} className="p-2 space-y-1">
                  {active.map((todo, i) => (
                    <Draggable key={todo.id} draggableId={todo.id} index={i}>
                      {(prov, snap) => (
                        <div
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          {...prov.dragHandleProps}
                          onClick={() => { setSelected(todo); setEditTitle(todo.title); }}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                            selectedTodo?.id === todo.id
                              ? 'bg-slate-700'
                              : snap.isDragging ? 'bg-slate-800' : 'hover:bg-slate-800/70'
                          }`}
                        >
                          <button
                            onClick={e => { e.stopPropagation(); toggleComplete(todo); }}
                            className="w-4 h-4 rounded-full border-2 border-slate-600 hover:border-teal-500 flex items-center justify-center shrink-0"
                          />
                          <span className="flex-1 text-sm text-slate-300 truncate">{todo.title}</span>
                          {todo.dueDate && (
                            <span className={`text-[10px] shrink-0 ${
                              todo.dueDate < toDateStr(new Date()) ? 'text-red-400' : 'text-slate-500'
                            }`}>{todo.dueDate}</span>
                          )}
                          {(todo.subTasks || []).length > 0 && (
                            <span className="text-[10px] text-slate-600">
                              {todo.subTasks.filter(s => s.completed).length}/{todo.subTasks.length}
                            </span>
                          )}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          {/* 완료 항목 */}
          {completed.length > 0 && (
            <div>
              <button
                onClick={() => setShowComp(!showCompleted)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs text-slate-500 hover:text-slate-300 w-full"
              >
                {showCompleted ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                완료됨 ({completed.length})
              </button>
              {showCompleted && (
                <div className="px-2 pb-2 space-y-1">
                  {completed.map(todo => (
                    <div key={todo.id} className="flex items-center gap-2 px-3 py-2 rounded-xl opacity-50 hover:opacity-70 cursor-pointer"
                      onClick={() => { setSelected(todo); setEditTitle(todo.title); }}>
                      <button
                        onClick={e => { e.stopPropagation(); toggleComplete(todo); }}
                        className="w-4 h-4 rounded-full bg-teal-500 flex items-center justify-center shrink-0"
                      >
                        <Check className="w-2.5 h-2.5 text-white" />
                      </button>
                      <span className="flex-1 text-sm text-slate-500 line-through truncate">{todo.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 상세 패널 */}
      {selectedTodo && (
        <div className="w-64 xl:w-72 flex flex-col overflow-hidden bg-slate-900/50 border-l border-slate-800">
          <div className="flex items-center justify-between p-3 border-b border-slate-800">
            <span className="text-xs font-semibold text-slate-400">할 일 상세</span>
            <button onClick={() => setSelected(null)} className="p-1 text-slate-600 hover:text-slate-300 rounded">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {/* 완료 + 제목 */}
            <div className="flex items-start gap-2">
              <button
                onClick={() => toggleComplete(selectedTodo)}
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                  selectedTodo.completed ? 'bg-teal-500 border-teal-500' : 'border-slate-600 hover:border-teal-500'
                }`}
              >
                {selectedTodo.completed && <Check className="w-3 h-3 text-white" />}
              </button>
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                onBlur={() => { if (editTitle.trim() !== selectedTodo.title) updateTodo({ title: editTitle.trim() }); }}
                className={`flex-1 bg-transparent text-sm font-medium outline-none border-b border-transparent focus:border-slate-600 pb-0.5 ${
                  selectedTodo.completed ? 'line-through text-slate-500' : 'text-slate-200'
                }`}
              />
            </div>

            {/* 마감일 */}
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-widest">마감일</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="date"
                  value={selectedTodo.dueDate || ''}
                  onChange={e => updateTodo({ dueDate: e.target.value || undefined })}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300"
                />
                <input
                  type="time"
                  value={selectedTodo.dueTime || ''}
                  onChange={e => updateTodo({ dueTime: e.target.value || undefined, hasTime: !!e.target.value })}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300"
                />
              </div>
            </div>

            {/* 우선순위 */}
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-widest">우선순위</label>
              <div className="mt-1 flex gap-1.5">
                {(['high', 'medium', 'low'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => updateTodo({ priority: p })}
                    className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                      selectedTodo.priority === p
                        ? p === 'high' ? 'bg-red-600 text-white' : p === 'medium' ? 'bg-yellow-600 text-white' : 'bg-slate-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {{ high: '높음', medium: '보통', low: '낮음' }[p]}
                  </button>
                ))}
              </div>
            </div>

            {/* 하위 할 일 */}
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-widest">하위 할 일</label>
              <div className="mt-1.5 space-y-1">
                {(selectedTodo.subTasks || []).map(sub => (
                  <div key={sub.id} className="flex items-center gap-2">
                    <button
                      onClick={() => toggleSubTask(sub.id)}
                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                        sub.completed ? 'bg-teal-500 border-teal-500' : 'border-slate-600 hover:border-teal-500'
                      }`}
                    >
                      {sub.completed && <Check className="w-2 h-2 text-white" />}
                    </button>
                    <span className={`text-xs flex-1 ${sub.completed ? 'line-through text-slate-600' : 'text-slate-300'}`}>
                      {sub.title}
                    </span>
                  </div>
                ))}
                <div className="flex gap-1.5 mt-1">
                  <input
                    type="text"
                    placeholder="하위 항목 추가..."
                    value={subtaskInput}
                    onChange={e => setSubInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addSubTask()}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600"
                  />
                  <button onClick={addSubTask} className="p-1.5 bg-slate-700 hover:bg-slate-600 text-slate-400 rounded-lg">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

            {/* 메모 */}
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-widest">메모</label>
              <textarea
                value={selectedTodo.description || ''}
                onChange={e => updateTodo({ description: e.target.value })}
                rows={3}
                placeholder="메모..."
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-300 placeholder:text-slate-600 resize-none focus:outline-none focus:border-slate-600"
              />
            </div>
          </div>

          {/* 삭제 */}
          <div className="p-3 border-t border-slate-800">
            <button
              onClick={() => deleteTodo(selectedTodo.id)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-red-400 hover:bg-red-900/20 rounded-lg"
            >
              <Trash2 className="w-3 h-3" /> 삭제
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════ SEARCH MODAL ═══════════════════════ */
function SearchModal({
  events, calendars, onEventClick, onClose,
}: { events: CalEvent[]; calendars: CalendarList[]; onEventClick: (ev: CalEvent, pos: { x: number; y: number }) => void; onClose: () => void }) {
  const [q, setQ]       = useState('');
  const [results, setResults] = useState<CalEvent[]>([]);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const lq = q.toLowerCase();
    setResults(events.filter(ev =>
      ev.title.toLowerCase().includes(lq) ||
      ev.description?.toLowerCase().includes(lq) ||
      ev.location?.toLowerCase().includes(lq)
    ).slice(0, 30));
  }, [q, events]);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60" onClick={onClose} />
      <div className="fixed top-16 left-1/2 -translate-x-1/2 w-full max-w-lg z-50">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
            <Search className="w-4 h-4 text-slate-500" />
            <input
              autoFocus
              type="text"
              placeholder="이벤트 검색..."
              value={q}
              onChange={e => setQ(e.target.value)}
              className="flex-1 bg-transparent text-slate-200 text-sm outline-none placeholder:text-slate-600"
            />
            <button onClick={onClose} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          {results.length > 0 && (
            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {results.map(ev => {
                const color = getEventColor(ev, calendars);
                return (
                  <div key={ev.id}
                    onClick={e => { onEventClick(ev, { x: e.clientX, y: e.clientY }); onClose(); }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-slate-800"
                  >
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 truncate">{ev.title}</p>
                      <p className="text-xs text-slate-500">{ev.startDate} {ev.startTime ? formatTime(ev.startTime) : '하루 종일'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {q && results.length === 0 && (
            <div className="py-8 text-center text-slate-600 text-sm">검색 결과가 없습니다</div>
          )}
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════ AI 일괄 등록 모달 ═══════════════════════ */
const SUPERUSER_EMAIL_CLIENT = process.env.NEXT_PUBLIC_SUPERUSER_EMAIL || '';

interface ParsedBulkItem {
  type: 'leave' | 'dayoff';
  userName: string;
  userId: string;
  userEmail: string;
  leaveType?: string;
  dayoffType?: string;
  startDate?: string;
  endDate?: string;
  dates?: string[];
  reason: string;
  matched: boolean;
}

const AI_BULK_SYSTEM = `당신은 연차/휴무 일괄 등록 파서입니다.
사용자의 자연어 입력을 파싱하여 반드시 아래 JSON 배열만 출력하세요. 다른 설명 없이 JSON만.

직원 목록(userId, userName 포함)이 제공되면 이름 매칭에 사용하세요.

출력 형식:
[
  {
    "type": "leave",
    "userName": "홍길동",
    "leaveType": "annual|half_am|half_pm",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "reason": ""
  },
  {
    "type": "dayoff",
    "userName": "김철수",
    "dayoffType": "regular|substitute|unpaid",
    "dates": ["YYYY-MM-DD", "YYYY-MM-DD"],
    "reason": ""
  }
]

규칙:
- 연차/반차 → type: "leave"
- 휴무 → type: "dayoff"
- 날짜 범위(~, -)는 startDate/endDate로, 개별 날짜 나열은 dates[]로
- 오전반차 → half_am, 오후반차 → half_pm, 연차 → annual
- 정기휴무 → regular, 대체휴무 → substitute, 무급휴무 → unpaid
- leaveType/dayoffType 미지정 시 연차는 annual, 휴무는 regular로 기본값 설정
- 반드시 순수 JSON 배열만 출력`;

function AiBulkLeaveModal({
  storeId, uid, user, onClose, onSuccess, showToast,
}: {
  storeId: string; uid: string; user: any;
  onClose: () => void; onSuccess: () => void;
  showToast: (msg: string, ok?: boolean) => void;
}) {
  const [input,       setInput]       = useState('');
  const [messages,    setMessages]    = useState<{ role: 'user' | 'ai'; text: string }[]>([
    { role: 'ai', text: '안녕하세요! 연차/휴무를 자연어로 입력하면 일괄 등록해드립니다.\n\n예시:\n• 홍길동 6월 1~5일 연차\n• 김철수 6월 1일, 3일 정기휴무\n• 이영희 오전반차 6월 10일' },
  ]);
  const [parsed,      setParsed]      = useState<ParsedBulkItem[] | null>(null);
  const [employees,   setEmployees]   = useState<any[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/hr/employees?storeId=${storeId}`, { headers: {} })
      .then(r => r.json())
      .then(d => setEmployees(d.employees || []))
      .catch(() => {});
  }, [storeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, parsed]);

  const matchEmployee = (userName: string, empList: any[]): { userId: string; userEmail: string; matched: boolean } => {
    const name = userName.trim();
    const emp = empList.find(e => e.name === name || e.name?.includes(name) || name.includes(e.name));
    if (emp) return { userId: emp.userId || emp.uid || '', userEmail: emp.email || '', matched: true };
    return { userId: '', userEmail: '', matched: false };
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);
    setParsed(null);

    try {
      const { getAuthJsonHeaders } = await import('@/lib/getAuthHeaders');
      const empContext = employees.length > 0
        ? `\n\n직원 목록:\n${employees.map(e => `- ${e.name} (userId: ${e.userId || e.uid || ''})`).join('\n')}`
        : '';

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({
          message: userMsg + empContext,
          history: [],
          model: 'auto',
          system: AI_BULK_SYSTEM,
        }),
      });
      const data = await res.json();
      const text = data.text || data.reply || '';

      // JSON 파싱 시도
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('JSON을 파싱할 수 없습니다. 다시 시도해주세요.');

      const rawItems = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(rawItems) || rawItems.length === 0) throw new Error('파싱된 항목이 없습니다.');

      const items: ParsedBulkItem[] = rawItems.map((item: any) => {
        const { userId, userEmail, matched } = matchEmployee(item.userName, employees);
        return {
          type: item.type,
          userName: item.userName,
          userId,
          userEmail,
          leaveType: item.leaveType,
          dayoffType: item.dayoffType,
          startDate: item.startDate,
          endDate: item.endDate,
          dates: item.dates,
          reason: item.reason || '',
          matched,
        };
      });

      setParsed(items);
      setMessages(prev => [...prev, { role: 'ai', text: `${items.length}건이 파싱되었습니다. 아래 내용을 확인하고 [일괄 등록] 버튼을 눌러주세요.` }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'ai', text: `오류: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkRegister = async () => {
    if (!parsed || parsed.length === 0) return;
    setSubmitting(true);
    try {
      const { getAuthJsonHeaders } = await import('@/lib/getAuthHeaders');
      const records = parsed.map(item => ({
        type: item.type,
        userId: item.userId || uid,
        userName: item.userName,
        userEmail: item.userEmail || user?.email || '',
        storeId,
        leaveType: item.leaveType || 'annual',
        dayoffType: item.dayoffType || 'regular',
        startDate: item.startDate,
        endDate: item.endDate,
        dates: item.dates,
        reason: item.reason,
      }));

      const res = await fetch('/api/hr/bulk-register', {
        method: 'POST',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({ records }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      showToast(`${data.created}건 등록 완료${data.failed > 0 ? `, ${data.failed}건 실패` : ''}`, data.failed === 0);
      onSuccess();
      onClose();
    } catch (e: any) {
      showToast(e.message || '등록 실패', false);
    } finally {
      setSubmitting(false);
    }
  };

  const LEAVE_TYPE_MAP: Record<string, string> = { annual: '연차', half_am: '반차(오전)', half_pm: '반차(오후)' };
  const DAYOFF_TYPE_MAP: Record<string, string> = { regular: '정기휴무', substitute: '대체휴무', unpaid: '무급휴무' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-slate-100 font-bold text-sm">AI 일괄 등록</h3>
              <p className="text-[10px] text-slate-500">연차/휴무를 자연어로 입력하세요</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 채팅 영역 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'ai' && (
                <div className="w-6 h-6 bg-violet-600 rounded-full flex items-center justify-center mr-2 shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-violet-600 text-white rounded-tr-sm'
                  : 'bg-slate-800 text-slate-200 rounded-tl-sm'
              }`}>
                {msg.text}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="w-6 h-6 bg-violet-600 rounded-full flex items-center justify-center mr-2 shrink-0">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />
                <span className="text-sm text-slate-400">파싱 중...</span>
              </div>
            </div>
          )}

          {/* 파싱 결과 프리뷰 */}
          {parsed && parsed.length > 0 && (
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 space-y-2">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">파싱 결과 미리보기</p>
              <div className="space-y-1.5">
                {parsed.map((item, i) => (
                  <div key={i} className={`flex items-start gap-2.5 p-2 rounded-lg ${item.matched ? 'bg-slate-700/50' : 'bg-red-900/20 border border-red-800/40'}`}>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium ${
                      item.type === 'leave' ? 'bg-green-900/50 text-green-300' : 'bg-blue-900/50 text-blue-300'
                    }`}>
                      {item.type === 'leave'
                        ? (LEAVE_TYPE_MAP[item.leaveType || ''] || '연차')
                        : (DAYOFF_TYPE_MAP[item.dayoffType || ''] || '휴무')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm text-slate-200 font-medium">{item.userName}</span>
                        {!item.matched && (
                          <span className="text-[9px] text-red-400 bg-red-900/30 px-1.5 rounded">직원 미매칭</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">
                        {item.type === 'leave'
                          ? `${item.startDate} ~ ${item.endDate}`
                          : (item.dates || []).join(', ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {parsed.some(p => !p.matched) && (
                <p className="text-[10px] text-yellow-400/80 bg-yellow-900/20 px-2 py-1.5 rounded-lg">
                  미매칭 직원은 이름만 저장됩니다. 직원 등록 후 재시도하면 userId가 연결됩니다.
                </p>
              )}
              <button
                onClick={handleBulkRegister}
                disabled={submitting}
                className="w-full py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {submitting ? '등록 중...' : `${parsed.length}건 일괄 등록 (자동 승인)`}
              </button>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* 입력 영역 */}
        <div className="p-3 border-t border-slate-800 shrink-0">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="예: 홍길동 6월 1~5일 연차, 김철수 6월 1,3일 정기휴무 (Shift+Enter 줄바꿈)"
              rows={2}
              disabled={loading}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500 resize-none disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="px-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-xl transition-colors self-end"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ═══════════════════════ MAIN APP ═══════════════════════ */
export default function CalendarApp() {
  const { user }         = useAuth();
  const { currentStore, storesLoaded } = useStore();

  const uid     = user?.uid     || '';
  const storeId = currentStore?.storeId || '';
  const storeReady = storesLoaded && !!storeId;
  const todayStr = toDateStr(new Date());

  // ── 뷰 상태 ──
  const [view,   setView]   = useState<ViewMode>('month');
  const [mainTab, setMainTab] = useState<'calendar' | 'todo' | 'leave'>('calendar');
  const searchParams = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'leave' || tab === 'todo' || tab === 'calendar') {
      setMainTab(tab);
    }
  }, [searchParams]);
  const [cursor, setCursor] = useState(new Date());

  // ── 데이터 ──
  const [events,    setEvents]    = useState<CalEvent[]>([]);
  const [todos,     setTodos]     = useState<TodoItem[]>([]);
  const [calendars, setCalendars] = useState<CalendarList[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [toast,     setToast]     = useState<{ msg: string; ok: boolean } | null>(null);

  // ── UI 상태 ──
  const [showEventModal, setShowEventModal]   = useState(false);
  const [editingEvent,   setEditingEvent]     = useState<Partial<CalEvent> | null>(null);
  const [popoverEv,      setPopoverEv]        = useState<CalEvent | null>(null);
  const [popoverPos,     setPopoverPos]       = useState({ x: 0, y: 0 });
  const [showSearch,     setShowSearch]       = useState(false);
  const [showSidebar,    setShowSidebar]      = useState(true);
  const [quickDate,      setQuickDate]        = useState<string>('');

  // ── 캘린더 사이드 패널 ──
  const [showCalList, setShowCalList] = useState(true);
  const [showMiniCal, setShowMiniCal] = useState(true);

  // ── 연차/휴무 ──
  const [isAdmin,     setIsAdmin]     = useState(false);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [leaves,      setLeaves]      = useState<any[]>([]);
  const [dayoffs,     setDayoffs]     = useState<any[]>([]);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    if (!uid || !storeReady) return;
    getAuthHeaders()
      .then(headers => fetch(`/api/permissions?type=myAccess&uid=${uid}&storeId=${storeId}`, { headers }))
      .then(r => r.json())
      .then(d => {
        setIsAdmin(isAdminLevelGroup(d.groupId || d.role || '') || d.isSuperuser === true);
      })
      .catch(() => {});
  }, [uid, storeId, storeReady]);

  /* ── 데이터 로드 ── */
  const loadCalendars = useCallback(async () => {
    if (!uid || !storeReady) return;
    try {
      const res = await fetch(`/api/calendar/calendars?storeId=${storeId}&uid=${uid}`, { headers: await getAuthHeaders() });
      const d   = await res.json();
      setCalendars(d.calendars || []);
    } catch {}
  }, [uid, storeId, storeReady]);

  const loadEvents = useCallback(async () => {
    if (!uid || !storeReady) return;
    setLoading(true);
    try {
      const from = toDateStr(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
      const to   = toDateStr(new Date(cursor.getFullYear(), cursor.getMonth() + 2, 0));

      const authHeaders = await getAuthHeaders();
      const [evRes, hrRes, extRes] = await Promise.all([
        fetch(`/api/calendar/events?storeId=${storeId}&from=${from}&to=${to}`, { headers: authHeaders }),
        fetch(`/api/hr/events?storeId=${storeId}&month=${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`, { headers: authHeaders }),
        Promise.allSettled([
          fetch(`/api/calendar/google?action=events&uid=${uid}`, { headers: authHeaders }),
          fetch(`/api/calendar/naver?action=events&uid=${uid}`, { headers: authHeaders }),
        ]),
      ]);

      const evData  = await evRes.json();
      const hrData  = await hrRes.json();

      if (!evRes.ok) {
        console.error('calendar events load failed:', evData.error);
      }

      const evList: CalEvent[] = (evData.events || []).map((e: any) => ({
        ...e,
        source: e.source || 'pitaya',
        type: e.type || 'event',
      }));

      // 공휴일
      Object.entries(HOLIDAYS).filter(([date]) => date >= from && date <= to).forEach(([date, name]) => {
        evList.push({ id: `holiday_${date}`, title: name, startDate: date, endDate: date, type: 'holiday', source: 'pitaya', calendarId: 'holiday', allDay: true });
      });

      // HR 이벤트
      (hrData.events || []).forEach((e: any) => {
        evList.push({ ...e, type: 'event', source: 'pitaya', calendarId: 'hr' });
      });

      // 외부 캘린더
      for (const r of extRes) {
        if (r.status === 'fulfilled') {
          try {
            const d = await r.value.json();
            (d.events || []).forEach((e: any) => evList.push(e));
          } catch {}
        }
      }

      // 연차/휴무 (관리자: 매장 전체, 일반: 본인)
      try {
        const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
        const leaveUrl = isAdmin
          ? `/api/hr/leave?storeId=${storeId}&month=${monthKey}`
          : `/api/hr/leave?userId=${uid}&month=${monthKey}`;
        const dayoffUrl = isAdmin
          ? `/api/hr/dayoff?storeId=${storeId}&month=${monthKey}`
          : `/api/hr/dayoff?userId=${uid}&month=${monthKey}`;
        const [leaveRes, dayoffRes] = await Promise.all([
          fetch(leaveUrl, { headers: authHeaders }),
          fetch(dayoffUrl, { headers: authHeaders }),
        ]);
        const lData = leaveRes.ok ? await leaveRes.json() : { requests: [] };
        const dData = dayoffRes.ok ? await dayoffRes.json() : { requests: [] };
        if (!leaveRes.ok) console.error('leave load failed:', lData.error);
        if (!dayoffRes.ok) console.error('dayoff load failed:', dData.error);

        (lData.requests || []).forEach((l: any) => {
          evList.push({
            id: `leave_${l.id}`, title: `${l.userName} 연차`,
            startDate: l.startDate, endDate: l.endDate, type: 'leave',
            source: 'pitaya', calendarId: 'hr', allDay: true, status: l.status, userName: l.userName,
          });
        });
        (dData.requests || []).forEach((d: any) => {
          d.dates?.forEach((date: string) => {
            evList.push({
              id: `dayoff_${d.id}_${date}`, title: `${d.userName} 휴무`,
              startDate: date, endDate: date, type: 'dayoff',
              source: 'pitaya', calendarId: 'hr', allDay: true, status: d.status, userName: d.userName,
            });
          });
        });
      } catch {}

      setEvents(evList);
    } finally {
      setLoading(false);
    }
  }, [uid, storeId, storeReady, cursor, isAdmin]);

  const loadTodos = useCallback(async () => {
    if (!uid || !storeReady) return;
    try {
      const res = await fetch(`/api/calendar/todos?storeId=${storeId}&uid=${uid}`, { headers: await getAuthHeaders() });
      const d   = await res.json();
      setTodos(d.todos || []);
    } catch {}
  }, [uid, storeId, storeReady]);

  const loadLeaves = useCallback(async () => {
    if (!uid || !storeReady) return;
    try {
      const headers = await getAuthHeaders();
      const [lRes, dRes] = await Promise.all([
        isAdmin
          ? fetch(`/api/hr/leave?storeId=${storeId}`, { headers })
          : fetch(`/api/hr/leave?userId=${uid}`, { headers }),
        isAdmin
          ? fetch(`/api/hr/dayoff?storeId=${storeId}`, { headers })
          : fetch(`/api/hr/dayoff?userId=${uid}`, { headers }),
      ]);
      const [lData, dData] = await Promise.all([lRes.json(), dRes.json()]);
      setLeaves(lData.requests || []);
      setDayoffs(dData.requests || []);
    } catch {}
  }, [uid, storeId, storeReady, isAdmin]);

  useEffect(() => {
    if (!storeReady) {
      setLoading(!storesLoaded);
      return;
    }
    loadCalendars();
  }, [loadCalendars, storeReady, storesLoaded]);
  useEffect(() => { if (storeReady) loadEvents(); },   [loadEvents, storeReady]);
  useEffect(() => { if (storeReady) loadTodos(); },    [loadTodos, storeReady]);
  useEffect(() => { if (storeReady) loadLeaves(); },   [loadLeaves, storeReady]);

  /* ── 필터된 이벤트 (숨겨진 캘린더 제거) ── */
  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      const cal = calendars.find(c => c.id === ev.calendarId);
      if (cal && cal.visible === false) return false;
      return true;
    });
  }, [events, calendars]);

  /* ── 이벤트 저장 ── */
  const saveEvent = useCallback(async (ev: Partial<CalEvent>) => {
    if (!storeId) {
      showToast('매장을 선택해주세요', false);
      return;
    }
    if (ev.id && !isEditablePersonalEvent(ev as CalEvent)) {
      showToast('이 일정은 여기서 수정할 수 없습니다', false);
      return;
    }
    try {
      const method = ev.id ? 'PUT' : 'POST';
      const payload = {
        title: ev.title,
        startDate: ev.startDate,
        startTime: ev.startTime,
        endDate: ev.endDate,
        endTime: ev.endTime,
        allDay: ev.allDay,
        calendarId: ev.calendarId,
        color: ev.color,
        location: ev.location,
        meetingUrl: ev.meetingUrl,
        description: ev.description,
        attendees: ev.attendees,
        repeat: ev.repeat,
        reminders: ev.reminders,
        visibility: ev.visibility,
        busyStatus: ev.busyStatus,
        storeId,
        createdBy: uid,
        ...(ev.id ? { id: ev.id } : {}),
      };
      const res = await fetch('/api/calendar/events', {
        method,
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok || d.error) throw new Error(d.error || '저장 실패');
      showToast(ev.id ? '이벤트가 수정되었습니다' : '이벤트가 생성되었습니다');
      setShowEventModal(false);
      setEditingEvent(null);
      if (!ev.id && d.id) {
        setEvents(prev => [...prev, {
          ...ev,
          id: d.id,
          source: 'pitaya',
          type: 'event',
          storeId,
          createdBy: uid,
        } as CalEvent]);
      }
      loadEvents();
    } catch (e: any) {
      showToast(e.message || '저장 실패', false);
    }
  }, [storeId, uid, loadEvents, showToast]);

  /* ── 이벤트 삭제 ── */
  const deleteEvent = useCallback(async (id: string) => {
    const ev = events.find(e => e.id === id);
    if (ev && !isEditablePersonalEvent(ev)) {
      showToast('이 일정은 여기서 삭제할 수 없습니다', false);
      return;
    }
    if (!confirm('이벤트를 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/calendar/events?id=${id}`, { method: 'DELETE', headers: await getAuthHeaders() });
      const d = await res.json();
      if (!res.ok || d.error) throw new Error(d.error || '삭제 실패');
      showToast('삭제되었습니다');
      setPopoverEv(null);
      setShowEventModal(false);
      loadEvents();
    } catch (e: any) {
      showToast(e.message || '삭제 실패', false);
    }
  }, [events, loadEvents, showToast]);

  /* ── 이벤트 드래그로 날짜 이동 ── */
  const onCellDrop = useCallback(async (eventId: string, date: string, time?: string) => {
    const ev = filteredEvents.find(e => e.id === eventId);
    if (!ev || !isEditablePersonalEvent(ev)) return;
    const duration = ev.endDate && ev.startDate
      ? new Date(ev.endDate).getTime() - new Date(ev.startDate).getTime()
      : 0;
    const newEnd = new Date(new Date(date).getTime() + duration);

    try {
      const res = await fetch('/api/calendar/events', {
        method: 'PUT',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({
          id: eventId, startDate: date, endDate: toDateStr(newEnd),
          ...(time ? { startTime: time } : {}),
        }),
      });
      const d = await res.json();
      if (!res.ok || d.error) throw new Error(d.error || '저장 실패');
      loadEvents();
    } catch (e: any) {
      showToast(e.message || '저장 실패', false);
    }
  }, [filteredEvents, loadEvents, showToast]);

  const openNewEventModal = useCallback(() => {
    if (!storeId) {
      showToast('매장을 선택해주세요', false);
      return;
    }
    setEditingEvent(null);
    setShowEventModal(true);
  }, [storeId, showToast]);

  /* ── 캘린더 가시성 토글 ── */
  const toggleCalendar = useCallback(async (cal: CalendarList) => {
    setCalendars(cs => cs.map(c => c.id === cal.id ? { ...c, visible: !c.visible } : c));
    try {
      await fetch('/api/calendar/calendars', {
        method: 'PUT',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({ id: cal.id, visible: !cal.visible }),
      });
    } catch {}
  }, []);

  /* ── 캘린더 추가 ── */
  const addCalendar = useCallback(async () => {
    if (!storeId) {
      showToast('매장을 선택해주세요', false);
      return;
    }
    const name = prompt('새 캘린더 이름을 입력하세요:');
    if (!name?.trim()) return;
    try {
      await fetch('/api/calendar/calendars', {
        method: 'POST',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({ storeId, uid, name: name.trim(), color: '#4299e1' }),
      });
      loadCalendars();
    } catch {
      showToast('캘린더 추가 실패', false);
    }
  }, [storeId, uid, loadCalendars, showToast]);

  /* ── 내비게이션 ── */
  const navigate = useCallback((dir: 1 | -1) => {
    setCursor(prev => {
      const d = new Date(prev);
      if (view === 'day')   d.setDate(d.getDate() + dir);
      if (view === '4day')  d.setDate(d.getDate() + dir * 4);
      if (view === 'week')  d.setDate(d.getDate() + dir * 7);
      if (view === 'month') d.setMonth(d.getMonth() + dir);
      if (view === 'year')  d.setFullYear(d.getFullYear() + dir);
      if (view === 'list')  d.setMonth(d.getMonth() + dir);
      return d;
    });
  }, [view]);

  /* ── 키보드 단축키 ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      switch (e.key) {
        case 't': case 'T': setCursor(new Date()); break;
        case 'd': case 'D': setView('day'); break;
        case 'w': case 'W': setView('week'); break;
        case 'm': case 'M': setView('month'); break;
        case 'y': case 'Y': setView('year'); break;
        case 'ArrowLeft':   navigate(-1); break;
        case 'ArrowRight':  navigate(1); break;
        case 'c': case 'C':
          openNewEventModal();
          break;
        case '/':
          e.preventDefault();
          setShowSearch(true);
          break;
        case 'Escape':
          setShowEventModal(false);
          setPopoverEv(null);
          setShowSearch(false);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, openNewEventModal]);

  /* ── 헤더 타이틀 ── */
  const headerTitle = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + 1;
    if (view === 'year')  return `${y}년`;
    if (view === 'month') return `${y}년 ${m}월`;
    if (view === 'day')   return `${y}년 ${m}월 ${cursor.getDate()}일`;
    if (view === 'week') {
      const days = getWeekDays(cursor);
      return `${days[0].getMonth() + 1}월 ${days[0].getDate()}일 ~ ${days[6].getMonth() + 1}월 ${days[6].getDate()}일`;
    }
    if (view === '4day') {
      const days = getNDays(cursor, 4);
      return `${days[0].getMonth() + 1}월 ${days[0].getDate()}일 ~ ${days[3].getMonth() + 1}월 ${days[3].getDate()}일`;
    }
    return `${y}년 ${m}월`;
  }, [view, cursor]);

  /* ── ics 내보내기 ── */
  const exportIcal = () => {
    window.open(`/api/calendar/ical?userId=${uid}&storeId=${storeId}`, '_blank');
  };

  /* ── 인쇄 ── */
  const handlePrint = () => window.print();

  /* ── 날짜 클릭 → 빠른 생성 or 일간 이동 ── */
  const onDateClick = useCallback((ds: string) => {
    if (view === 'month') {
      if (!storeId) { showToast('매장을 선택해주세요', false); return; }
      setQuickDate(ds);
      setEditingEvent({ startDate: ds, endDate: ds, allDay: true });
      setShowEventModal(true);
    } else {
      const [y, m, d] = ds.split('-').map(Number);
      setCursor(new Date(y, m - 1, d));
      setView('day');
    }
  }, [view, storeId, showToast]);

  /* ── 시간 클릭 → 이벤트 생성 ── */
  const onTimeClick = useCallback((ds: string, time: string) => {
    if (!storeId) { showToast('매장을 선택해주세요', false); return; }
    const endH = String(Math.min(23, parseInt(time.split(':')[0]) + 1)).padStart(2, '0');
    setEditingEvent({ startDate: ds, endDate: ds, startTime: time, endTime: `${endH}:00`, allDay: false });
    setShowEventModal(true);
  }, [storeId, showToast]);

  /* ── 이벤트 클릭 ── */
  const onEventClick = useCallback((ev: CalEvent, pos: { x: number; y: number }) => {
    setPopoverEv(ev);
    setPopoverPos(pos);
  }, []);

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <div className="flex h-full bg-slate-950 overflow-hidden">
      {/* 좌측 사이드바 */}
      {showSidebar && (
        <div className="w-60 xl:w-64 border-r border-slate-800 flex flex-col overflow-y-auto shrink-0 bg-slate-950">
          {/* 새 이벤트 버튼 */}
          <div className="p-3">
            <button
              onClick={openNewEventModal}
              className="w-full flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-2xl text-sm font-medium shadow-lg transition-colors"
            >
              <Plus className="w-4 h-4" /> 새 이벤트
            </button>
          </div>

          {/* 미니 캘린더 */}
          <div className="border-b border-slate-800/60">
            <button
              onClick={() => setShowMiniCal(!showMiniCal)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-500 hover:text-slate-300"
            >
              미니 캘린더
              {showMiniCal ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showMiniCal && (
              <MiniCalendar
                cursor={cursor}
                events={filteredEvents}
                onSelectDate={d => { setCursor(d); if (view === 'month' || view === 'year') setView('month'); }}
              />
            )}
          </div>

          {/* 캘린더 목록 */}
          <div className="border-b border-slate-800/60">
            <button
              onClick={() => setShowCalList(!showCalList)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-500 hover:text-slate-300"
            >
              내 캘린더
              {showCalList ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showCalList && (
              <div className="pb-2">
                {calendars.map(cal => (
                  <div key={cal.id}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800/50 rounded-lg mx-1 group">
                    <button
                      onClick={() => toggleCalendar(cal)}
                      className="w-3.5 h-3.5 rounded-sm shrink-0 border-2 flex items-center justify-center transition-colors"
                      style={{
                        backgroundColor: cal.visible ? cal.color : 'transparent',
                        borderColor: cal.color,
                      }}
                    >
                      {cal.visible && <Check className="w-2 h-2 text-white" />}
                    </button>
                    <span className="flex-1 text-xs text-slate-400 truncate">{cal.name}</span>
                    {cal.isSystem && (
                      <span className="text-[9px] text-slate-600">시스템</span>
                    )}
                  </div>
                ))}
                {!calendars.some(c => c.isSystem === false && !c.isDefault) || true ? (
                  <button
                    onClick={addCalendar}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 hover:text-slate-400 mx-1 rounded-lg hover:bg-slate-800/50"
                  >
                    <Plus className="w-3 h-3" /> 캘린더 추가
                  </button>
                ) : null}
              </div>
            )}
          </div>

          {/* 검색 버튼 */}
          <div className="px-3 py-2">
            <button
              onClick={() => setShowSearch(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 rounded-xl"
            >
              <Search className="w-3.5 h-3.5" /> 이벤트 검색 <span className="ml-auto text-slate-700">/</span>
            </button>
          </div>
        </div>
      )}

      {/* 메인 영역 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 툴바 */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 bg-slate-950 shrink-0 flex-wrap">
          {/* 사이드바 토글 */}
          <button onClick={() => setShowSidebar(!showSidebar)}
            className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg">
            <List className="w-4 h-4" />
          </button>

          {/* 탭 */}
          <div className="flex gap-1 bg-slate-800 rounded-xl p-0.5">
            <button onClick={() => setMainTab('calendar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mainTab === 'calendar' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}>
              <CalIcon className="w-3.5 h-3.5" /> 캘린더
            </button>
            <button onClick={() => setMainTab('todo')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mainTab === 'todo' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}>
              <CheckSquare className="w-3.5 h-3.5" /> 할 일
            </button>
            <button onClick={() => setMainTab('leave')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mainTab === 'leave' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}>
              <FileText className="w-3.5 h-3.5" /> 내 신청
            </button>
          </div>

          {mainTab === 'calendar' && (
            <>
              {/* 날짜 이동 */}
              <div className="flex items-center gap-1">
                <button onClick={() => navigate(-1)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => setCursor(new Date())}
                  className="px-3 py-1.5 text-xs border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 rounded-lg">
                  오늘
                </button>
                <button onClick={() => navigate(1)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* 타이틀 */}
              <span className="text-slate-200 font-semibold text-sm">{headerTitle}</span>

              {/* 뷰 선택 */}
              <div className="ml-auto flex gap-1 bg-slate-800 rounded-lg p-0.5">
                {([
                  ['day', '일'],['4day', '4일'],['week', '주'],
                  ['month', '월'],['year', '연'],['list', '목록'],
                ] as [ViewMode, string][]).map(([v, label]) => (
                  <button key={v} onClick={() => setView(v)}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                      view === v ? 'bg-slate-600 text-white' : 'text-slate-500 hover:text-slate-300'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>

              {/* 액션 버튼 */}
              <button onClick={() => setShowSearch(true)} title="검색 (/)"
                className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg">
                <Search className="w-4 h-4" />
              </button>
              <button onClick={handlePrint} title="인쇄"
                className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg hidden md:flex">
                <Printer className="w-4 h-4" />
              </button>
              <button onClick={exportIcal} title=".ics 내보내기"
                className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg hidden md:flex">
                <Download className="w-4 h-4" />
              </button>
              <button onClick={loadEvents} title="새로고침"
                className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </>
          )}
        </div>

        {/* 단축키 힌트 */}
        {mainTab === 'calendar' && (
          <div className="px-4 py-1 border-b border-slate-800/60 bg-slate-950 flex gap-4 text-[10px] text-slate-700 shrink-0 overflow-x-auto">
            {[['T','오늘'],['D','일간'],['W','주간'],['M','월간'],['Y','연간'],['C','새 이벤트'],['←→','이동'],['ESC','닫기'],['/ ','검색']].map(([k, l]) => (
              <span key={k}><kbd className="font-mono">{k}</kbd> {l}</span>
            ))}
          </div>
        )}

        {/* 캘린더 뷰 */}
        {mainTab === 'calendar' && (
          <div className="flex-1 overflow-hidden flex flex-col print:overflow-visible">
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-slate-700 animate-spin" />
              </div>
            ) : (
              <>
                {view === 'month' && (
                  <MonthView
                    cursor={cursor} events={filteredEvents} todos={todos}
                    calendars={calendars} todayStr={todayStr}
                    onDateClick={onDateClick} onEventClick={onEventClick}
                    onCellDrop={(eid, date) => onCellDrop(eid, date)}
                  />
                )}
                {(view === 'week') && (
                  <TimeGridView
                    days={getWeekDays(cursor)} events={filteredEvents} todos={todos}
                    calendars={calendars} todayStr={todayStr}
                    onEventClick={onEventClick} onTimeClick={onTimeClick}
                    onCellDrop={(eid, date, time) => onCellDrop(eid, date, time)}
                  />
                )}
                {view === '4day' && (
                  <TimeGridView
                    days={getNDays(cursor, 4)} events={filteredEvents} todos={todos}
                    calendars={calendars} todayStr={todayStr}
                    onEventClick={onEventClick} onTimeClick={onTimeClick}
                    onCellDrop={(eid, date, time) => onCellDrop(eid, date, time)}
                  />
                )}
                {view === 'day' && (
                  <TimeGridView
                    days={[cursor]} events={filteredEvents} todos={todos}
                    calendars={calendars} todayStr={todayStr}
                    onEventClick={onEventClick} onTimeClick={onTimeClick}
                    onCellDrop={(eid, date, time) => onCellDrop(eid, date, time)}
                  />
                )}
                {view === 'year' && (
                  <YearView
                    cursor={cursor} events={filteredEvents}
                    onMonthClick={m => { setCursor(new Date(cursor.getFullYear(), m, 1)); setView('month'); }}
                  />
                )}
                {view === 'list' && (
                  <ListView
                    events={filteredEvents.filter(e => {
                      const from = toDateStr(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
                      const to   = toDateStr(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));
                      return e.startDate >= from && e.startDate <= to;
                    })}
                    calendars={calendars}
                    onEventClick={onEventClick}
                  />
                )}
              </>
            )}
          </div>
        )}

        {/* 투두 탭 */}
        {mainTab === 'todo' && (
          <div className="flex-1 overflow-hidden">
            <TodoPanel
              todos={todos} storeId={storeId} uid={uid}
              onTodosChange={loadTodos}
              showToast={showToast}
            />
          </div>
        )}

        {/* 내 신청 탭 */}
        {mainTab === 'leave' && (
          <div className="flex-1 overflow-hidden">
            <LeavePanel
              uid={uid} storeId={storeId} user={user}
              isAdmin={isAdmin} isSuperuser={isSuperuser}
              leaves={leaves} dayoffs={dayoffs}
              onReload={loadLeaves} showToast={showToast}
              AiBulkLeaveModal={AiBulkLeaveModal}
            />
          </div>
        )}
      </div>

      {/* 이벤트 모달 */}
      {showEventModal && (
        <EventModal
          event={editingEvent}
          calendars={calendars.filter(c => !c.isSystem)}
          defaultDate={quickDate || toDateStr(cursor)}
          onSave={saveEvent}
          onDelete={editingEvent?.id && isEditablePersonalEvent(editingEvent as CalEvent) ? deleteEvent : undefined}
          onClose={() => { setShowEventModal(false); setEditingEvent(null); setQuickDate(''); }}
        />
      )}

      {/* 이벤트 팝오버 */}
      {popoverEv && (
        <EventPopover
          ev={popoverEv}
          calendars={calendars}
          position={popoverPos}
          onEdit={() => {
            if (!isEditablePersonalEvent(popoverEv)) {
              showToast('이 일정은 여기서 수정할 수 없습니다', false);
              return;
            }
            setEditingEvent(popoverEv);
            setPopoverEv(null);
            setShowEventModal(true);
          }}
          onDelete={() => deleteEvent(popoverEv.id)}
          onClose={() => setPopoverEv(null)}
        />
      )}

      {/* 검색 모달 */}
      {showSearch && (
        <SearchModal
          events={filteredEvents}
          calendars={calendars}
          onEventClick={(ev, pos) => { setPopoverEv(ev); setPopoverPos(pos); }}
          onClose={() => setShowSearch(false)}
        />
      )}

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

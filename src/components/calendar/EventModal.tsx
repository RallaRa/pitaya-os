'use client';

import { useState, useEffect } from 'react';
import {
  X, Clock, MapPin, Video, AlignLeft, Users, Bell, Globe,
  Plus, Trash2, ChevronDown, Repeat, Calendar,
} from 'lucide-react';
import {
  CalEvent, CalendarList, GOOGLE_COLORS, REPEAT_LABELS,
  REMINDER_MINUTES, DOW_KO, RepeatConfig, Reminder, Attendee,
} from './CalendarTypes';

interface Props {
  event?: Partial<CalEvent> | null;
  calendars: CalendarList[];
  onSave: (ev: Partial<CalEvent>) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
  defaultDate?: string;
}

const DEFAULT_FORM: Partial<CalEvent> = {
  title: '', startDate: '', startTime: '09:00', endDate: '', endTime: '10:00',
  allDay: false, calendarId: 'default', color: undefined,
  location: '', meetingUrl: '', description: '',
  attendees: [], repeat: null, reminders: [{ type: 'app', minutes: 10 }],
  visibility: 'public', busyStatus: 'busy',
};

export default function EventModal({ event, calendars, onSave, onDelete, onClose, defaultDate }: Props) {
  const [form, setForm] = useState<Partial<CalEvent>>(DEFAULT_FORM);
  const [showRepeat, setShowRepeat] = useState(false);
  const [showColor, setShowColor]   = useState(false);
  const [attendeeInput, setAttendeeInput] = useState('');
  const [repeatCfg, setRepeatCfg] = useState<RepeatConfig>({
    type: 'none', endType: 'none',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const base = event
      ? { ...DEFAULT_FORM, ...event }
      : {
          ...DEFAULT_FORM,
          startDate: defaultDate || '',
          endDate:   defaultDate || '',
          calendarId: calendars.find(c => c.isDefault)?.id || calendars[0]?.id || 'default',
        };
    setForm(base);
    if (base.repeat) setRepeatCfg(base.repeat as RepeatConfig);
  }, [event, defaultDate, calendars]);

  const update = (k: keyof CalEvent, v: any) => setForm(f => ({ ...f, [k]: v }));

  const addReminder = () =>
    setForm(f => ({ ...f, reminders: [...(f.reminders || []), { type: 'app', minutes: 30 }] }));

  const updateReminder = (i: number, k: keyof Reminder, v: any) =>
    setForm(f => {
      const r = [...(f.reminders || [])];
      r[i] = { ...r[i], [k]: v } as Reminder;
      return { ...f, reminders: r };
    });

  const removeReminder = (i: number) =>
    setForm(f => ({ ...f, reminders: (f.reminders || []).filter((_, idx) => idx !== i) }));

  const addAttendee = () => {
    if (!attendeeInput.trim()) return;
    const att: Attendee = { email: attendeeInput.trim(), name: attendeeInput.trim(), status: 'invited' };
    setForm(f => ({ ...f, attendees: [...(f.attendees || []), att] }));
    setAttendeeInput('');
  };

  const removeAttendee = (i: number) =>
    setForm(f => ({ ...f, attendees: (f.attendees || []).filter((_, idx) => idx !== i) }));

  const handleSave = async () => {
    if (!form.title?.trim()) { alert('제목을 입력해주세요'); return; }
    if (!form.startDate)    { alert('날짜를 선택해주세요'); return; }
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        endDate: form.endDate || form.startDate,
        repeat:  repeatCfg.type !== 'none' ? repeatCfg : null,
      };
      await onSave(payload);
    } finally {
      setSubmitting(false);
    }
  };

  const personalCals = calendars.filter(c => !c.isSystem);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 overflow-y-auto" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl mb-8"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-slate-100 font-bold text-base">
            {event?.id ? '이벤트 수정' : '새 이벤트'}
          </h2>
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* 제목 */}
          <input
            type="text"
            placeholder="제목 추가"
            value={form.title || ''}
            onChange={e => update('title', e.target.value)}
            className="w-full bg-transparent border-b-2 border-slate-600 focus:border-teal-500 outline-none text-xl text-slate-100 placeholder:text-slate-600 pb-2 transition-colors"
          />

          {/* 날짜/시간 */}
          <div className="flex items-start gap-3">
            <Clock className="w-4 h-4 text-slate-500 mt-2.5 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="date"
                  value={form.startDate || ''}
                  onChange={e => {
                    update('startDate', e.target.value);
                    if (!form.endDate || form.endDate < e.target.value)
                      update('endDate', e.target.value);
                  }}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                />
                {!form.allDay && (
                  <>
                    <input
                      type="time"
                      value={form.startTime || '09:00'}
                      onChange={e => update('startTime', e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                    />
                    <span className="text-slate-600">~</span>
                    <input
                      type="date"
                      value={form.endDate || form.startDate || ''}
                      onChange={e => update('endDate', e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                    />
                    <input
                      type="time"
                      value={form.endTime || '10:00'}
                      onChange={e => update('endTime', e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                    />
                  </>
                )}
                {form.allDay && (
                  <>
                    <span className="text-slate-600">~</span>
                    <input
                      type="date"
                      value={form.endDate || form.startDate || ''}
                      onChange={e => update('endDate', e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                    />
                  </>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={form.allDay || false}
                  onChange={e => update('allDay', e.target.checked)}
                  className="w-4 h-4 accent-teal-500"
                />
                <span className="text-sm text-slate-400">하루 종일</span>
              </label>
            </div>
          </div>

          {/* 반복 */}
          <div className="flex items-center gap-3">
            <Repeat className="w-4 h-4 text-slate-500 shrink-0" />
            <button
              onClick={() => setShowRepeat(!showRepeat)}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200"
            >
              {REPEAT_LABELS[repeatCfg.type] || '반복 안 함'}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showRepeat ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {showRepeat && (
            <div className="ml-7 bg-slate-800/60 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(REPEAT_LABELS) as (keyof typeof REPEAT_LABELS)[]).map(k => (
                  <button
                    key={k}
                    onClick={() => setRepeatCfg(r => ({ ...r, type: k as RepeatConfig['type'] }))}
                    className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                      repeatCfg.type === k
                        ? 'bg-teal-600 text-white'
                        : 'bg-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {REPEAT_LABELS[k]}
                  </button>
                ))}
              </div>

              {repeatCfg.type === 'weekly' && (
                <div className="flex gap-1.5 flex-wrap">
                  {DOW_KO.map((d, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        const wdays = repeatCfg.weekdays || [];
                        setRepeatCfg(r => ({
                          ...r,
                          weekdays: wdays.includes(i) ? wdays.filter(x => x !== i) : [...wdays, i],
                        }));
                      }}
                      className={`w-7 h-7 text-xs rounded-full transition-colors ${
                        (repeatCfg.weekdays || []).includes(i)
                          ? 'bg-teal-600 text-white'
                          : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              )}

              {repeatCfg.type !== 'none' && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">반복 종료</p>
                  <div className="flex gap-2 flex-wrap">
                    {(['none', 'count', 'date'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setRepeatCfg(r => ({ ...r, endType: t }))}
                        className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                          repeatCfg.endType === t
                            ? 'bg-teal-600 text-white'
                            : 'bg-slate-700 text-slate-400'
                        }`}
                      >
                        {{ none: '없음', count: 'N회 후', date: '날짜까지' }[t]}
                      </button>
                    ))}
                  </div>
                  {repeatCfg.endType === 'count' && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={1} max={365}
                        value={repeatCfg.endCount || 10}
                        onChange={e => setRepeatCfg(r => ({ ...r, endCount: parseInt(e.target.value) }))}
                        className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm text-slate-200"
                      />
                      <span className="text-xs text-slate-500">회 후 종료</span>
                    </div>
                  )}
                  {repeatCfg.endType === 'date' && (
                    <input
                      type="date"
                      value={repeatCfg.endDate || ''}
                      onChange={e => setRepeatCfg(r => ({ ...r, endDate: e.target.value }))}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* 장소 */}
          <div className="flex items-center gap-3">
            <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
            <input
              type="text"
              placeholder="장소 추가"
              value={form.location || ''}
              onChange={e => update('location', e.target.value)}
              className="flex-1 bg-transparent border-b border-slate-800 focus:border-slate-600 outline-none text-sm text-slate-200 placeholder:text-slate-600 pb-1 transition-colors"
            />
          </div>

          {/* 화상회의 */}
          <div className="flex items-center gap-3">
            <Video className="w-4 h-4 text-slate-500 shrink-0" />
            <input
              type="url"
              placeholder="화상회의 링크 추가"
              value={form.meetingUrl || ''}
              onChange={e => update('meetingUrl', e.target.value)}
              className="flex-1 bg-transparent border-b border-slate-800 focus:border-slate-600 outline-none text-sm text-slate-200 placeholder:text-slate-600 pb-1 transition-colors"
            />
          </div>

          {/* 설명 */}
          <div className="flex items-start gap-3">
            <AlignLeft className="w-4 h-4 text-slate-500 mt-1 shrink-0" />
            <textarea
              placeholder="설명 추가"
              value={form.description || ''}
              onChange={e => update('description', e.target.value)}
              rows={3}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 resize-none focus:outline-none focus:border-slate-600"
            />
          </div>

          {/* 참석자 */}
          <div className="flex items-start gap-3">
            <Users className="w-4 h-4 text-slate-500 mt-2 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="이메일로 참석자 추가"
                  value={attendeeInput}
                  onChange={e => setAttendeeInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addAttendee()}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600"
                />
                <button onClick={addAttendee}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm">
                  추가
                </button>
              </div>
              {(form.attendees || []).length > 0 && (
                <div className="space-y-1">
                  {(form.attendees || []).map((att, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-slate-800/60 rounded-lg">
                      <div>
                        <span className="text-sm text-slate-300">{att.name}</span>
                        {att.email !== att.name && <span className="text-xs text-slate-500 ml-1">&lt;{att.email}&gt;</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          att.status === 'accepted' ? 'bg-green-900/50 text-green-300' :
                          att.status === 'declined' ? 'bg-red-900/50 text-red-300' :
                          'bg-slate-700 text-slate-400'
                        }`}>
                          {{ accepted: '수락', declined: '거절', tentative: '미정', invited: '초대됨' }[att.status]}
                        </span>
                        <button onClick={() => removeAttendee(i)} className="text-slate-600 hover:text-red-400">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 캘린더 선택 */}
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
            <select
              value={form.calendarId || 'default'}
              onChange={e => update('calendarId', e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
            >
              {personalCals.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* 색상 */}
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded-full shrink-0 cursor-pointer border-2 border-white/20"
              style={{ backgroundColor: form.color || (calendars.find(c => c.id === form.calendarId)?.color) || '#7986cb' }}
              onClick={() => setShowColor(!showColor)}
            />
            <button onClick={() => setShowColor(!showColor)} className="text-sm text-slate-400 hover:text-slate-200">
              색상 선택
            </button>
            {showColor && (
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => { update('color', undefined); setShowColor(false); }}
                  className={`w-5 h-5 rounded-full bg-slate-600 border-2 ${!form.color ? 'border-white' : 'border-transparent'}`}
                  title="캘린더 기본색"
                />
                {GOOGLE_COLORS.map(c => (
                  <button
                    key={c.value}
                    onClick={() => { update('color', c.value); setShowColor(false); }}
                    className={`w-5 h-5 rounded-full border-2 ${form.color === c.value ? 'border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 알림 */}
          <div className="flex items-start gap-3">
            <Bell className="w-4 h-4 text-slate-500 mt-1.5 shrink-0" />
            <div className="flex-1 space-y-2">
              {(form.reminders || []).map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={r.type}
                    onChange={e => updateReminder(i, 'type', e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300"
                  >
                    <option value="app">앱 알림</option>
                    <option value="email">이메일</option>
                  </select>
                  <select
                    value={r.minutes}
                    onChange={e => updateReminder(i, 'minutes', parseInt(e.target.value))}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300"
                  >
                    {REMINDER_MINUTES.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  <button onClick={() => removeReminder(i)} className="text-slate-600 hover:text-red-400">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button onClick={addReminder}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300">
                <Plus className="w-3.5 h-3.5" /> 알림 추가
              </button>
            </div>
          </div>

          {/* 공개/상태 */}
          <div className="flex items-center gap-3">
            <Globe className="w-4 h-4 text-slate-500 shrink-0" />
            <select
              value={form.visibility || 'public'}
              onChange={e => update('visibility', e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300"
            >
              <option value="public">공개</option>
              <option value="private">비공개</option>
              <option value="attendees">참석자만</option>
            </select>
            <select
              value={form.busyStatus || 'busy'}
              onChange={e => update('busyStatus', e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300"
            >
              <option value="busy">바쁨</option>
              <option value="free">여유</option>
            </select>
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between">
          <div>
            {event?.id && onDelete && (
              <button
                onClick={() => onDelete(event.id!)}
                className="flex items-center gap-1.5 px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg text-sm"
              >
                <Trash2 className="w-3.5 h-3.5" /> 삭제
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={submitting}
              className="px-5 py-2 text-sm bg-teal-600 hover:bg-teal-500 text-white rounded-xl disabled:opacity-50 font-medium"
            >
              {submitting ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

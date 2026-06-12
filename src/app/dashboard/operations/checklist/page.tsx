'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle2, Loader2, Save, Sun, Moon, AlertTriangle,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { useAuth } from '@/context/AuthContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import {
  countPhaseProgress,
  emptyItemsForPhase,
  OPEN_CHECKLIST_ITEMS,
  CLOSE_CHECKLIST_ITEMS,
  PHASE_LABELS,
  type ChecklistItemState,
  type ChecklistPhase,
  type PhaseRecord,
} from '@/lib/dailyChecklist';

function mergeItems(
  phase: ChecklistPhase,
  existing?: Record<string, ChecklistItemState>,
): Record<string, ChecklistItemState> {
  const base = emptyItemsForPhase(phase);
  if (!existing) return base;
  for (const key of Object.keys(base)) {
    if (existing[key]) base[key] = { ...base[key], ...existing[key] };
  }
  return base;
}

function PhasePanel({
  phase,
  items,
  assigneeName,
  notes,
  completed,
  onToggle,
  onNote,
  onAssignee,
  onNotes,
  onSaveDraft,
  onFinalize,
  saving,
}: {
  phase: ChecklistPhase;
  items: Record<string, ChecklistItemState>;
  assigneeName: string;
  notes: string;
  completed: boolean;
  onToggle: (id: string) => void;
  onNote: (id: string, note: string) => void;
  onAssignee: (v: string) => void;
  onNotes: (v: string) => void;
  onSaveDraft: () => void;
  onFinalize: () => void;
  saving: boolean;
}) {
  const defs = phase === 'open' ? OPEN_CHECKLIST_ITEMS : CLOSE_CHECKLIST_ITEMS;
  const progress = countPhaseProgress(phase, items);
  const Icon = phase === 'open' ? Sun : Moon;

  return (
    <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
      <div className={`px-4 py-3 border-b border-slate-800 flex items-center justify-between ${
        phase === 'open' ? 'bg-amber-950/20' : 'bg-indigo-950/20'
      }`}>
        <h2 className="font-semibold text-white flex items-center gap-2">
          <Icon className={`w-4 h-4 ${phase === 'open' ? 'text-amber-400' : 'text-indigo-400'}`} />
          {PHASE_LABELS[phase]} 체크리스트
        </h2>
        <span className="text-xs text-slate-400">
          {progress.checked}/{progress.total}
          {completed && <CheckCircle2 className="inline w-3.5 h-3.5 ml-1 text-teal-400" />}
        </span>
      </div>

      <div className="p-4 space-y-3">
        <label className="block">
          <span className="text-[10px] text-slate-500">담당자</span>
          <input
            value={assigneeName}
            onChange={e => onAssignee(e.target.value)}
            disabled={completed}
            className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>

        <ul className="space-y-2">
          {defs.map(def => {
            const st = items[def.id] || { checked: false, note: '' };
            return (
              <li
                key={def.id}
                className={`rounded-lg border px-3 py-2 ${
                  st.checked
                    ? 'border-teal-700/40 bg-teal-950/20'
                    : 'border-slate-700 bg-slate-800/40'
                }`}
              >
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!st.checked}
                    disabled={completed}
                    onChange={() => onToggle(def.id)}
                    className="mt-1 rounded border-slate-600"
                  />
                  <span className={`text-sm flex-1 ${st.checked ? 'text-teal-200' : 'text-slate-300'}`}>
                    {def.label}
                  </span>
                </label>
                <input
                  type="text"
                  placeholder="메모 (선택)"
                  value={st.note || ''}
                  disabled={completed}
                  onChange={e => onNote(def.id, e.target.value)}
                  className="mt-2 w-full bg-slate-900/60 border border-slate-700/50 rounded px-2 py-1 text-[11px] text-slate-400 disabled:opacity-60"
                />
              </li>
            );
          })}
        </ul>

        <label className="block">
          <span className="text-[10px] text-slate-500">특이사항 (자유 입력)</span>
          <textarea
            value={notes}
            onChange={e => onNotes(e.target.value)}
            disabled={completed}
            rows={2}
            className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm resize-none disabled:opacity-60"
          />
        </label>

        {!completed && (
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              임시 저장
            </button>
            <button
              type="button"
              onClick={onFinalize}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-700 hover:bg-teal-600 text-xs text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              완료 · 메신저 보고
            </button>
          </div>
        )}

        {completed && (
          <p className="text-xs text-teal-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            완료됨 — 메신저 보고 발송됨
          </p>
        )}
      </div>
    </div>
  );
}

function ChecklistPageContent() {
  const searchParams = useSearchParams();
  const { currentStore } = useStore();
  const { user } = useAuth();
  const storeId = currentStore?.storeId || '';

  const [checkDate, setCheckDate] = useState(searchParams.get('date') || getKSTTodayYMD());
  const [tab, setTab] = useState<ChecklistPhase>(
    searchParams.get('phase') === 'close' ? 'close' : 'open',
  );

  const [openItems, setOpenItems] = useState<Record<string, ChecklistItemState>>({});
  const [closeItems, setCloseItems] = useState<Record<string, ChecklistItemState>>({});
  const [openAssignee, setOpenAssignee] = useState('');
  const [closeAssignee, setCloseAssignee] = useState('');
  const [openNotes, setOpenNotes] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [openCompleted, setOpenCompleted] = useState(false);
  const [closeCompleted, setCloseCompleted] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const restorePhase = (phase: ChecklistPhase, data?: PhaseRecord) => {
    const items = mergeItems(phase, data?.items);
    if (phase === 'open') {
      setOpenItems(items);
      setOpenAssignee(data?.assigneeName || user?.displayName || '');
      setOpenNotes(data?.notes || '');
      setOpenCompleted(!!data?.messengerSent || !!data?.completedAt);
    } else {
      setCloseItems(items);
      setCloseAssignee(data?.assigneeName || user?.displayName || '');
      setCloseNotes(data?.notes || '');
      setCloseCompleted(!!data?.messengerSent || !!data?.completedAt);
    }
  };

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/operations/checklist?storeId=${encodeURIComponent(storeId)}&date=${checkDate}`,
        { headers: await getAuthJsonHeaders() },
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '불러오기 실패');
      restorePhase('open', d.record?.open);
      restorePhase('close', d.record?.close);
      if (!d.record) {
        setOpenItems(emptyItemsForPhase('open'));
        setCloseItems(emptyItemsForPhase('close'));
        setOpenAssignee(user?.displayName || '');
        setCloseAssignee(user?.displayName || '');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId, checkDate, user?.displayName]);

  useEffect(() => { load(); }, [load]);

  const save = async (phase: ChecklistPhase, finalize: boolean) => {
    if (!storeId) return;
    setSaving(true);
    setError('');
    setToast('');
    try {
      const body = {
        storeId,
        checkDate,
        phase,
        finalize,
        assigneeName: phase === 'open' ? openAssignee : closeAssignee,
        notes: phase === 'open' ? openNotes : closeNotes,
        items: phase === 'open' ? openItems : closeItems,
      };
      const res = await fetch('/api/operations/checklist', {
        method: 'POST',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        if (d.uncheckedLabels?.length) {
          throw new Error(`미체크: ${d.uncheckedLabels.join(', ')}`);
        }
        throw new Error(d.error || '저장 실패');
      }
      if (finalize) {
        if (phase === 'open') setOpenCompleted(true);
        else setCloseCompleted(true);
        setToast(`${PHASE_LABELS[phase]} 체크리스트 완료 · 메신저 발송`);
      } else {
        setToast('임시 저장됨');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = (phase: ChecklistPhase, id: string) => {
    const setter = phase === 'open' ? setOpenItems : setCloseItems;
    setter(prev => ({
      ...prev,
      [id]: { ...prev[id], checked: !prev[id]?.checked },
    }));
  };

  const setItemNote = (phase: ChecklistPhase, id: string, note: string) => {
    const setter = phase === 'open' ? setOpenItems : setCloseItems;
    setter(prev => ({
      ...prev,
      [id]: { ...prev[id], note },
    }));
  };

  const openProgress = countPhaseProgress('open', openItems);
  const closeProgress = countPhaseProgress('close', closeItems);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/hygiene"
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white">개폐점 체크리스트</h1>
            <p className="text-xs text-slate-500">완료 시 📋 업무태스크 채널 자동 보고</p>
          </div>
          <input
            type="date"
            value={checkDate}
            onChange={e => setCheckDate(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs"
          />
        </div>

        <div className="flex gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800">
          {(['open', 'close'] as ChecklistPhase[]).map(p => {
            const prog = p === 'open' ? openProgress : closeProgress;
            const done = p === 'open' ? openCompleted : closeCompleted;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setTab(p)}
                className={`flex-1 py-2 rounded-md text-xs font-medium transition-colors ${
                  tab === p
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {PHASE_LABELS[p]} ({prog.checked}/{prog.total})
                {done && ' ✓'}
              </button>
            );
          })}
        </div>

        {toast && (
          <p className="text-xs text-teal-300 bg-teal-950/30 border border-teal-800/40 rounded-lg px-3 py-2">
            {toast}
          </p>
        )}
        {error && (
          <p className="text-xs text-rose-400 bg-rose-950/30 border border-rose-800/40 rounded-lg px-3 py-2 flex items-start gap-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
          </div>
        ) : tab === 'open' ? (
          <PhasePanel
            phase="open"
            items={openItems}
            assigneeName={openAssignee}
            notes={openNotes}
            completed={openCompleted}
            onToggle={id => toggleItem('open', id)}
            onNote={(id, n) => setItemNote('open', id, n)}
            onAssignee={setOpenAssignee}
            onNotes={setOpenNotes}
            onSaveDraft={() => save('open', false)}
            onFinalize={() => save('open', true)}
            saving={saving}
          />
        ) : (
          <PhasePanel
            phase="close"
            items={closeItems}
            assigneeName={closeAssignee}
            notes={closeNotes}
            completed={closeCompleted}
            onToggle={id => toggleItem('close', id)}
            onNote={(id, n) => setItemNote('close', id, n)}
            onAssignee={setCloseAssignee}
            onNotes={setCloseNotes}
            onSaveDraft={() => save('close', false)}
            onFinalize={() => save('close', true)}
            saving={saving}
          />
        )}
      </div>
    </div>
  );
}

export default function OperationsChecklistPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
      </div>
    }>
      <ChecklistPageContent />
    </Suspense>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, X, Check, Bot, SquarePen, Trash2, RefreshCw, AlertTriangle, Loader2,
} from 'lucide-react';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { formatLeaveRemainLabel, leaveRemainClass } from '@/lib/hr/leaveRemainDisplay';
import DateRangePicker from './DateRangePicker';

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: '연차', half_am: '반차(오전)', half_pm: '반차(오후)', unpaid: '무급휴가',
};
const DAYOFF_TYPE_LABELS: Record<string, string> = {
  regular: '정기휴무', substitute: '대체휴무', unpaid: '무급휴무',
};
const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  pending:  { label: '대기중', cls: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700/40' },
  approved: { label: '승인됨', cls: 'bg-green-900/40 text-green-300 border border-green-700/40' },
  rejected: { label: '거절됨', cls: 'bg-red-900/40 text-red-300 border border-red-700/40' },
};

interface LeaveBalance {
  userId: string;
  name: string;
  empNo: string;
  total: number;
  used: number;
  remain: number;
  overused: boolean;
}

interface LeaveRecord {
  id: string;
  userId: string;
  userName: string;
  type: string;
  startDate: string;
  endDate: string;
  reason?: string;
  status: string;
}

type LeavePanelProps = {
  uid: string;
  storeId: string;
  user: { displayName?: string; email?: string } | null;
  isAdmin: boolean;
  isSuperuser: boolean;
  leaves: LeaveRecord[];
  dayoffs: Record<string, unknown>[];
  onReload: () => void;
  showToast: (msg: string, ok?: boolean) => void;
  AiBulkLeaveModal: React.ComponentType<{
    storeId: string;
    uid: string;
    user: LeavePanelProps['user'];
    onClose: () => void;
    onSuccess: () => void;
    showToast: (msg: string, ok?: boolean) => void;
  }>;
};

export default function LeavePanel({
  uid, storeId, user, isAdmin, isSuperuser, leaves, dayoffs, onReload, showToast, AiBulkLeaveModal,
}: LeavePanelProps) {
  const [modal, setModal] = useState<'leave' | 'dayoff' | 'aiBulk' | 'editLeave' | 'balance' | null>(null);
  const [leaveForm, setLeaveForm] = useState({ type: 'annual', startDate: '', endDate: '', reason: '' });
  const [editForm, setEditForm] = useState({
    id: '', userId: '', userName: '', type: 'annual', startDate: '', endDate: '', reason: '', status: 'approved',
  });
  const [dayoffForm, setDayoffForm] = useState({ type: 'regular', dates: [] as string[], reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceEdit, setBalanceEdit] = useState({ userId: '', name: '', total: 0, used: 0 });

  const myLeaves = leaves.filter(l => isAdmin || l.userId === uid);
  const myDayoffs = dayoffs.filter(d => (d.userId as string) === uid || isAdmin);

  const loadBalances = useCallback(async () => {
    if (!isAdmin || !storeId) return;
    setBalanceLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/hr/leave/balance?storeId=${storeId}`, { headers });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBalances(data.balances || []);
    } catch {
      setBalances([]);
    } finally {
      setBalanceLoading(false);
    }
  }, [isAdmin, storeId]);

  useEffect(() => { loadBalances(); }, [loadBalances]);

  const reloadAll = () => {
    onReload();
    loadBalances();
  };

  const handleBalanceResponse = (data: { warning?: string; balance?: { overused?: boolean; remain?: number } }) => {
    if (data.warning) showToast(data.warning, false);
    else if (data.balance?.overused) showToast('저장됨 (선사용 상태)', false);
    else showToast('저장되었습니다');
  };

  const submitLeave = async () => {
    if (!leaveForm.startDate || !leaveForm.endDate) { showToast('날짜를 선택해주세요', false); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/hr/leave', {
        method: 'POST',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({
          userId: uid, userName: user?.displayName || user?.email || uid,
          userEmail: user?.email || '', storeId,
          type: leaveForm.type, startDate: leaveForm.startDate,
          endDate: leaveForm.endDate, reason: leaveForm.reason,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast('연차 신청이 완료되었습니다');
      setModal(null);
      setLeaveForm({ type: 'annual', startDate: '', endDate: '', reason: '' });
      reloadAll();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '신청 실패', false);
    } finally {
      setSubmitting(false);
    }
  };

  const submitDayoff = async () => {
    if (!dayoffForm.dates.length) { showToast('날짜를 선택해주세요', false); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/hr/dayoff', {
        method: 'POST',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({
          userId: uid, userName: user?.displayName || user?.email || uid,
          userEmail: user?.email || '', storeId,
          type: dayoffForm.type, dates: dayoffForm.dates, reason: dayoffForm.reason,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast('휴무 신청이 완료되었습니다');
      setModal(null);
      setDayoffForm({ type: 'regular', dates: [], reason: '' });
      reloadAll();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '신청 실패', false);
    } finally {
      setSubmitting(false);
    }
  };

  const approve = async (type: 'leave' | 'dayoff', id: string, status: 'approved' | 'rejected') => {
    try {
      const url = type === 'leave' ? '/api/hr/leave' : '/api/hr/dayoff';
      const res = await fetch(url, {
        method: 'PUT',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({ id, status, approvedBy: uid, approvedByName: user?.displayName }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (type === 'leave') handleBalanceResponse(data);
      else showToast(status === 'approved' ? '승인되었습니다' : '거절되었습니다');
      reloadAll();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '처리 실패', false);
    }
  };

  const openEdit = (l: LeaveRecord) => {
    setEditForm({
      id: l.id,
      userId: l.userId,
      userName: l.userName,
      type: l.type,
      startDate: l.startDate,
      endDate: l.endDate,
      reason: l.reason || '',
      status: l.status,
    });
    setModal('editLeave');
  };

  const saveEdit = async () => {
    if (!editForm.startDate || !editForm.endDate) { showToast('날짜를 입력해주세요', false); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/hr/leave', {
        method: 'PUT',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({
          id: editForm.id,
          type: editForm.type,
          startDate: editForm.startDate,
          endDate: editForm.endDate,
          reason: editForm.reason,
          status: editForm.status,
          userName: editForm.userName,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      handleBalanceResponse(data);
      setModal(null);
      reloadAll();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '수정 실패', false);
    } finally {
      setSubmitting(false);
    }
  };

  const adminDeleteLeave = async (id: string) => {
    if (!confirm('이 연차 기록을 삭제할까요? 사용 일수가 재계산됩니다.')) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/hr/leave?id=${id}`, { method: 'DELETE', headers });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast('삭제되었습니다');
      reloadAll();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '삭제 실패', false);
    }
  };

  const cancel = async (type: 'leave' | 'dayoff', id: string) => {
    try {
      const url = type === 'leave' ? `/api/hr/leave?id=${id}` : `/api/hr/dayoff?id=${id}`;
      const headers = await getAuthHeaders();
      const res = await fetch(url, { method: 'DELETE', headers });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast('취소되었습니다');
      reloadAll();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '취소 실패', false);
    }
  };

  const openBalanceEdit = (b: LeaveBalance) => {
    setBalanceEdit({ userId: b.userId, name: b.name, total: b.total, used: b.used });
    setModal('balance');
  };

  const saveBalance = async (recalculate = false) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/hr/leave/balance', {
        method: 'PUT',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({
          storeId,
          userId: balanceEdit.userId,
          recalculate,
          totalAnnualLeave: balanceEdit.total,
          usedAnnualLeave: balanceEdit.used,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const b = data.balance;
      if (b?.overused) showToast('저장됨 (선사용 상태)', false);
      else showToast(recalculate ? '승인 내역 기준으로 재계산했습니다' : '연차 잔액을 수정했습니다');
      setModal(null);
      reloadAll();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '저장 실패', false);
    } finally {
      setSubmitting(false);
    }
  };

  const getBalance = (userId: string) => balances.find(b => b.userId === userId);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6 h-full">
      {isSuperuser && (
        <div className="flex justify-end">
          <button
            onClick={() => setModal('aiBulk')}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600/20 border border-violet-500/40 text-violet-300 rounded-xl text-xs hover:bg-violet-600/30 transition-colors"
          >
            <Bot className="w-3.5 h-3.5" /> AI 일괄 등록
          </button>
        </div>
      )}

      {isAdmin && (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-slate-300 font-semibold text-sm">사원별 연차 잔액</h3>
            <button onClick={loadBalances} disabled={balanceLoading}
              className="text-slate-500 hover:text-teal-400 p-1">
              <RefreshCw className={`w-4 h-4 ${balanceLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {balances.length === 0 ? (
            <p className="text-slate-600 text-xs text-center py-2">연결된 사원이 없습니다</p>
          ) : (
            <div className="space-y-2">
              {balances.map(b => (
                <div key={b.userId}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm ${b.overused ? 'bg-red-950/30 border border-red-800/40' : 'bg-slate-900/50'}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    {b.overused && <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                    <span className="text-slate-200 truncate">{b.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 tabular-nums text-xs">
                    <span className="text-slate-500">총 {b.total}</span>
                    <span className="text-orange-400">사용 {b.used}</span>
                    <span className={leaveRemainClass(b.remain)}>
                      잔여 {formatLeaveRemainLabel(b.remain)}
                    </span>
                    <button onClick={() => openBalanceEdit(b)}
                      className="text-slate-500 hover:text-teal-400 p-0.5" title="잔액 수정">
                      <SquarePen className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-slate-600 mt-2">
            선사용(잔여 마이너스) 허용 · 승인 내역 수정/삭제 시 사용일수 자동 재계산 · 총/사용 일수는 연필 아이콘으로 수동 조정
          </p>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-slate-300 font-semibold text-sm">연차 신청 내역</h3>
          <button
            onClick={() => { setLeaveForm({ type: 'annual', startDate: '', endDate: '', reason: '' }); setModal('leave'); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 border border-green-500/30 text-green-300 rounded-lg text-xs hover:bg-green-600/30"
          >
            <Plus className="w-3.5 h-3.5" /> 연차 신청
          </button>
        </div>
        {myLeaves.length === 0 ? (
          <div className="text-slate-600 text-sm text-center py-6 bg-slate-800/30 rounded-xl">신청 내역이 없습니다</div>
        ) : (
          <div className="space-y-2">
            {myLeaves.map(l => {
              const bal = getBalance(l.userId);
              return (
                <div key={l.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {isAdmin && (
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-slate-400 text-xs">{l.userName}</p>
                          {bal?.overused && (
                            <span className="text-[10px] text-red-400 bg-red-900/30 px-1.5 py-0.5 rounded">선사용</span>
                          )}
                        </div>
                      )}
                      <p className="text-slate-200 text-sm font-medium">{LEAVE_TYPE_LABELS[l.type] || l.type}</p>
                      <p className="text-slate-500 text-xs">{l.startDate} ~ {l.endDate}</p>
                      {l.reason && <p className="text-slate-600 text-xs mt-1 truncate">{l.reason}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_STYLE[l.status]?.cls || 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                        {STATUS_STYLE[l.status]?.label || l.status}
                      </span>
                      {isAdmin && (
                        <>
                          <button onClick={() => openEdit(l)} title="수정"
                            className="w-6 h-6 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center">
                            <SquarePen className="w-3 h-3 text-slate-300" />
                          </button>
                          <button onClick={() => adminDeleteLeave(l.id)} title="삭제"
                            className="w-6 h-6 rounded-full bg-red-900/60 hover:bg-red-800 flex items-center justify-center">
                            <Trash2 className="w-3 h-3 text-red-300" />
                          </button>
                        </>
                      )}
                      {isAdmin && l.status === 'pending' && (
                        <>
                          <button onClick={() => approve('leave', l.id, 'approved')}
                            className="w-6 h-6 rounded-full bg-green-700 hover:bg-green-600 flex items-center justify-center">
                            <Check className="w-3.5 h-3.5 text-white" />
                          </button>
                          <button onClick={() => approve('leave', l.id, 'rejected')}
                            className="w-6 h-6 rounded-full bg-red-800 hover:bg-red-700 flex items-center justify-center">
                            <X className="w-3.5 h-3.5 text-white" />
                          </button>
                        </>
                      )}
                      {!isAdmin && l.userId === uid && l.status === 'pending' && (
                        <button onClick={() => cancel('leave', l.id)} className="text-xs text-slate-500 hover:text-red-400">취소</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-slate-300 font-semibold text-sm">휴무 신청 내역</h3>
          <button
            onClick={() => { setDayoffForm({ type: 'regular', dates: [], reason: '' }); setModal('dayoff'); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 text-blue-300 rounded-lg text-xs hover:bg-blue-600/30"
          >
            <Plus className="w-3.5 h-3.5" /> 휴무 신청
          </button>
        </div>
        {myDayoffs.length === 0 ? (
          <div className="text-slate-600 text-sm text-center py-6 bg-slate-800/30 rounded-xl">신청 내역이 없습니다</div>
        ) : (
          <div className="space-y-2">
            {myDayoffs.map(d => (
              <div key={d.id as string} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {isAdmin && <p className="text-slate-400 text-xs mb-0.5">{d.userName as string}</p>}
                    <p className="text-slate-200 text-sm font-medium">{DAYOFF_TYPE_LABELS[d.type as string] || d.type as string}</p>
                    <p className="text-slate-500 text-xs truncate">{((d.dates as string[]) || []).join(', ')}</p>
                    {!!d.reason && <p className="text-slate-600 text-xs mt-1 truncate">{d.reason as string}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_STYLE[d.status as string]?.cls || 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                      {STATUS_STYLE[d.status as string]?.label || d.status as string}
                    </span>
                    {isAdmin && d.status === 'pending' && (
                      <div className="flex gap-1">
                        <button onClick={() => approve('dayoff', d.id as string, 'approved')}
                          className="w-6 h-6 rounded-full bg-green-700 hover:bg-green-600 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-white" />
                        </button>
                        <button onClick={() => approve('dayoff', d.id as string, 'rejected')}
                          className="w-6 h-6 rounded-full bg-red-800 hover:bg-red-700 flex items-center justify-center">
                          <X className="w-3.5 h-3.5 text-white" />
                        </button>
                      </div>
                    )}
                    {(d.userId as string) === uid && d.status === 'pending' && (
                      <button onClick={() => cancel('dayoff', d.id as string)} className="text-xs text-slate-500 hover:text-red-400">취소</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal === 'leave' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setModal(null)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-slate-100 font-bold">연차 신청</h3>
              <button onClick={() => setModal(null)} className="text-slate-500 hover:text-white p-1"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">연차 유형</label>
                <select value={leaveForm.type} onChange={e => setLeaveForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
                  <option value="annual">연차</option>
                  <option value="half_am">반차 (오전)</option>
                  <option value="half_pm">반차 (오후)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">시작일</label>
                  <input type="date" value={leaveForm.startDate}
                    onChange={e => setLeaveForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">종료일</label>
                  <input type="date" value={leaveForm.endDate}
                    onChange={e => setLeaveForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">사유 (선택)</label>
                <textarea value={leaveForm.reason} onChange={e => setLeaveForm(f => ({ ...f, reason: e.target.value }))}
                  rows={3} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 resize-none" />
              </div>
            </div>
            <div className="p-5 border-t border-slate-800 flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-slate-400">취소</button>
              <button onClick={submitLeave} disabled={submitting}
                className="px-4 py-2 text-sm bg-green-600 hover:bg-green-500 text-white rounded-lg disabled:opacity-50">
                {submitting ? '신청중...' : '신청하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'editLeave' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setModal(null)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-slate-100 font-bold">연차 수정 (관리자)</h3>
              <button onClick={() => setModal(null)} className="text-slate-500 hover:text-white p-1"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500">{editForm.userName} · 저장 시 사용일수 자동 재계산</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">유형</label>
                  <select value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
                    <option value="annual">연차</option>
                    <option value="half_am">반차 (오전)</option>
                    <option value="half_pm">반차 (오후)</option>
                    <option value="unpaid">무급휴가</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">상태</label>
                  <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
                    <option value="pending">대기중</option>
                    <option value="approved">승인됨</option>
                    <option value="rejected">거절됨</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">시작일</label>
                  <input type="date" value={editForm.startDate}
                    onChange={e => setEditForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">종료일</label>
                  <input type="date" value={editForm.endDate}
                    onChange={e => setEditForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">사유 / 메모</label>
                <textarea value={editForm.reason} onChange={e => setEditForm(f => ({ ...f, reason: e.target.value }))}
                  rows={3} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 resize-none" />
              </div>
            </div>
            <div className="p-5 border-t border-slate-800 flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-slate-400">취소</button>
              <button onClick={saveEdit} disabled={submitting}
                className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-500 text-white rounded-lg disabled:opacity-50">
                {submitting ? '저장중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'balance' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setModal(null)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-slate-100 font-bold">{balanceEdit.name} 연차 잔액</h3>
              <button onClick={() => setModal(null)} className="text-slate-500 hover:text-white p-1"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">총 연차 (일)</label>
                <input type="number" step="0.5" value={balanceEdit.total}
                  onChange={e => setBalanceEdit(f => ({ ...f, total: Number(e.target.value) }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">사용 연차 (일)</label>
                <input type="number" step="0.5" value={balanceEdit.used}
                  onChange={e => setBalanceEdit(f => ({ ...f, used: Number(e.target.value) }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
              </div>
              <p className="text-xs text-slate-500">
                잔여: <span className={leaveRemainClass(balanceEdit.total - balanceEdit.used)}>
                  {formatLeaveRemainLabel(balanceEdit.total - balanceEdit.used)}
                </span>
              </p>
            </div>
            <div className="p-5 border-t border-slate-800 flex flex-col gap-2">
              <button onClick={() => saveBalance(true)} disabled={submitting}
                className="w-full py-2 text-sm bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                승인 내역 기준 사용일 재계산
              </button>
              <div className="flex gap-2">
                <button onClick={() => setModal(null)} className="flex-1 py-2 text-sm text-slate-400">취소</button>
                <button onClick={() => saveBalance(false)} disabled={submitting}
                  className="flex-1 py-2 text-sm bg-teal-600 hover:bg-teal-500 text-white rounded-lg disabled:opacity-50">
                  수동 저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal === 'aiBulk' && (
        <AiBulkLeaveModal
          storeId={storeId} uid={uid} user={user}
          onClose={() => setModal(null)}
          onSuccess={reloadAll}
          showToast={showToast}
        />
      )}

      {modal === 'dayoff' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setModal(null)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h3 className="text-slate-100 font-bold">휴무 신청</h3>
              <button onClick={() => setModal(null)} className="text-slate-500 hover:text-white p-1"><X className="w-5 h-5" /></button>
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
                <label className="block text-xs text-slate-400 mb-2">날짜 선택</label>
                <DateRangePicker
                  selected={dayoffForm.dates}
                  onChange={dates => setDayoffForm(f => ({ ...f, dates: [...dates].sort() }))}
                  className="bg-slate-800/50 border border-slate-700 rounded-xl p-3"
                />
                {dayoffForm.dates.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {dayoffForm.dates.map(d => (
                      <span key={d} className="flex items-center gap-1 px-2 py-0.5 bg-blue-900/40 text-blue-300 text-xs rounded-full">
                        {d}
                        <button onClick={() => setDayoffForm(f => ({ ...f, dates: f.dates.filter(x => x !== d) }))}>
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">사유 (선택)</label>
                <textarea value={dayoffForm.reason} onChange={e => setDayoffForm(f => ({ ...f, reason: e.target.value }))}
                  rows={3} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 resize-none" />
              </div>
            </div>
            <div className="p-5 border-t border-slate-800 flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-slate-400">취소</button>
              <button onClick={submitDayoff} disabled={submitting}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50">
                {submitting ? '신청중...' : '신청하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

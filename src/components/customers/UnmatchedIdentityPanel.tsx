'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Loader2, Link2, UserX, RefreshCw } from 'lucide-react';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import type { PublicOrderIdentityRecord } from '@/lib/publicOrderIdentity';

interface Props {
  storeId: string;
  open: boolean;
  onClose: () => void;
  onLinked?: () => void;
}

const GENDER_LABEL: Record<string, string> = {
  male: '남성',
  female: '여성',
  unknown: '—',
};

const STATUS_LABEL: Record<string, string> = {
  unmatched: '미매치',
  partial: '마스킹만 일치',
  ambiguous: '중복 후보',
};

export default function UnmatchedIdentityPanel({ storeId, open, onClose, onLinked }: Props) {
  const [items, setItems] = useState<PublicOrderIdentityRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkCode, setLinkCode] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/customers/unmatched?storeId=${encodeURIComponent(storeId)}`, { headers });
      const data = await res.json();
      if (res.ok) setItems(data.items || []);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleLink = async (id: string) => {
    const cusCode = (linkCode[id] || '').trim();
    if (!cusCode) {
      alert('회원코드를 입력하세요');
      return;
    }
    setBusyId(id);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(`/api/customers/unmatched/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ storeId, action: 'link', cusCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '연결 실패');
      await load();
      onLinked?.();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '연결 실패');
    } finally {
      setBusyId(null);
    }
  };

  const handleDismiss = async (id: string) => {
    if (!confirm('이 내역을 처리 완료로 숨기시겠습니까?')) return;
    setBusyId(id);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(`/api/customers/unmatched/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ storeId, action: 'dismiss' }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '실패');
      }
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '실패');
    } finally {
      setBusyId(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center p-4 bg-black/70 overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-white font-bold">공개주문 미매치</h2>
            <p className="text-xs text-slate-500 mt-0.5">전화번호로 회원을 찾지 못했거나 마스킹만 일치한 경우</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={load} className="p-2 text-slate-400 hover:text-white">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-center text-slate-500 text-sm py-12">미매치 내역이 없습니다</p>
          ) : (
            items.map(item => (
              <div key={item.id} className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 space-y-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {STATUS_LABEL[item.matchStatus] || item.matchStatus}
                  </span>
                  <span className="text-slate-400">{item.phoneMasked}</span>
                  <span className="text-slate-400">{GENDER_LABEL[item.gender]}</span>
                  <span className="text-slate-400">{item.ageRange || '—'}</span>
                  {item.suggestedCusCodes.length > 0 && (
                    <span className="text-violet-300">
                      후보: {item.suggestedCusCodes.join(', ')}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    type="text"
                    placeholder="회원코드 (cusCode)"
                    defaultValue={item.suggestedCusCodes[0] || ''}
                    onChange={e => setLinkCode(prev => ({ ...prev, [item.id]: e.target.value }))}
                    className="flex-1 min-w-[120px] bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => handleLink(item.id)}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg bg-teal-700 text-white text-xs font-medium disabled:opacity-50"
                  >
                    {busyId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                    회원 연결
                  </button>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => handleDismiss(item.id)}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-700 text-slate-300 text-xs disabled:opacity-50"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    무시
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

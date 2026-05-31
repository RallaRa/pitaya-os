'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Copy, ExternalLink, Loader2, Trash2, Save, Upload,
  Play, Pause, Link2,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import type { PublicOrderLine } from '@/lib/publicOrders';

interface SessionSummary {
  id: string;
  title: string;
  status: string;
  publicToken: string;
  orderDeadline: string | null;
  createdAt: string | null;
}

const EMPTY_LINE = {
  name: '',
  description: '',
  origin: '',
  photoUrl: '',
  normalPrice: 0,
  discountPrice: 0,
  unit: 'ea',
  totalQty: 10,
  sortOrder: 0,
};

export default function PublicOrdersAdminPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lines, setLines] = useState<PublicOrderLine[]>([]);
  const [entries, setEntries] = useState<Array<{
    id: string; ordererName: string; ordererPhoneMasked: string;
    lines: unknown[]; totalAmount: number; createdAt: string | null;
  }>>([]);
  const [sessionMeta, setSessionMeta] = useState({
    title: '', description: '', status: 'draft', orderDeadline: '', publicToken: '',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [lineForm, setLineForm] = useState({ ...EMPTY_LINE });
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    if (!storeId) return;
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/public-orders/sessions?storeId=${storeId}`, { headers });
    const data = await res.json();
    if (res.ok) setSessions(data.sessions || []);
  }, [storeId]);

  const loadDetail = useCallback(async (sessionId: string) => {
    if (!storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/public-orders/sessions/${sessionId}?storeId=${storeId}`,
        { headers },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSessionMeta({
        title: data.session.title,
        description: data.session.description || '',
        status: data.session.status,
        orderDeadline: data.session.orderDeadline || '',
        publicToken: data.session.publicToken,
      });
      setLines(data.lines || []);
      setEntries(data.entries || []);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : '로드 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const createSession = async () => {
    if (!newTitle.trim() || !storeId) return;
    setSaving(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/public-orders/sessions', {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId, title: newTitle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNewTitle('');
      await loadSessions();
      setSelectedId(data.id);
      setMsg('주문 회차가 생성되었습니다');
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : '생성 실패');
    } finally {
      setSaving(false);
    }
  };

  const saveSession = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(`/api/public-orders/sessions/${selectedId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          title: sessionMeta.title,
          description: sessionMeta.description,
          status: sessionMeta.status,
          orderDeadline: sessionMeta.orderDeadline || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      setMsg('저장되었습니다');
      await loadSessions();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const copyPublicLink = () => {
    const url = `${window.location.origin}/order/${sessionMeta.publicToken}`;
    navigator.clipboard.writeText(url);
    setMsg('공개 링크가 복사되었습니다');
  };

  const uploadPhoto = async (file: File) => {
    if (!selectedId) return;
    const reader = new FileReader();
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const headers = await getAuthJsonHeaders();
    const res = await fetch(`/api/public-orders/sessions/${selectedId}/upload`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fileName: file.name,
        fileContent: base64,
        mimeType: file.type,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setLineForm(f => ({ ...f, photoUrl: data.photoUrl }));
  };

  const saveLine = async () => {
    if (!selectedId || !lineForm.name.trim()) return;
    setSaving(true);
    try {
      const headers = await getAuthJsonHeaders();
      if (editingLineId) {
        const res = await fetch(`/api/public-orders/sessions/${selectedId}/lines`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ lineId: editingLineId, ...lineForm }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error);
        }
      } else {
        const res = await fetch(`/api/public-orders/sessions/${selectedId}/lines`, {
          method: 'POST',
          headers,
          body: JSON.stringify(lineForm),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error);
        }
      }
      setLineForm({ ...EMPTY_LINE });
      setEditingLineId(null);
      await loadDetail(selectedId);
      setMsg('품목이 저장되었습니다');
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : '품목 저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const editLine = (line: PublicOrderLine) => {
    setEditingLineId(line.id);
    setLineForm({
      name: line.name,
      description: line.description,
      origin: line.origin,
      photoUrl: line.photoUrl,
      normalPrice: line.normalPrice,
      discountPrice: line.discountPrice,
      unit: line.unit,
      totalQty: line.totalQty,
      sortOrder: line.sortOrder,
    });
  };

  const deleteLine = async (lineId: string) => {
    if (!selectedId || !confirm('이 품목을 삭제(비활성)하시겠습니까?')) return;
    const headers = await getAuthHeaders();
    await fetch(
      `/api/public-orders/sessions/${selectedId}/lines?lineId=${lineId}`,
      { method: 'DELETE', headers },
    );
    await loadDetail(selectedId);
  };

  if (!storeId) {
    return (
      <div className="p-6 text-slate-500 text-sm">매장을 선택해 주세요</div>
    );
  }

  const publicUrl = sessionMeta.publicToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/order/${sessionMeta.publicToken}`
    : '';

  return (
    <div className="flex flex-col lg:flex-row min-h-full gap-0">
      {/* 회차 목록 */}
      <aside className="w-full lg:w-72 border-r border-slate-800 bg-slate-900/30 p-4 shrink-0">
        <h1 className="text-lg font-bold text-white mb-1">공개 주문 관리</h1>
        <p className="text-xs text-slate-500 mb-4">손님용 링크 — 로그인 없이 주문만 가능</p>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="새 회차 제목"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={createSession}
            disabled={saving}
            className="p-2 bg-teal-600 rounded-lg text-white"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1 max-h-[50vh] overflow-y-auto">
          {sessions.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
                selectedId === s.id
                  ? 'bg-teal-600/20 text-teal-200 border border-teal-500/30'
                  : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <p className="font-medium truncate">{s.title}</p>
              <p className="text-[10px] mt-0.5">
                <span className={
                  s.status === 'open' ? 'text-emerald-400'
                    : s.status === 'closed' ? 'text-red-400' : 'text-slate-500'
                }>
                  {s.status === 'open' ? '접수중' : s.status === 'closed' ? '마감' : '준비'}
                </span>
              </p>
            </button>
          ))}
        </div>
      </aside>

      {/* 상세 */}
      <main className="flex-1 p-4 overflow-y-auto">
        {!selectedId ? (
          <p className="text-slate-500 text-sm">왼쪽에서 회차를 선택하거나 새로 만드세요</p>
        ) : loading ? (
          <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
        ) : (
          <div className="space-y-6 max-w-3xl">
            {msg && (
              <p className="text-xs text-teal-400 bg-teal-950/40 border border-teal-800/40 rounded-lg px-3 py-2">
                {msg}
              </p>
            )}

            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <h2 className="font-semibold text-white">회차 설정</h2>
              <input
                type="text"
                value={sessionMeta.title}
                onChange={e => setSessionMeta(m => ({ ...m, title: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              />
              <textarea
                value={sessionMeta.description}
                onChange={e => setSessionMeta(m => ({ ...m, description: e.target.value }))}
                placeholder="안내 문구"
                rows={2}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={sessionMeta.orderDeadline}
                onChange={e => setSessionMeta(m => ({ ...m, orderDeadline: e.target.value }))}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSessionMeta(m => ({ ...m, status: 'open' }))}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs ${
                    sessionMeta.status === 'open' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <Play className="w-3 h-3" /> 접수 시작
                </button>
                <button
                  type="button"
                  onClick={() => setSessionMeta(m => ({ ...m, status: 'closed' }))}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs ${
                    sessionMeta.status === 'closed' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <Pause className="w-3 h-3" /> 마감
                </button>
                <button
                  type="button"
                  onClick={saveSession}
                  disabled={saving}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-teal-600 text-white"
                >
                  <Save className="w-3 h-3" /> 저장
                </button>
              </div>
              {publicUrl && (
                <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-slate-800">
                  <Link2 className="w-4 h-4 text-slate-500" />
                  <code className="text-xs text-slate-400 flex-1 truncate">{publicUrl}</code>
                  <button type="button" onClick={copyPublicLink} className="p-1.5 text-slate-400 hover:text-white">
                    <Copy className="w-4 h-4" />
                  </button>
                  <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 text-slate-400 hover:text-white">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}
            </section>

            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <h2 className="font-semibold text-white">
                {editingLineId ? '품목 수정' : '품목 등록'}
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder="품목명 *"
                  value={lineForm.name}
                  onChange={e => setLineForm(f => ({ ...f, name: e.target.value }))}
                  className="col-span-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                />
                <textarea
                  placeholder="품목 설명"
                  value={lineForm.description}
                  onChange={e => setLineForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="col-span-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  placeholder="원산지"
                  value={lineForm.origin}
                  onChange={e => setLineForm(f => ({ ...f, origin: e.target.value }))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  placeholder="단위 (ea, kg)"
                  value={lineForm.unit}
                  onChange={e => setLineForm(f => ({ ...f, unit: e.target.value }))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  placeholder="정상가"
                  value={lineForm.normalPrice || ''}
                  onChange={e => setLineForm(f => ({ ...f, normalPrice: Number(e.target.value) }))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  placeholder="할인가"
                  value={lineForm.discountPrice || ''}
                  onChange={e => setLineForm(f => ({ ...f, discountPrice: Number(e.target.value) }))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  placeholder="총수량"
                  value={lineForm.totalQty || ''}
                  onChange={e => setLineForm(f => ({ ...f, totalQty: Number(e.target.value) }))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                />
                <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  사진
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) uploadPhoto(f).catch(err => setMsg(String(err)));
                    }}
                  />
                </label>
              </div>
              {lineForm.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lineForm.photoUrl} alt="" className="h-24 rounded-lg object-cover" />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveLine}
                  disabled={saving}
                  className="px-4 py-2 bg-teal-600 rounded-lg text-sm text-white font-medium"
                >
                  {editingLineId ? '수정 저장' : '품목 추가'}
                </button>
                {editingLineId && (
                  <button
                    type="button"
                    onClick={() => { setEditingLineId(null); setLineForm({ ...EMPTY_LINE }); }}
                    className="px-4 py-2 bg-slate-800 rounded-lg text-sm text-slate-400"
                  >
                    취소
                  </button>
                )}
              </div>
            </section>

            <section>
              <h2 className="font-semibold text-white mb-2">등록 품목 ({lines.length})</h2>
              <div className="space-y-2">
                {lines.map(line => (
                  <div
                    key={line.id}
                    className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl p-3"
                  >
                    {line.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={line.photoUrl} alt="" className="w-14 h-14 rounded-lg object-cover" />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-slate-800" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white text-sm">{line.name}</p>
                      <p className="text-[10px] text-slate-500">
                        {line.discountPrice || line.normalPrice}원 · 잔량 {line.remainingQty}/{line.totalQty}
                      </p>
                    </div>
                    <button type="button" onClick={() => editLine(line)} className="text-xs text-teal-400">
                      수정
                    </button>
                    <button type="button" onClick={() => deleteLine(line.id)} className="text-slate-600 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="font-semibold text-white mb-2">주문 접수 내역 ({entries.length})</h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {entries.map(e => (
                  <div key={e.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-white font-medium">{e.ordererName}</span>
                      <span className="text-teal-300">{e.totalAmount?.toLocaleString()}원</span>
                    </div>
                    <p className="text-[10px] text-slate-500">{e.ordererPhoneMasked}</p>
                    <ul className="mt-1 text-xs text-slate-400">
                      {(e.lines as { name: string; qty: number }[]).map((l, i) => (
                        <li key={i}>{l.name} × {l.qty}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

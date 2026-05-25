'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import {
  Building2, Plus, Search, Phone, Mail, MapPin, User,
  ChevronRight, Pencil, Trash2, RotateCcw, Clock,
  Check, X, Bot, Send, Loader2, Tag, Package,
  CalendarDays, Truck, CreditCard, FileText, ChevronDown,
  AlertTriangle, CheckCircle2,
} from 'lucide-react';

/* ── 타입 ── */
interface Supplier {
  id: string;
  supplierName: string;
  category: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  businessNumber: string;
  orderDays: number[];
  deliveryDays: number[];
  leadTime: number;
  paymentTerms: string;
  memo: string;
  active: boolean;
  tags: string[];
  version?: number;
  currentVersion?: number;
  lastModifiedBy?: { name?: string };
  lastModifiedAt?: any;
  createdAt?: any;
}

interface HistoryItem {
  id: string;
  version: number;
  changeType: 'create' | 'update' | 'rollback';
  changedFields: string[];
  changeMemo: string;
  changedBy: { name?: string };
  changedAt: any;
  snapshot: Partial<Supplier>;
}

interface ChatMsg { role: 'user' | 'assistant'; content: string }

/* ── 상수 ── */
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const CATEGORIES = ['소고기', '돼지고기', '닭고기', '수산물', '채소/과일', '공산품', '기타'];
const PAYMENT_TERMS = ['현금', '익월 말일', '익월 15일', '30일 후', '60일 후', '어음'];

const EMPTY_FORM: Omit<Supplier, 'id'> = {
  supplierName: '', category: '소고기', contactPerson: '', phone: '',
  email: '', address: '', businessNumber: '',
  orderDays: [], deliveryDays: [], leadTime: 1,
  paymentTerms: '익월 말일', memo: '', active: true, tags: [],
};

const FIELD_LABELS: Record<string, string> = {
  supplierName:'거래처명', category:'분류', contactPerson:'담당자', phone:'전화번호',
  email:'이메일', address:'주소', businessNumber:'사업자번호',
  orderDays:'발주요일', deliveryDays:'수령요일', leadTime:'리드타임',
  paymentTerms:'결제조건', memo:'메모', active:'활성여부',
};

/* ── 유틸 ── */
function formatTs(ts: any) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('ko-KR', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}
function dowLabel(days: number[]) {
  return days.length ? days.sort().map(d => DOW[d]).join('·') : '미설정';
}
function categoryColor(cat: string) {
  const m: Record<string, string> = {
    '소고기':'bg-red-900/40 text-red-300',
    '돼지고기':'bg-pink-900/40 text-pink-300',
    '닭고기':'bg-amber-900/40 text-amber-300',
    '수산물':'bg-blue-900/40 text-blue-300',
    '채소/과일':'bg-green-900/40 text-green-300',
    '공산품':'bg-purple-900/40 text-purple-300',
    '기타':'bg-slate-800 text-slate-400',
  };
  return m[cat] ?? 'bg-slate-800 text-slate-400';
}

/* ── 요일 토글 버튼 ── */
function DowToggle({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex gap-1">
      {DOW.map((label, i) => (
        <button
          key={i} type="button"
          onClick={() => onChange(value.includes(i) ? value.filter(d => d !== i) : [...value, i])}
          className={`w-8 h-8 rounded-full text-xs font-medium transition-colors ${
            value.includes(i) ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ── 거래처 폼 ── */
function SupplierForm({
  initial, onSave, onCancel, saving,
}: {
  initial: Omit<Supplier, 'id'>;
  onSave: (v: Omit<Supplier, 'id'>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  const set = (k: keyof typeof EMPTY_FORM, v: any) => setForm(f => ({ ...f, [k]: v }));
  const [tagInput, setTagInput] = useState('');

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) setForm(f => ({ ...f, tags: [...f.tags, t] }));
    setTagInput('');
  };

  return (
    <form onSubmit={e => { e.preventDefault(); onSave(form); }} className="space-y-4">
      {/* 기본정보 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-[11px] text-slate-400 mb-1 block">거래처명 *</label>
          <input
            required value={form.supplierName}
            onChange={e => set('supplierName', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
            placeholder="예: 한우축산"
          />
        </div>
        <div>
          <label className="text-[11px] text-slate-400 mb-1 block">분류</label>
          <select
            value={form.category} onChange={e => set('category', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
          >
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-slate-400 mb-1 block">담당자</label>
          <input
            value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
            placeholder="홍길동"
          />
        </div>
        <div>
          <label className="text-[11px] text-slate-400 mb-1 block">전화번호</label>
          <input
            value={form.phone} onChange={e => set('phone', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
            placeholder="010-0000-0000"
          />
        </div>
        <div>
          <label className="text-[11px] text-slate-400 mb-1 block">이메일</label>
          <input
            type="email" value={form.email} onChange={e => set('email', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
            placeholder="example@email.com"
          />
        </div>
        <div className="col-span-2">
          <label className="text-[11px] text-slate-400 mb-1 block">주소</label>
          <input
            value={form.address} onChange={e => set('address', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
            placeholder="서울시 ..."
          />
        </div>
        <div>
          <label className="text-[11px] text-slate-400 mb-1 block">사업자번호</label>
          <input
            value={form.businessNumber} onChange={e => set('businessNumber', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
            placeholder="000-00-00000"
          />
        </div>
        <div>
          <label className="text-[11px] text-slate-400 mb-1 block">결제조건</label>
          <select
            value={form.paymentTerms} onChange={e => set('paymentTerms', e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
          >
            {PAYMENT_TERMS.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* 발주 설정 */}
      <div className="bg-slate-800/50 rounded-xl p-3 space-y-3">
        <p className="text-[11px] text-slate-400 font-semibold">발주 설정</p>
        <div>
          <label className="text-[11px] text-slate-500 mb-1.5 block">발주 요일</label>
          <DowToggle value={form.orderDays} onChange={v => set('orderDays', v)} />
        </div>
        <div>
          <label className="text-[11px] text-slate-500 mb-1.5 block">수령 요일</label>
          <DowToggle value={form.deliveryDays} onChange={v => set('deliveryDays', v)} />
        </div>
        <div>
          <label className="text-[11px] text-slate-500 mb-1 block">리드타임 (발주→수령 일수)</label>
          <input
            type="number" min={0} max={14} value={form.leadTime}
            onChange={e => set('leadTime', Number(e.target.value))}
            className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
          />
          <span className="text-xs text-slate-500 ml-2">일</span>
        </div>
      </div>

      {/* 태그 */}
      <div>
        <label className="text-[11px] text-slate-400 mb-1 block">태그</label>
        <div className="flex gap-1.5 flex-wrap mb-1.5">
          {form.tags.map(t => (
            <span key={t} className="flex items-center gap-1 bg-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded-full">
              {t}
              <button type="button" onClick={() => setForm(f => ({ ...f, tags: f.tags.filter(x => x !== t) }))}>
                <X className="w-2.5 h-2.5 text-slate-500 hover:text-red-400" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            value={tagInput} onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-teal-500"
            placeholder="태그 입력 후 Enter"
          />
          <button type="button" onClick={addTag} className="px-3 py-1.5 bg-slate-700 text-slate-300 rounded-lg text-xs hover:bg-slate-600">추가</button>
        </div>
      </div>

      {/* 메모 */}
      <div>
        <label className="text-[11px] text-slate-400 mb-1 block">메모</label>
        <textarea
          value={form.memo} onChange={e => set('memo', e.target.value)} rows={2}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-teal-500 resize-none"
          placeholder="특이사항, 주의사항 등"
        />
      </div>

      {/* 활성 상태 */}
      <label className="flex items-center gap-2 cursor-pointer">
        <div
          onClick={() => set('active', !form.active)}
          className={`w-10 h-5 rounded-full transition-colors relative ${form.active ? 'bg-teal-600' : 'bg-slate-700'}`}
        >
          <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${form.active ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </div>
        <span className="text-xs text-slate-300">{form.active ? '활성 거래처' : '비활성 거래처'}</span>
      </label>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors">
          취소
        </button>
        <button type="submit" disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs rounded-lg disabled:opacity-50 transition-colors">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          저장
        </button>
      </div>
    </form>
  );
}

/* ── 변경이력 탭 ── */
function HistoryTab({ storeId, supplierId, onRollback }: { storeId: string; supplierId: string; onRollback: (v: number) => void }) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/suppliers?storeId=${storeId}&supplierId=${supplierId}&type=history`)
      .then(r => r.json())
      .then(d => setHistory(d.history || []))
      .finally(() => setLoading(false));
  }, [storeId, supplierId]);

  if (loading) return (
    <div className="space-y-2 p-4">
      {[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-slate-800 rounded-lg animate-pulse" />)}
    </div>
  );
  if (!history.length) return (
    <div className="flex items-center justify-center h-32 text-slate-500 text-sm">변경 이력이 없습니다</div>
  );

  return (
    <div className="p-4 space-y-2">
      {history.map(h => (
        <div key={h.id} className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === h.id ? null : h.id)}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
          >
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              h.changeType === 'create' ? 'bg-teal-900/50 text-teal-300' :
              h.changeType === 'rollback' ? 'bg-purple-900/50 text-purple-300' :
              'bg-blue-900/50 text-blue-300'
            }`}>
              {h.changeType === 'create' ? '등록' : h.changeType === 'rollback' ? '롤백' : '수정'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-300 truncate">
                {h.changeMemo || (h.changedFields || []).map(f => FIELD_LABELS[f] || f).join(', ')}
              </p>
              <p className="text-[10px] text-slate-500">
                {h.changedBy?.name || '시스템'} · {formatTs(h.changedAt)} · v{h.version}
              </p>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform shrink-0 ${expanded === h.id ? 'rotate-180' : ''}`} />
          </button>

          {expanded === h.id && (
            <div className="px-3 pb-3 border-t border-slate-700/50">
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                {(h.changedFields || []).filter(f => f !== 'rollback').map(f => (
                  <div key={f} className="text-[10px]">
                    <span className="text-slate-500">{FIELD_LABELS[f] || f}: </span>
                    <span className="text-slate-300">
                      {Array.isArray((h.snapshot as any)[f])
                        ? (f.includes('Days') ? dowLabel((h.snapshot as any)[f]) : ((h.snapshot as any)[f] as any[]).join(', '))
                        : String((h.snapshot as any)[f] ?? '')}
                    </span>
                  </div>
                ))}
              </div>
              {h.changeType !== 'create' && (
                <button
                  onClick={() => onRollback(h.version)}
                  className="mt-2 flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" /> 이 버전으로 롤백
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── AI 채팅 패널 ── */
function AiChatPanel({
  suppliers, storeId, onClose, onRefresh,
}: {
  suppliers: Supplier[];
  storeId: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    { role: 'assistant', content: '안녕하세요! 거래처 관리 AI 도우미입니다.\n거래처 정보 조회, 발주 설정 수정 등 도와드릴게요.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 99999, behavior: 'smooth' });
  }, [msgs]);

  const send = async (text?: string) => {
    const msg = text ?? input.trim();
    if (!msg || loading) return;
    setInput('');
    setMsgs(m => [...m, { role: 'user', content: msg }]);
    setLoading(true);

    // AI에게 거래처 목록 컨텍스트 주입
    const context = `현재 등록된 거래처 목록:\n${suppliers.map(s =>
      `- ${s.supplierName} (${s.category}, 담당: ${s.contactPerson || '미입력'}, 발주요일: ${dowLabel(s.orderDays)})`
    ).join('\n')}`;

    try {
      const history = msgs.slice(-6).map(m => ({ role: m.role, content: m.content }));
      history[0] = { role: 'user', content: context + '\n\n' + (history[0]?.content || '') };

      const res = await fetch('/api/purchases/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history }),
      });
      const data = await res.json();

      if (data.confirmRequired) {
        setPending(data);
        setMsgs(m => [...m, { role: 'assistant', content: data.message + '\n\n확인이 필요합니다.' }]);
      } else {
        setMsgs(m => [...m, { role: 'assistant', content: data.message }]);
      }
    } catch {
      setMsgs(m => [...m, { role: 'assistant', content: '오류가 발생했습니다. 다시 시도해주세요.' }]);
    } finally {
      setLoading(false);
    }
  };

  const confirmAction = async () => {
    if (!pending) return;
    if (pending.action === 'update_supplier' && pending.targetSupplier && storeId) {
      const target = suppliers.find(s => s.supplierName.includes(pending.targetSupplier));
      if (target) {
        await fetch('/api/suppliers', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId, supplierId: target.id,
            updates: pending.updateFields,
            changeSource: 'ai', changeMemo: pending.changeMemo || 'AI 자동 수정',
          }),
        });
        onRefresh();
        setMsgs(m => [...m, { role: 'assistant', content: `${target.supplierName} 정보를 수정했습니다.` }]);
      }
    }
    setPending(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 shrink-0">
        <Bot className="w-4 h-4 text-teal-400" />
        <span className="text-sm font-semibold text-slate-200">AI 거래처 도우미</span>
        <button onClick={onClose} className="ml-auto p-1 text-slate-500 hover:text-slate-300">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-teal-700 text-white'
                : 'bg-slate-800 text-slate-200 border border-slate-700/50'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" />
            </div>
          </div>
        )}
        {pending && (
          <div className="flex gap-2 justify-center">
            <button onClick={confirmAction}
              className="flex items-center gap-1 px-3 py-1.5 bg-teal-700 text-white text-xs rounded-lg hover:bg-teal-600">
              <CheckCircle2 className="w-3 h-3" /> 확인
            </button>
            <button onClick={() => setPending(null)}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 text-slate-300 text-xs rounded-lg hover:bg-slate-600">
              <X className="w-3 h-3" /> 취소
            </button>
          </div>
        )}
      </div>

      {/* 빠른 명령 */}
      <div className="px-3 pb-2 flex gap-1.5 flex-wrap shrink-0">
        {['거래처 목록 알려줘', '발주 마감 거래처 알려줘'].map(q => (
          <button key={q} onClick={() => send(q)}
            className="text-[10px] bg-slate-800 text-slate-400 hover:text-teal-400 border border-slate-700/50 rounded-full px-2.5 py-1 transition-colors">
            {q}
          </button>
        ))}
      </div>

      <div className="px-3 pb-3 shrink-0">
        <div className="flex gap-2">
          <input
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-teal-500"
            placeholder="질문하거나 명령하세요..."
            disabled={loading}
          />
          <button onClick={() => send()} disabled={loading || !input.trim()}
            className="p-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl disabled:opacity-40 transition-colors">
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 상세 패널 ── */
function DetailPanel({
  supplier, storeId, onUpdate, onDelete, onClose,
}: {
  supplier: Supplier;
  storeId: string;
  onUpdate: (s: Supplier) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [tab, setTab] = useState<'info' | 'history'>('info');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async (form: Omit<Supplier, 'id'>) => {
    setSaving(true);
    try {
      const changedFields = (Object.keys(form) as (keyof typeof form)[]).filter(
        k => JSON.stringify(form[k]) !== JSON.stringify((supplier as any)[k])
      );
      await fetch('/api/suppliers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId, supplierId: supplier.id,
          updates: Object.fromEntries(changedFields.map(k => [k, form[k]])),
          changedBy: { uid: user?.uid, name: user?.displayName },
          changeMemo: '정보 수정',
        }),
      });
      onUpdate({ ...supplier, ...form });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleRollback = async (version: number) => {
    if (!confirm(`v${version}으로 롤백하시겠습니까?`)) return;
    await fetch('/api/suppliers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId, supplierId: supplier.id,
        rollbackVersion: version,
        changedBy: { uid: user?.uid, name: user?.displayName },
      }),
    });
    alert('롤백 완료. 페이지를 새로고침해주세요.');
  };

  const handleDelete = async () => {
    if (!confirm(`"${supplier.supplierName}" 거래처를 삭제하시겠습니까?`)) return;
    await fetch(`/api/suppliers?storeId=${storeId}&supplierId=${supplier.id}`, { method: 'DELETE' });
    onDelete(supplier.id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="px-5 pt-5 pb-3 border-b border-slate-800 shrink-0">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${categoryColor(supplier.category)}`}>
                {supplier.category}
              </span>
              {!supplier.active && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-500">비활성</span>
              )}
            </div>
            <h2 className="text-lg font-bold text-slate-100 mt-1">{supplier.supplierName}</h2>
            {supplier.contactPerson && (
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                <User className="w-3 h-3" /> {supplier.contactPerson}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!editing && (
              <button onClick={() => setEditing(true)}
                className="p-2 text-slate-500 hover:text-teal-400 transition-colors">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={handleDelete}
              className="p-2 text-slate-500 hover:text-red-400 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-300 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 탭 */}
        {!editing && (
          <div className="flex gap-1 mt-3">
            {(['info', 'history'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                  tab === t ? 'bg-teal-700 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}>
                {t === 'info' ? '상세정보' : '변경이력'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto">
        {editing ? (
          <div className="p-5">
            <SupplierForm
              initial={{ ...EMPTY_FORM, ...supplier }}
              onSave={handleSave}
              onCancel={() => setEditing(false)}
              saving={saving}
            />
          </div>
        ) : tab === 'info' ? (
          <div className="p-5 space-y-4">
            {/* 연락처 */}
            <section className="space-y-2">
              <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide">연락처</p>
              {supplier.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <a href={`tel:${supplier.phone}`} className="text-teal-400 hover:underline">{supplier.phone}</a>
                </div>
              )}
              {supplier.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <a href={`mailto:${supplier.email}`} className="text-teal-400 hover:underline truncate">{supplier.email}</a>
                </div>
              )}
              {supplier.address && (
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                  <span className="text-slate-300">{supplier.address}</span>
                </div>
              )}
              {supplier.businessNumber && (
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="text-slate-300">{supplier.businessNumber}</span>
                </div>
              )}
            </section>

            {/* 발주 설정 */}
            <section className="space-y-2 bg-slate-800/40 rounded-xl p-3">
              <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide">발주 설정</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-slate-500 mb-1">발주 요일</p>
                  <div className="flex gap-0.5 flex-wrap">
                    {DOW.map((d, i) => (
                      <span key={i} className={`text-[10px] w-6 h-6 flex items-center justify-center rounded-full font-medium ${
                        supplier.orderDays?.includes(i) ? 'bg-teal-700 text-white' : 'bg-slate-800 text-slate-600'
                      }`}>{d}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 mb-1">수령 요일</p>
                  <div className="flex gap-0.5 flex-wrap">
                    {DOW.map((d, i) => (
                      <span key={i} className={`text-[10px] w-6 h-6 flex items-center justify-center rounded-full font-medium ${
                        supplier.deliveryDays?.includes(i) ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-600'
                      }`}>{d}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">리드타임</p>
                  <p className="text-sm text-slate-200 font-medium">{supplier.leadTime ?? 1}일</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">결제조건</p>
                  <p className="text-sm text-slate-200 font-medium">{supplier.paymentTerms || '미설정'}</p>
                </div>
              </div>
            </section>

            {/* 태그 */}
            {supplier.tags?.length > 0 && (
              <section>
                <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide mb-2">태그</p>
                <div className="flex gap-1.5 flex-wrap">
                  {supplier.tags.map(t => (
                    <span key={t} className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded-full border border-slate-700">{t}</span>
                  ))}
                </div>
              </section>
            )}

            {/* 메모 */}
            {supplier.memo && (
              <section>
                <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide mb-1">메모</p>
                <p className="text-xs text-slate-300 bg-slate-800/40 rounded-xl p-3 whitespace-pre-wrap">{supplier.memo}</p>
              </section>
            )}

            {/* 메타 */}
            <section className="text-[10px] text-slate-600 space-y-0.5 pt-2 border-t border-slate-800">
              {supplier.lastModifiedAt && (
                <p>최종 수정: {formatTs(supplier.lastModifiedAt)} · {supplier.lastModifiedBy?.name || '시스템'}</p>
              )}
              {supplier.currentVersion && <p>버전 v{supplier.currentVersion}</p>}
            </section>
          </div>
        ) : (
          <HistoryTab storeId={storeId} supplierId={supplier.id} onRollback={handleRollback} />
        )}
      </div>
    </div>
  );
}

/* ── 메인 페이지 ── */
export default function SuppliersPage() {
  const { user } = useAuth();
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active');
  const [selected, setSelected]   = useState<Supplier | null>(null);
  const [showAdd, setShowAdd]     = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [showAi, setShowAi]       = useState(false);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/suppliers?storeId=${storeId}`);
      const data = await res.json();
      setSuppliers(data.suppliers || []);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (form: Omit<Supplier, 'id'>) => {
    setAddSaving(true);
    try {
      await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId, supplier: form,
          changedBy: { uid: user?.uid, name: user?.displayName },
        }),
      });
      await load();
      setShowAdd(false);
    } finally {
      setAddSaving(false);
    }
  };

  const handleUpdate = (updated: Supplier) => {
    setSuppliers(s => s.map(x => x.id === updated.id ? updated : x));
    setSelected(updated);
  };

  const handleDelete = (id: string) => {
    setSuppliers(s => s.filter(x => x.id !== id));
    setSelected(null);
  };

  const filtered = suppliers.filter(s => {
    if (filterActive === 'active' && !s.active) return false;
    if (filterActive === 'inactive' && s.active) return false;
    if (filterCat && s.category !== filterCat) return false;
    const q = search.toLowerCase();
    return !q || s.supplierName.toLowerCase().includes(q)
      || s.contactPerson?.toLowerCase().includes(q)
      || s.phone?.includes(q);
  });

  return (
    <div className="flex h-full bg-slate-950 overflow-hidden">

      {/* ── 좌측: 목록 ── */}
      <div className={`flex flex-col border-r border-slate-800 shrink-0 transition-all ${selected || showAi ? 'w-72' : 'w-full max-w-lg'}`}>
        {/* 헤더 */}
        <div className="px-4 pt-5 pb-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-teal-400" />
              <h1 className="text-base font-bold text-slate-100">거래처 관리</h1>
              <span className="text-xs text-slate-500">({filtered.length})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { setShowAi(v => !v); setSelected(null); }}
                className={`p-2 rounded-lg transition-colors ${showAi ? 'bg-teal-700 text-white' : 'text-slate-400 hover:text-teal-400 hover:bg-slate-800'}`}
              >
                <Bot className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setShowAdd(true); setSelected(null); setShowAi(false); }}
                className="flex items-center gap-1 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> 추가
              </button>
            </div>
          </div>

          {/* 검색 */}
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-teal-500 placeholder:text-slate-500"
              placeholder="거래처명, 담당자, 전화번호..."
            />
          </div>

          {/* 필터 */}
          <div className="flex gap-1.5 flex-wrap">
            {(['all', 'active', 'inactive'] as const).map(v => (
              <button key={v} onClick={() => setFilterActive(v)}
                className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
                  filterActive === v ? 'bg-teal-700 border-teal-600 text-white' : 'border-slate-700 text-slate-400 hover:border-slate-500'
                }`}>
                {v === 'all' ? '전체' : v === 'active' ? '활성' : '비활성'}
              </button>
            ))}
            <select
              value={filterCat} onChange={e => setFilterCat(e.target.value)}
              className="text-[10px] px-2 py-1 rounded-full border border-slate-700 bg-slate-900 text-slate-400 focus:outline-none focus:border-slate-500"
            >
              <option value="">전체 분류</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* 목록 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {loading ? (
            [...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-800 rounded-xl animate-pulse" />
            ))
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-500 gap-2">
              <Building2 className="w-8 h-8 opacity-30" />
              <p className="text-sm">거래처가 없습니다</p>
              <button onClick={() => setShowAdd(true)}
                className="text-xs text-teal-400 hover:text-teal-300">
                + 거래처 추가
              </button>
            </div>
          ) : (
            filtered.map(s => (
              <button
                key={s.id}
                onClick={() => { setSelected(s); setShowAi(false); setShowAdd(false); }}
                className={`w-full text-left rounded-xl p-3 border transition-all ${
                  selected?.id === s.id
                    ? 'bg-slate-800 border-teal-600/50'
                    : 'bg-slate-900 border-slate-800/50 hover:border-slate-700 hover:bg-slate-800/50'
                } ${!s.active ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-sm font-semibold text-slate-100 truncate">{s.supplierName}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${categoryColor(s.category)}`}>
                        {s.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-500">
                      {s.contactPerson && <span className="flex items-center gap-0.5"><User className="w-2.5 h-2.5" />{s.contactPerson}</span>}
                      {s.phone && <span className="flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{s.phone}</span>}
                    </div>
                    {s.orderDays?.length > 0 && (
                      <div className="flex items-center gap-0.5 mt-1">
                        <CalendarDays className="w-2.5 h-2.5 text-slate-600" />
                        <span className="text-[10px] text-slate-600">발주 {dowLabel(s.orderDays)}</span>
                        {s.deliveryDays?.length > 0 && (
                          <span className="text-[10px] text-slate-600 ml-2 flex items-center gap-0.5">
                            <Truck className="w-2.5 h-2.5" />수령 {dowLabel(s.deliveryDays)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0 mt-1" />
                </div>
              </button>
            ))
          )}
        </div>

        {/* 통계 요약 */}
        {!loading && suppliers.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-800 shrink-0">
            <div className="flex gap-4 text-[10px] text-slate-500">
              <span>전체 {suppliers.length}</span>
              <span>활성 {suppliers.filter(s => s.active).length}</span>
              {CATEGORIES.filter(c => suppliers.some(s => s.category === c)).map(c => (
                <span key={c}>{c} {suppliers.filter(s => s.category === c).length}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 우측: 상세 / 추가 / AI ── */}
      <div className="flex-1 overflow-hidden">
        {/* 거래처 추가 */}
        {showAdd && (
          <div className="h-full overflow-y-auto">
            <div className="max-w-xl mx-auto p-6">
              <div className="flex items-center gap-2 mb-5">
                <Plus className="w-4 h-4 text-teal-400" />
                <h2 className="text-base font-bold text-slate-100">새 거래처 추가</h2>
                <button onClick={() => setShowAdd(false)} className="ml-auto p-1.5 text-slate-500 hover:text-slate-300">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <SupplierForm
                initial={EMPTY_FORM}
                onSave={handleAdd}
                onCancel={() => setShowAdd(false)}
                saving={addSaving}
              />
            </div>
          </div>
        )}

        {/* 거래처 상세 */}
        {selected && !showAdd && (
          <DetailPanel
            key={selected.id}
            supplier={selected}
            storeId={storeId}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onClose={() => setSelected(null)}
          />
        )}

        {/* AI 채팅 */}
        {showAi && !showAdd && !selected && (
          <AiChatPanel
            suppliers={suppliers}
            storeId={storeId}
            onClose={() => setShowAi(false)}
            onRefresh={load}
          />
        )}

        {/* 빈 상태 */}
        {!selected && !showAdd && !showAi && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
            <Building2 className="w-12 h-12 opacity-20" />
            <p className="text-sm">거래처를 선택하거나 새로 추가하세요</p>
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-600 text-white text-sm rounded-xl transition-colors">
                <Plus className="w-3.5 h-3.5" /> 거래처 추가
              </button>
              <button onClick={() => setShowAi(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-xl transition-colors border border-slate-700">
                <Bot className="w-3.5 h-3.5" /> AI 도우미
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import {
  Send, Download, Printer, Eye, X, Search, Trash2,
  Pencil, Check, AlertCircle, Bot, User, Loader2,
  RefreshCw, Scale, ChevronDown, Plus, Table2,
  MessageSquare, Home,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { AiUsedBadge, type AiMetaDisplay } from '@/components/AiUsedBadge';
import PosBarCodeBreakdownView from '@/components/scale/PosBarCodeBreakdownView';
import {
  breakdownPosBarCode,
  labelPrefix3,
  POS_BARCODE_STRUCTURE_HINT,
  scaleCodeNumberFromBarCode,
} from '@/lib/posBarCode';

/* ── 타입 ── */
interface ScaleCode {
  id: string;
  code: number;
  scaleCode3?: string;
  posBarCode?: string;
  prefix3?: string;
  name: string;
  category: string;
  storeId?: string;
  source?: string;
}

interface PendingGroup {
  scaleCode3: string;
  items: Array<{
    posBarCode: string;
    prefix3?: string;
    code?: number;
    name: string;
    categoryName?: string;
  }>;
}

interface ChatMsg {
  role: 'user' | 'ai';
  content: string;
  action?: string;
  ai?: AiMetaDisplay;
}

/* ── 카테고리 분류 ── */
function getCategory(name: string): string {
  if (/한우/.test(name))               return '한우';
  if (/한돈/.test(name))               return '한돈';
  if (/수입|호주|미국|미산|호산/.test(name)) return '수입육';
  return '기타';
}

const CATEGORY_ORDER = ['한우', '한돈', '수입육', '기타'];
const CATEGORY_COLOR: Record<string, string> = {
  '한우': 'bg-red-900/30 text-red-300 border-red-800/40',
  '한돈': 'bg-blue-900/30 text-blue-300 border-blue-800/40',
  '수입육': 'bg-green-900/30 text-green-300 border-green-800/40',
  '기타': 'bg-slate-700/40 text-slate-400 border-slate-600/40',
};
const CATEGORY_HEADER_COLOR: Record<string, string> = {
  '한우':  'bg-red-900/50 text-red-200',
  '한돈':  'bg-blue-900/50 text-blue-200',
  '수입육': 'bg-green-900/50 text-green-200',
  '기타':  'bg-slate-700 text-slate-300',
};

/* ════════════════ 출력 미리보기 모달 ════════════════ */
function PrintPreviewModal({
  items, storeName, onClose,
}: { items: ScaleCode[]; storeName: string; onClose: () => void }) {
  const groups: Record<string, ScaleCode[]> = {};
  CATEGORY_ORDER.forEach(c => { groups[c] = []; });
  items.forEach(item => {
    const c = item.category || getCategory(item.name);
    if (!groups[c]) groups[c] = [];
    groups[c].push(item);
  });
  CATEGORY_ORDER.forEach(c => groups[c].sort((a, b) => a.code - b.code));

  const handlePrint = () => window.print();

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto py-8 px-4 print:hidden" onClick={onClose}>
        <div className="relative bg-white rounded-xl shadow-2xl max-w-4xl w-full" onClick={e => e.stopPropagation()}>
          {/* 모달 헤더 */}
          <div className="flex items-center justify-between p-4 border-b print:hidden">
            <h2 className="text-slate-800 font-bold">출력 미리보기</h2>
            <div className="flex gap-2">
              <button onClick={handlePrint}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm">
                <Printer className="w-4 h-4" /> 출력
              </button>
              <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-800 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* A4 미리보기 */}
          <div id="print-area" className="p-8 bg-white text-black" style={{ fontFamily: "'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif" }}>
            {/* 제목 */}
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-black">{storeName || '매장'}</h1>
              <h2 className="text-xl font-semibold text-slate-700 mt-1">저울 코드표</h2>
              <p className="text-xs text-slate-500 mt-1">총 {items.length}개 품목</p>
            </div>

            {/* 카테고리별 테이블 */}
            <div className="grid grid-cols-3 gap-4">
              {CATEGORY_ORDER.filter(c => (groups[c] || []).length > 0).map(cat => (
                <div key={cat}>
                  <div className="font-bold text-sm text-center py-1.5 bg-slate-100 border border-slate-300 rounded-t">
                    {cat}
                  </div>
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="border border-slate-300 px-2 py-1 text-center w-14">코드</th>
                        <th className="border border-slate-300 px-2 py-1 text-left">품목명</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(groups[cat] || []).map((item, i) => (
                        <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td className="border border-slate-300 px-2 py-1 text-center font-mono font-bold">{item.code}</td>
                          <td className="border border-slate-300 px-2 py-1">{item.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            {/* 기타 섹션 (3컬럼 아래) */}
            {(groups['기타'] || []).length > 0 && (
              <div className="mt-4">
                <div className="font-bold text-sm text-center py-1.5 bg-slate-100 border border-slate-300 rounded-t">
                  기타
                </div>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="border border-slate-300 px-2 py-1 text-center w-14">코드</th>
                      <th className="border border-slate-300 px-2 py-1 text-left">품목명</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(groups['기타'] || []).map((item, i) => (
                      <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="border border-slate-300 px-2 py-1 text-center font-mono font-bold">{item.code}</td>
                        <td className="border border-slate-300 px-2 py-1">{item.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="text-right text-xs text-slate-400 mt-4">
              출력일: {new Date().toLocaleDateString('ko-KR')}
            </div>
          </div>
        </div>
      </div>

      {/* 인쇄 전용 스타일 */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body > * { display: none !important; }
          #print-area { display: block !important; position: fixed; top: 0; left: 0; width: 100%; }
          @page { margin: 10mm; size: A4; }
        }
      ` }} />
    </>
  );
}

/* ════════════════ 메인 ════════════════ */
export default function ScaleCodePage() {
  const { user }         = useAuth();
  const { currentStore } = useStore();

  const uid     = user?.uid     || '';
  const storeId = currentStore?.storeId || '';
  const storeName = currentStore?.storeName || '';

  /* ── 상태 ── */
  const [items,       setItems]       = useState<ScaleCode[]>([]);
  const [pending,     setPending]     = useState<PendingGroup[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([]);
  const [chatInput,   setChatInput]   = useState('');
  const [aiLoading,   setAiLoading]   = useState(false);
  const [filter,      setFilter]      = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editCode,    setEditCode]    = useState('');
  const [editName,    setEditName]    = useState('');
  const [toast,       setToast]       = useState<{ msg: string; ok: boolean } | null>(null);
  const [mobileTab,   setMobileTab]   = useState<'chat' | 'table'>('chat');
  const [manualPos,   setManualPos]   = useState('');
  const [manualName,  setManualName]  = useState('');
  const [manualSaving, setManualSaving] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  /* ── 데이터 로드 ── */
  const loadItems = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const [codesRes, pendingRes] = await Promise.all([
        fetch(`/api/scale/codes?storeId=${encodeURIComponent(storeId)}`, { headers }),
        fetch(`/api/scale/pending?storeId=${encodeURIComponent(storeId)}`, { headers }),
      ]);
      const d = await codesRes.json();
      const p = await pendingRes.json();
      if (d.error) throw new Error(d.error);
      setItems(d.items || []);
      setPending(p.groups || []);
      setPendingCount(p.itemCount ?? 0);
    } catch (e: any) {
      showToast(e.message || '로드 실패', false);
    } finally {
      setLoading(false);
    }
  }, [storeId, showToast]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const manualBreakdown = useMemo(
    () => (manualPos.trim() ? breakdownPosBarCode(manualPos) : null),
    [manualPos],
  );

  const registerManualCode = async () => {
    const b = breakdownPosBarCode(manualPos);
    const name = manualName.trim();
    if (!b || !name) {
      showToast('POS 6자리 코드와 품목명을 입력하세요', false);
      return;
    }
    setManualSaving(true);
    try {
      const res = await fetch('/api/scale/codes', {
        method: 'POST',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({
          storeId,
          createdBy: uid,
          items: [{
            code: scaleCodeNumberFromBarCode(b.pos6),
            name,
            posBarCode: b.pos6,
            scaleCode3: b.scaleCode3,
            prefix3: b.prefix3,
            source: 'manual',
          }],
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast(`등록: ${b.pos6} → 저울 ${b.scaleCode3}`);
      setManualPos('');
      setManualName('');
      await loadItems();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '등록 실패', false);
    } finally {
      setManualSaving(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, aiLoading]);

  /* ── 필터된 아이템 ── */
  const filteredItems = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      i.name.toLowerCase().includes(q)
      || String(i.code).includes(q)
      || (i.scaleCode3 || '').includes(q)
      || (i.posBarCode || '').includes(q)
    );
  }, [items, filter]);

  /* ── 카테고리별 그룹 ── */
  const grouped = useMemo(() => {
    const g: Record<string, ScaleCode[]> = {};
    CATEGORY_ORDER.forEach(c => { g[c] = []; });
    filteredItems.forEach(item => {
      const c = item.category || getCategory(item.name);
      if (!g[c]) g[c] = [];
      g[c].push(item);
    });
    CATEGORY_ORDER.forEach(c => g[c].sort((a, b) =>
      (a.scaleCode3 || String(a.code).padStart(3, '0')).localeCompare(
        b.scaleCode3 || String(b.code).padStart(3, '0'),
      ),
    ));
    return g;
  }, [filteredItems]);

  /* ── AI 채팅 전송 ── */
  const sendMessage = async () => {
    const msg = chatInput.trim();
    if (!msg || aiLoading) return;
    setChatInput('');

    const userMsg: ChatMsg = { role: 'user', content: msg };
    setChatHistory(h => [...h, userMsg]);
    setAiLoading(true);

    try {
      const history = chatHistory.slice(-6).map(m => ({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.content,
      }));

      const res = await fetch('/api/scale/chat', {
        method: 'POST',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({ message: msg, history }),
      });
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      const aiMsg: ChatMsg = {
        role: 'ai',
        content: data.message || '처리가 완료되었습니다.',
        action: data.action,
        ai: data.ai,
      };
      setChatHistory(h => [...h, aiMsg]);

      /* ── action 처리 ── */
      if (data.action === 'add' && data.items?.length) {
        const addRes = await fetch('/api/scale/codes', {
          method: 'POST',
          headers: await getAuthJsonHeaders(),
          body: JSON.stringify({ storeId, items: data.items, createdBy: uid }),
        });
        const addData = await addRes.json();
        if (!addData.error) {
          showToast(`${data.items.length}개 항목이 추가/수정되었습니다`);
          await loadItems();
        }
      } else if (data.action === 'delete' && data.items?.length) {
        for (const item of data.items) {
          await fetch(`/api/scale/codes?storeId=${storeId}&code=${item.code}`, { method: 'DELETE' });
        }
        showToast(`${data.items.length}개 항목이 삭제되었습니다`);
        await loadItems();
      } else if (data.action === 'update' && data.items?.length) {
        for (const item of data.items) {
          const existing = items.find(i => i.code === Number(item.code));
          if (existing) {
            await fetch('/api/scale/codes', {
              method: 'PUT',
              headers: await getAuthJsonHeaders(),
              body: JSON.stringify({ id: existing.id, name: item.name }),
            });
          }
        }
        showToast('수정되었습니다');
        await loadItems();
      } else if (data.action === 'clear') {
        if (confirm('모든 코드를 삭제하시겠습니까?')) {
          await fetch(`/api/scale/codes?storeId=${storeId}&clearAll=1`, { method: 'DELETE' });
          showToast('전체 삭제되었습니다');
          await loadItems();
        }
      } else if (data.action === 'query' && data.filter) {
        setFilter(data.filter);
      }
    } catch (e: any) {
      setChatHistory(h => [...h, { role: 'ai', content: `오류: ${e.message}` }]);
    } finally {
      setAiLoading(false);
    }
  };

  /* ── 인라인 수정 ── */
  const startEdit = (item: ScaleCode) => {
    setEditingId(item.id);
    setEditCode(String(item.code));
    setEditName(item.name);
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return;
    try {
      await fetch('/api/scale/codes', {
        method: 'PUT',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({ id, name: editName.trim(), code: Number(editCode) }),
      });
      setEditingId(null);
      showToast('수정되었습니다');
      loadItems();
    } catch {
      showToast('수정 실패', false);
    }
  };

  /* ── 삭제 ── */
  const deleteItem = async (id: string, name: string) => {
    if (!confirm(`'${name}' 항목을 삭제하시겠습니까?`)) return;
    try {
      await fetch(`/api/scale/codes?id=${id}`, { method: 'DELETE' });
      showToast('삭제되었습니다');
      loadItems();
    } catch {
      showToast('삭제 실패', false);
    }
  };

  /* ── 엑셀 다운로드 ── */
  const downloadExcel = () => {
    const wb = XLSX.utils.book_new();

    // 시트1: 전체
    const all = items.map(i => ({ 코드: i.code, 품목명: i.name, 카테고리: i.category }));
    const ws1 = XLSX.utils.json_to_sheet(all);
    ws1['!cols'] = [{ wch: 8 }, { wch: 20 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws1, '전체목록');

    // 시트2~4: 카테고리별
    ['한우', '한돈', '수입육'].forEach(cat => {
      const catItems = items
        .filter(i => (i.category || getCategory(i.name)) === cat)
        .sort((a, b) => a.code - b.code)
        .map(i => ({ 코드: i.code, 품목명: i.name }));
      if (catItems.length > 0) {
        const ws = XLSX.utils.json_to_sheet(catItems);
        ws['!cols'] = [{ wch: 8 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, ws, cat);
      }
    });

    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `저울코드표_${date}.xlsx`);
    showToast('엑셀 다운로드 완료');
  };

  /* ── 총 항목수 ── */
  const totalCount = items.length;

  /* ════════════ RENDER ════════════ */
  return (
    <>
      <div className="flex flex-col h-full bg-slate-950 print:hidden">
        {/* 헤더 */}
        <div className="px-4 md:px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="p-1.5 text-slate-500 hover:text-teal-400 transition-colors rounded-lg hover:bg-slate-800 shrink-0" title="홈으로">
              <Home className="w-4 h-4" />
            </Link>
            <Scale className="w-5 h-5 text-teal-400" />
            <div>
              <h1 className="text-slate-100 font-bold text-lg">저울 코드 관리</h1>
              <p className="text-slate-500 text-xs">
                총 {totalCount}개 · POS 6자리 = 앞3(계열)+뒤3(저울) · 7자리(앞0) 4번째=계열구분
                {pendingCount > 0 ? ` · 확인대기 ${pendingCount}건` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowPreview(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-sm">
              <Eye className="w-3.5 h-3.5" /> 출력 미리보기
            </button>
            <button onClick={downloadExcel}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-700/80 hover:bg-green-600 text-white rounded-xl text-sm">
              <Download className="w-3.5 h-3.5" /> 엑셀 다운로드
            </button>
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-700/80 hover:bg-blue-600 text-white rounded-xl text-sm hidden md:flex">
              <Printer className="w-3.5 h-3.5" /> 출력
            </button>
            <button onClick={loadItems}
              className="p-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-xl">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 모바일 탭 */}
        <div className="md:hidden flex border-b border-slate-800 shrink-0">
          <button onClick={() => setMobileTab('chat')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
              mobileTab === 'chat' ? 'text-teal-400 border-b-2 border-teal-400' : 'text-slate-500'
            }`}>
            <MessageSquare className="w-4 h-4" /> AI 채팅
          </button>
          <button onClick={() => setMobileTab('table')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
              mobileTab === 'table' ? 'text-teal-400 border-b-2 border-teal-400' : 'text-slate-500'
            }`}>
            <Table2 className="w-4 h-4" /> 코드표
          </button>
        </div>

        {/* 본문 2단 */}
        <div className="flex-1 flex overflow-hidden">

          {/* 좌측: AI 채팅 (40%) */}
          <div className={`${mobileTab === 'table' ? 'hidden' : 'flex'} md:flex flex-col w-full md:w-[40%] border-r border-slate-800/60`}>
            {/* 채팅 메시지 영역 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatHistory.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <div className="w-14 h-14 bg-teal-900/40 rounded-2xl flex items-center justify-center mb-3">
                    <Bot className="w-7 h-7 text-teal-400" />
                  </div>
                  <p className="text-slate-300 font-semibold text-sm">AI 저울 코드 도우미</p>
                  <p className="text-slate-600 text-xs mt-1 max-w-xs">
                    자연어로 코드를 추가·수정·삭제할 수 있습니다
                  </p>
                  <div className="mt-4 space-y-1.5 text-left w-full max-w-xs">
                    {[
                      '100 한우모듬',
                      '9 한우곱창, 10 한우국거리',
                      '100 삭제',
                      '100 한우특모듬으로 수정',
                      '한우 전체 보여줘',
                    ].map((ex, i) => (
                      <button key={i}
                        onClick={() => { setChatInput(ex); }}
                        className="w-full text-left text-xs bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 px-3 py-2 rounded-xl border border-slate-700/50 transition-colors">
                        &ldquo;{ex}&rdquo;
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {chatHistory.map((msg, i) => (
                <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'ai' && (
                    <div className="w-7 h-7 bg-teal-900/60 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-4 h-4 text-teal-400" />
                    </div>
                  )}
                  <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-teal-600 text-white rounded-tr-sm'
                      : 'bg-slate-800 text-slate-200 rounded-tl-sm'
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.role === 'ai' && <AiUsedBadge ai={msg.ai} className="mt-1.5" />}
                    {msg.action && msg.action !== 'chat' && (
                      <span className={`mt-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded-full ${
                        msg.action === 'add' ? 'bg-green-900/50 text-green-300' :
                        msg.action === 'delete' ? 'bg-red-900/50 text-red-300' :
                        msg.action === 'update' ? 'bg-yellow-900/50 text-yellow-300' :
                        msg.action === 'query' ? 'bg-blue-900/50 text-blue-300' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        {{ add: '추가', delete: '삭제', update: '수정', query: '검색', clear: '초기화' }[msg.action] || msg.action}
                      </span>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-7 h-7 bg-slate-700 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-4 h-4 text-slate-400" />
                    </div>
                  )}
                </div>
              ))}

              {/* 로딩 점 애니메이션 */}
              {aiLoading && (
                <div className="flex gap-2.5 justify-start">
                  <div className="w-7 h-7 bg-teal-900/60 rounded-full flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-teal-400" />
                  </div>
                  <div className="bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1.5">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* 입력창 */}
            <div className="p-3 border-t border-slate-800 shrink-0">
              <div className="flex gap-2">
                <textarea
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                  }}
                  placeholder="예) 100 한우모듬 / 100 삭제 / 9 한우곱창, 10 한우국거리"
                  rows={2}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 resize-none focus:outline-none focus:border-teal-500 transition-colors"
                />
                <button
                  onClick={sendMessage}
                  disabled={!chatInput.trim() || aiLoading}
                  className="px-4 bg-teal-600 hover:bg-teal-500 text-white rounded-xl disabled:opacity-40 transition-colors shrink-0"
                >
                  {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-700 mt-1.5 text-right">Enter: 전송 · Shift+Enter: 줄바꿈</p>
            </div>
          </div>

          {/* 우측: 코드 테이블 (60%) */}
          <div className={`${mobileTab === 'chat' ? 'hidden' : 'flex'} md:flex flex-col flex-1 overflow-hidden`}>
            {/* 검색바 */}
            <div className="px-4 py-3 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
                  <input
                    type="text"
                    placeholder="저울번호·POS코드·품목명 검색..."
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500"
                  />
                  {filter && (
                    <button onClick={() => setFilter('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <span className="text-xs text-slate-600 shrink-0">
                  {filteredItems.length}/{totalCount}
                </span>
              </div>
            </div>

            {/* 테이블 */}
            <div className="flex-1 overflow-auto p-4">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <RefreshCw className="w-6 h-6 text-slate-600 animate-spin" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* POS 코드 구조 안내 + 수동 등록 */}
                  <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 space-y-3">
                    <p className="text-slate-400 text-xs leading-relaxed">{POS_BARCODE_STRUCTURE_HINT}</p>
                    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-1">POS 6자리 코드</label>
                        <input
                          value={manualPos}
                          onChange={e => setManualPos(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="예: 201036"
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-teal-200 focus:outline-none focus:border-teal-500/50"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-1">품목명</label>
                        <input
                          value={manualName}
                          onChange={e => setManualName(e.target.value)}
                          placeholder="예: 한돈 삼겹살"
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500/50"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={registerManualCode}
                        disabled={manualSaving || !manualBreakdown || !manualName.trim()}
                        className="sm:mt-5 flex items-center justify-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-600 disabled:opacity-40 text-white rounded-lg text-sm"
                      >
                        {manualSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        등록
                      </button>
                    </div>
                    {manualBreakdown && (
                      <PosBarCodeBreakdownView barCode={manualPos} />
                    )}
                  </div>

                  {pending.length > 0 && (
                    <div className="rounded-xl border border-amber-700/50 bg-amber-950/40 p-3">
                      <p className="text-amber-200 text-sm font-semibold mb-2">
                        확인 대기 — 저울번호(뒤3자리) 중복 {pending.length}그룹 · {pendingCount}건
                      </p>
                      <p className="text-amber-200/70 text-xs mb-3">
                        뒤3자리(저울번호)만 같을 때 발생합니다. <strong className="text-amber-100">앞3자리·3번째 자리(7자리 기준 4번째)</strong>를 비교하세요.
                      </p>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {pending.map(g => (
                          <div key={g.scaleCode3} className="text-xs bg-slate-900/60 rounded-lg px-2 py-2">
                            <span className="text-amber-300 font-mono font-bold">저울 {g.scaleCode3}</span>
                            <ul className="mt-1 space-y-0.5 text-slate-300">
                              {g.items.map(it => (
                                <li key={it.posBarCode} className="space-y-1">
                                  <div>
                                    <span className="font-mono text-teal-400/90">{it.posBarCode}</span>
                                    {' '}
                                    {it.name}
                                  </div>
                                  <PosBarCodeBreakdownView barCode={it.posBarCode} compact />
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {CATEGORY_ORDER.filter(c => (grouped[c] || []).length > 0).map(cat => (
                    <div key={cat}>
                      {/* 카테고리 헤더 */}
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-t-xl text-xs font-bold ${CATEGORY_HEADER_COLOR[cat]}`}>
                        <span>{cat}</span>
                        <span className="font-normal opacity-60">({(grouped[cat] || []).length})</span>
                      </div>

                      {/* 테이블 */}
                      <div className="rounded-b-xl overflow-hidden border border-slate-800">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-slate-800/60">
                              <th className="px-3 py-1.5 text-left text-[10px] text-slate-500 w-16">저울</th>
                              <th className="px-3 py-1.5 text-left text-[10px] text-slate-500 w-24">POS 6자리</th>
                              <th className="px-3 py-1.5 text-left text-[10px] text-slate-500 w-20">계열(앞3)</th>
                              <th className="px-3 py-1.5 text-left text-[10px] text-slate-500 w-16" title="7자리(앞0) 기준 4번째 = 6자리 3번째">4·7자리</th>
                              <th className="px-3 py-1.5 text-left text-[10px] text-slate-500">품목명</th>
                              <th className="px-3 py-1.5 w-16" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {(grouped[cat] || []).map(item => (
                              <tr key={item.id}
                                className="group hover:bg-slate-800/40 transition-colors">
                                {editingId === item.id ? (
                                  <>
                                    <td className="px-3 py-1.5">
                                      <input
                                        type="number"
                                        value={editCode}
                                        onChange={e => setEditCode(e.target.value)}
                                        className="w-16 bg-slate-700 border border-teal-500 rounded px-1.5 py-0.5 text-sm text-slate-200 focus:outline-none"
                                      />
                                    </td>
                                    <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500" colSpan={2}>
                                      {item.posBarCode || '—'}
                                    </td>
                                    <td className="px-3 py-1.5 font-mono text-[10px] text-slate-500">
                                      {item.posBarCode ? (() => {
                                        const b = breakdownPosBarCode(item.posBarCode);
                                        return b ? `${b.digit4InPadded7}·${b.digit7InPadded7}` : '—';
                                      })() : '—'}
                                    </td>
                                    <td className="px-3 py-1.5">
                                      <input
                                        autoFocus
                                        type="text"
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') saveEdit(item.id);
                                          if (e.key === 'Escape') setEditingId(null);
                                        }}
                                        className="w-full bg-slate-700 border border-teal-500 rounded px-1.5 py-0.5 text-sm text-slate-200 focus:outline-none"
                                      />
                                    </td>
                                    <td className="px-3 py-1.5">
                                      <div className="flex gap-1">
                                        <button onClick={() => saveEdit(item.id)}
                                          className="p-1 text-teal-400 hover:text-teal-300">
                                          <Check className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => setEditingId(null)}
                                          className="p-1 text-slate-500 hover:text-slate-300">
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="px-3 py-2 font-mono font-bold text-sm text-teal-300">
                                      {item.scaleCode3 || String(item.code).padStart(3, '0')}
                                    </td>
                                    <td className="px-3 py-2 font-mono text-[11px] text-slate-400">
                                      {item.posBarCode ? (
                                        <span>
                                          <span className="text-blue-300/80">{item.prefix3 || item.posBarCode.slice(0, 3)}</span>
                                          <span className="text-teal-300/90">{item.scaleCode3 || item.posBarCode.slice(-3)}</span>
                                        </span>
                                      ) : '—'}
                                    </td>
                                    <td className="px-3 py-1.5 text-[10px] text-slate-400">
                                      {item.prefix3 ? (
                                        <span title={labelPrefix3(item.prefix3)}>
                                          {item.prefix3}
                                          <span className="block text-[9px] text-slate-600">{labelPrefix3(item.prefix3)}</span>
                                        </span>
                                      ) : '—'}
                                    </td>
                                    <td className="px-3 py-1.5 font-mono text-[10px]">
                                      {item.posBarCode ? (() => {
                                        const b = breakdownPosBarCode(item.posBarCode);
                                        if (!b) return '—';
                                        return (
                                          <span className="text-amber-300/90" title="4번째=계열구분 · 7번째=저울 끝자리">
                                            {b.digit4InPadded7}·{b.digit7InPadded7}
                                          </span>
                                        );
                                      })() : '—'}
                                    </td>
                                    <td
                                      className="px-3 py-2 text-sm text-slate-200 cursor-pointer"
                                      onDoubleClick={() => startEdit(item)}
                                    >
                                      {item.name}
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => startEdit(item)}
                                          className="p-1 text-slate-500 hover:text-teal-400">
                                          <Pencil className="w-3 h-3" />
                                        </button>
                                        <button onClick={() => deleteItem(item.id, item.name)}
                                          className="p-1 text-slate-500 hover:text-red-400">
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </td>
                                  </>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}

                  {filteredItems.length === 0 && !loading && (
                    <div className="text-center py-16 text-slate-600">
                      <Scale className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      {filter ? `'${filter}' 검색 결과가 없습니다` : '등록된 코드가 없습니다'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 출력 미리보기 모달 */}
      {showPreview && (
        <PrintPreviewModal
          items={items}
          storeName={storeName}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium print:hidden ${
          toast.ok ? 'bg-teal-600 text-white' : 'bg-red-700 text-white'
        }`}>
          {toast.ok ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* 인쇄 전용: 출력 미리보기 없이 직접 print() 시 */}
      <div className="hidden print:block" id="print-direct">
        <div style={{ fontFamily: "'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif", padding: '10mm' }}>
          <div style={{ textAlign: 'center', marginBottom: '6mm' }}>
            <h1 style={{ fontSize: '18pt', fontWeight: 'bold', margin: 0 }}>{storeName}</h1>
            <h2 style={{ fontSize: '14pt', margin: '2mm 0' }}>저울 코드표</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4mm' }}>
            {CATEGORY_ORDER.filter(c => (grouped[c] || []).length > 0).map(cat => (
              <div key={cat}>
                <div style={{ fontWeight: 'bold', textAlign: 'center', padding: '2mm', background: '#f1f5f9', border: '1px solid #ccc' }}>
                  {cat}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ border: '1px solid #ccc', padding: '1.5mm 2mm', textAlign: 'center', width: '18mm' }}>코드</th>
                      <th style={{ border: '1px solid #ccc', padding: '1.5mm 2mm', textAlign: 'left' }}>품목명</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(grouped[cat] || []).map((item, i) => (
                      <tr key={item.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                        <td style={{ border: '1px solid #ccc', padding: '1.5mm 2mm', textAlign: 'center', fontFamily: 'monospace', fontWeight: 'bold' }}>{item.code}</td>
                        <td style={{ border: '1px solid #ccc', padding: '1.5mm 2mm' }}>{item.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'right', fontSize: '7pt', color: '#999', marginTop: '4mm' }}>
            출력일: {new Date().toLocaleDateString('ko-KR')}
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body > * { display: none !important; }
          #print-direct { display: block !important; }
          @page { margin: 10mm; size: A4; }
        }
      ` }} />
    </>
  );
}

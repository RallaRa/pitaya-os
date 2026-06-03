'use client';

import dynamic from 'next/dynamic';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import {
  ShoppingCart, Save, Loader2, CheckCircle, AlertCircle, Plus, X,
  Search, Beef, Bot, ChevronLeft, ChevronRight, GripVertical,
  FileSpreadsheet, MessageSquare,
} from 'lucide-react';
import type { Invoice, InvoiceGroup, AttachedFile } from '@/components/purchases/PurchaseSheet';

const PurchaseAIChat = dynamic(() => import('@/components/purchases/PurchaseAIChat'), { ssr: false });
const PurchaseSheet = dynamic(() => import('@/components/purchases/PurchaseSheet'), { ssr: false });
const PurchaseAnalysisHistory = dynamic(
  () => import('@/components/purchases/PurchaseAnalysisHistory'),
  { ssr: false },
);

function genId() {
  return `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

const EMPTY_INVOICE: Invoice = {
  purchaseDate: '',
  supplierName: '',
  invoiceNumber: '',
  items: [],
  supplyAmount: 0,
  taxAmount: 0,
  totalAmount: 0,
  paymentMethod: '',
  memo: '',
};

interface TraceInfo {
  found: boolean;
  cattleType?: string;
  origin?: string;
  qgrade?: string;
  ygrade?: string;
  slaughterDate?: string;
  farmName?: string;
  weight?: string;
  message?: string;
}

export default function PurchaseInputPage() {
  const { user } = useAuth();
  const { currentStore } = useStore();

  const [groups, setGroups] = useState<InvoiceGroup[]>([]);
  const [savingGroupIds, setSavingGroupIds] = useState<Set<string>>(new Set());
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [error, setError] = useState('');

  // 이력번호 조회
  const [traceOpen, setTraceOpen] = useState(false);
  const [traceNo, setTraceNo] = useState('');
  const [traceInfo, setTraceInfo] = useState<TraceInfo | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceError, setTraceError] = useState('');
  const [historyRefresh, setHistoryRefresh] = useState(0);

  // 레이아웃: 좌측 히스토리 / 우측 AI 패널
  const [historyOpen, setHistoryOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(true);
  const [aiWidth, setAiWidth] = useState(280);
  /** 모바일: 시트 vs AI 분석 (데스크탑은 우측 패널) */
  const [mobileTab, setMobileTab] = useState<'sheet' | 'ai'>('sheet');
  const resizingRef = useRef(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const next = window.innerWidth - e.clientX;
      setAiWidth(Math.min(480, Math.max(220, next)));
    };
    const onUp = () => {
      resizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const startAiResize = () => {
    resizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleInvoicesFound = useCallback((invoices: Invoice[], files: AttachedFile[]) => {
    const newGroups: InvoiceGroup[] = invoices.map(inv => {
      const { _originalAiResult, _conflicts, ...clean } = inv;
      return {
        id: genId(),
        invoice: clean,
        originalAiResult: _originalAiResult || JSON.parse(JSON.stringify(clean)),
        isSaved: false,
        isExpanded: true,
        attachedFiles: files.length > 0 ? files : undefined,
      };
    });
    setGroups(prev => [...prev, ...newGroups]);
  }, []);

  const saveGroup = useCallback(async (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group || !user?.uid || !currentStore?.storeId) return;

    setSavingGroupIds(prev => new Set(prev).add(groupId));
    setError('');
    try {
      // 이미지 파일만 추출 (PDF 포함)
      const imagesToUpload = (group.attachedFiles || [])
        .filter(f => f.type === 'image' || f.type === 'pdf')
        .map(f => ({ name: f.name, content: f.content }));

      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({
          action: 'save',
          extractedData: group.invoice,
          uid: user.uid,
          storeId: currentStore.storeId,
          images: imagesToUpload.length > 0 ? imagesToUpload : undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '저장 실패');

      if (group.originalAiResult && group.invoice.supplierName) {
        fetch('/api/purchases/save-correction', {
          method: 'POST',
          headers: await getAuthJsonHeaders(),
          body: JSON.stringify({
            storeId: currentStore.storeId,
            supplierName: group.invoice.supplierName,
            originalResult: group.originalAiResult,
            correctedResult: group.invoice,
          }),
        }).catch(() => {});
      }

      setGroups(prev => prev.map(g =>
        g.id === groupId
          ? { ...g, isSaved: true, savedImageUrls: data.imageUrls || [] }
          : g
      ));
      setSavedCount(c => c + 1);
    } catch (e: any) {
      setError(e.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setSavingGroupIds(prev => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
    }
  }, [groups, user?.uid, currentStore?.storeId]);

  const saveAll = useCallback(async () => {
    const unsaved = groups.filter(g => !g.isSaved);
    if (!unsaved.length || isSavingAll) return;
    setIsSavingAll(true);
    for (const g of unsaved) {
      await saveGroup(g.id);
    }
    setIsSavingAll(false);
  }, [groups, isSavingAll, saveGroup]);

  const addBlankGroup = () => {
    setGroups(prev => [
      ...prev,
      {
        id: genId(),
        invoice: { ...EMPTY_INVOICE, purchaseDate: new Date().toISOString().slice(0, 10) },
        isSaved: false,
        isExpanded: true,
      },
    ]);
  };

  const handleTraceSearch = async () => {
    const no = traceNo.replace(/\D/g, '');
    if (no.length < 12) { setTraceError('이력번호 12자리를 입력해주세요.'); return; }
    setTraceLoading(true);
    setTraceError('');
    setTraceInfo(null);
    try {
      const res = await fetch(`/api/external/meat-history?traceNo=${no}`);
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setTraceInfo(d);
    } catch (e: any) {
      setTraceError(e.message || '조회 실패');
    } finally {
      setTraceLoading(false);
    }
  };

  const unsavedCount = groups.filter(g => !g.isSaved).length;

  return (
    <div className="flex flex-1 min-h-0 h-full bg-slate-950 text-slate-100 overflow-hidden">

      {/* ── 좌측 분석 히스토리 (축소) ── */}
      {historyOpen ? (
        <div className="hidden lg:flex flex-col w-44 shrink-0 h-full relative">
          <button
            type="button"
            onClick={() => setHistoryOpen(false)}
            className="absolute -right-2 top-1/2 -translate-y-1/2 z-10 w-4 h-8 bg-slate-800 border border-slate-700 rounded-r-md flex items-center justify-center text-slate-500 hover:text-teal-400 hover:bg-slate-700 transition-colors"
            title="히스토리 접기"
          >
            <ChevronLeft className="w-3 h-3" />
          </button>
          <PurchaseAnalysisHistory
            storeId={currentStore?.storeId || ''}
            refreshKey={historyRefresh}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="hidden lg:flex flex-col items-center justify-center w-7 shrink-0 h-full bg-slate-900 border-r border-slate-800 text-slate-500 hover:text-teal-400 hover:bg-slate-800/80 transition-colors"
          title="분석 히스토리 펼치기"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}

      {/* ── 중앙 시트 영역 ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* 모바일 탭: 시트 / AI 분석 */}
        <div className="md:hidden flex border-b border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => setMobileTab('sheet')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
              mobileTab === 'sheet'
                ? 'text-teal-400 border-b-2 border-teal-400'
                : 'text-slate-500'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            매입 시트
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('ai')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
              mobileTab === 'ai'
                ? 'text-teal-400 border-b-2 border-teal-400'
                : 'text-slate-500'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            AI 분석
          </button>
        </div>

        {/* 헤더 툴바 */}
        <div className={`flex items-center gap-2 px-3 py-2 border-b border-slate-800/60 bg-slate-900/60 shrink-0 ${
          mobileTab === 'ai' ? 'hidden md:flex' : ''
        }`}>
          <ShoppingCart className="w-3.5 h-3.5 text-teal-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-xs font-bold text-slate-100 leading-tight">AI 매입관리</h1>
            {currentStore?.storeName && (
              <p className="text-[9px] text-slate-500 truncate">{currentStore.storeName}</p>
            )}
          </div>

          {/* 이력번호 조회 토글 */}
          <button
            onClick={() => { setTraceOpen(o => !o); setTraceInfo(null); setTraceError(''); }}
            className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg transition-colors ${
              traceOpen
                ? 'bg-amber-900/30 text-amber-300'
                : 'text-amber-500 hover:text-amber-300 hover:bg-amber-900/20'
            }`}
          >
            <Beef className="w-3.5 h-3.5" />
            이력조회
          </button>

          {/* 직접 추가 버튼 */}
          <button
            onClick={addBlankGroup}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            직접 추가
          </button>

          {/* 전체 저장 버튼 */}
          {unsavedCount > 0 && (
            <button
              onClick={saveAll}
              disabled={isSavingAll}
              className="flex items-center gap-1 text-[10px] font-semibold text-black bg-teal-400 hover:bg-teal-300 disabled:opacity-60 px-2 py-1 rounded-lg transition-colors whitespace-nowrap"
            >
              {isSavingAll
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Save className="w-3.5 h-3.5" />}
              전체 저장 ({unsavedCount})
            </button>
          )}
        </div>

        {/* 이력번호 조회 패널 */}
        {traceOpen && (
          <div className={mobileTab === 'ai' ? 'hidden md:block' : ''}>
          <div className="px-5 py-3 border-b border-amber-900/30 bg-amber-950/20 shrink-0">
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={traceNo}
                onChange={e => setTraceNo(e.target.value.replace(/\D/g, '').slice(0, 15))}
                onKeyDown={e => e.key === 'Enter' && handleTraceSearch()}
                placeholder="이력번호 12자리"
                className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50"
              />
              <button
                onClick={handleTraceSearch}
                disabled={traceLoading || traceNo.replace(/\D/g, '').length < 12}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-700 hover:bg-amber-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-xs transition-colors"
              >
                {traceLoading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Search className="w-3.5 h-3.5" />}
                조회
              </button>
              <button
                onClick={() => { setTraceOpen(false); setTraceInfo(null); setTraceError(''); }}
                className="text-slate-500 hover:text-slate-300 p-1 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {traceError && (
              <p className="text-red-400 text-xs mt-1.5">{traceError}</p>
            )}

            {traceInfo && (
              traceInfo.found ? (
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-xs">
                  {([
                    ['축종', traceInfo.cattleType],
                    ['원산지', traceInfo.origin],
                    ['육질등급', traceInfo.qgrade],
                    ['도축일', traceInfo.slaughterDate],
                    ['농장명', traceInfo.farmName],
                    ['도체중', traceInfo.weight ? `${traceInfo.weight}kg` : undefined],
                  ] as [string, string | undefined][]).filter(([, v]) => v).map(([l, v]) => (
                    <div key={l}>
                      <span className="text-slate-500">{l}: </span>
                      <span className="text-slate-200">{v}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-xs mt-1.5">{traceInfo.message || '조회된 이력이 없습니다.'}</p>
              )
            )}
          </div>
          </div>
        )}

        {/* 알림 영역 */}
        <div className={mobileTab === 'ai' ? 'hidden md:block' : ''}>
        {(error || savedCount > 0) && (
          <div className="px-5 py-2 space-y-1 shrink-0">
            {error && (
              <div className="flex items-center gap-2 bg-red-900/20 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-300">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1">{error}</span>
                <button onClick={() => setError('')} className="text-slate-500 hover:text-slate-300">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {savedCount > 0 && !error && (
              <div className="flex items-center gap-2 bg-teal-900/20 border border-teal-500/30 rounded-lg px-3 py-2 text-xs text-teal-300">
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                {savedCount}건 저장 완료
                <button onClick={() => setSavedCount(0)} className="ml-auto text-slate-500 hover:text-slate-300">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
        </div>

        {/* 시트 영역 */}
        <div className={`flex-1 overflow-y-auto px-3 py-3 min-h-0 ${
          mobileTab === 'ai' ? 'hidden md:block' : ''
        }`}>
          <PurchaseSheet
            groups={groups}
            onGroupsChange={setGroups}
            onSaveGroup={saveGroup}
            savingGroupIds={savingGroupIds}
            storeId={currentStore?.storeId}
          />
        </div>

        {/* 모바일: AI 분석 전체 화면 */}
        {mobileTab === 'ai' && (
          <div className="flex md:hidden flex-1 flex-col min-h-0 overflow-hidden border-t border-slate-800/60">
            <PurchaseAIChat
              storeId={currentStore?.storeId || ''}
              onInvoicesFound={(invoices, files) => {
                handleInvoicesFound(invoices, files);
                setMobileTab('sheet');
              }}
              onAnalysisLogged={() => setHistoryRefresh(k => k + 1)}
            />
          </div>
        )}
      </div>

      {/* ── 우측 AI 채팅 패널 (접기 + 너비 조절) ── */}
      {aiOpen ? (
        <div
          className="hidden md:flex shrink-0 h-full relative"
          style={{ width: aiWidth }}
        >
          {/* 리사이즈 핸들 */}
          <div
            role="separator"
            aria-orientation="vertical"
            onMouseDown={startAiResize}
            className="absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 z-20 cursor-col-resize group flex items-center justify-center hover:bg-teal-500/20 transition-colors"
            title="드래그하여 너비 조절"
          >
            <GripVertical className="w-3 h-3 text-slate-600 group-hover:text-teal-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <button
            type="button"
            onClick={() => setAiOpen(false)}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full z-10 w-4 h-8 bg-slate-800 border border-slate-700 rounded-l-md flex items-center justify-center text-slate-500 hover:text-teal-400 hover:bg-slate-700 transition-colors"
            title="AI 패널 접기"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
          <div className="flex flex-col w-full h-full min-w-0">
            <PurchaseAIChat
              storeId={currentStore?.storeId || ''}
              onInvoicesFound={handleInvoicesFound}
              onAnalysisLogged={() => setHistoryRefresh(k => k + 1)}
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAiOpen(true)}
          className="hidden md:flex flex-col items-center justify-center w-8 shrink-0 h-full bg-slate-900 border-l border-slate-800 text-slate-500 hover:text-teal-400 hover:bg-slate-800/80 transition-colors gap-1.5"
          title="AI 패널 펼치기"
        >
          <Bot className="w-4 h-4" />
          <span className="text-[9px] writing-mode-vertical" style={{ writingMode: 'vertical-rl' }}>AI</span>
        </button>
      )}

    </div>
  );
}

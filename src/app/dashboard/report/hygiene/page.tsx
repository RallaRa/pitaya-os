'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle, Eye, Save } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { useAuth } from '@/context/AuthContext';
import { HYGIENE_SECTIONS } from '@/lib/hygieneChecklist';

interface CheckItemState {
  evaluation: '적정' | '부적정' | null;
  notes: string;
}

// useSearchParams 사용하는 실제 컴포넌트
function HygieneChecklistContent() {
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');

  const { currentStore } = useStore();
  const { user } = useAuth();

  const [inspectorName, setInspectorName]   = useState('');
  const [checkDate, setCheckDate]           = useState(dateParam || new Date().toISOString().slice(0, 10));
  const [checklistState, setChecklistState] = useState<Record<string, Record<number, CheckItemState>>>({});
  const [savedSections, setSavedSections]   = useState<Set<number>>(new Set());
  const [isSavingDraft, setIsSavingDraft]   = useState(false);
  const [isSavingFinal, setIsSavingFinal]   = useState(false);
  const [loadInfo, setLoadInfo]             = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 로그인 유저 이름 자동 입력
  useEffect(() => {
    if (user?.displayName) setInspectorName(user.displayName);
  }, [user]);

  // API 데이터로 체크리스트 상태 복원
  const restoreFromRecord = useCallback((record: any) => {
    if (!record?.items) return;
    const newState: Record<string, Record<number, CheckItemState>> = {};
    HYGIENE_SECTIONS.forEach((section, si) => {
      section.items.forEach((_, ii) => {
        const cell = record.items[`${si}_${ii}`];
        if (!cell) return;
        if (!newState[section.category]) newState[section.category] = {};
        newState[section.category][ii] = {
          evaluation: cell.result === 'pass' ? '적정' : cell.result === 'fail' ? '부적정' : null,
          notes: cell.note || '',
        };
      });
    });
    setChecklistState(newState);
    if (record.inspectorName) setInspectorName(record.inspectorName);
    if (Array.isArray(record.savedSections)) {
      setSavedSections(new Set(record.savedSections as number[]));
    }
  }, []);

  // 페이지 진입 시 해당 날짜 draft 불러오기
  useEffect(() => {
    if (!currentStore?.storeId) return;
    const targetDate = dateParam || new Date().toISOString().slice(0, 10);
    fetch(`/api/hygiene?storeId=${currentStore.storeId}&date=${targetDate}`)
      .then(r => r.json())
      .then(data => {
        if (data.record) {
          restoreFromRecord(data.record);
          const label = data.record.saveType === 'draft' ? '이전 중간저장 데이터를 불러왔습니다.' : '저장된 최종 데이터를 불러왔습니다.';
          setLoadInfo(label);
          setTimeout(() => setLoadInfo(null), 4000);
        }
      })
      .catch(() => {});
  }, [currentStore?.storeId, dateParam, restoreFromRecord]);

  const handleStateChange = (
    category: string, itemIndex: number,
    field: keyof CheckItemState, value: string,
  ) => {
    setChecklistState(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [itemIndex]: {
          ...(prev[category]?.[itemIndex] || { evaluation: null, notes: '' }),
          [field]: value,
        },
      },
    }));
  };

  // items 변환 + 집계
  const buildPayload = () => {
    const itemsData: Record<string, { result: 'pass' | 'fail' | null; note: string }> = {};
    let totalItems = 0;
    let passedItems = 0;
    let unchecked = 0;

    HYGIENE_SECTIONS.forEach((section, si) => {
      section.items.forEach((_, ii) => {
        const state = checklistState[section.category]?.[ii];
        const result = state?.evaluation === '적정' ? 'pass'
          : state?.evaluation === '부적정' ? 'fail'
          : null;
        itemsData[`${si}_${ii}`] = { result, note: state?.notes || '' };
        totalItems++;
        if (result === 'pass') passedItems++;
        if (result === null) unchecked++;
      });
    });

    return { itemsData, totalItems, passedItems, unchecked };
  };

  const doSave = async (saveType: 'draft' | 'final', sectionsMark?: number[]) => {
    if (!currentStore?.storeId || !user?.uid) {
      showToast('매장 또는 로그인 정보가 없습니다.', 'error');
      return false;
    }
    const { itemsData, totalItems, passedItems } = buildPayload();
    const nextSections = sectionsMark ?? [...savedSections];

    const res = await fetch('/api/hygiene', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: currentStore.storeId,
        uid: user.uid,
        inspectorName,
        checkDate,
        items: itemsData,
        totalItems,
        passedItems,
        saveType,
        savedSections: nextSections,
      }),
    });
    return res.ok;
  };

  const handleDraftSave = async () => {
    setIsSavingDraft(true);
    try {
      const allSections = HYGIENE_SECTIONS.map((_, i) => i);
      const ok = await doSave('draft', allSections);
      if (ok) {
        setSavedSections(new Set(allSections));
        showToast('중간저장 완료', 'success');
      } else {
        showToast('저장에 실패했습니다.', 'error');
      }
    } catch {
      showToast('네트워크 오류가 발생했습니다.', 'error');
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleFinalSave = async () => {
    const { unchecked } = buildPayload();
    if (unchecked > 0) {
      const confirmed = window.confirm(`미체크 항목이 ${unchecked}개 있습니다. 저장하시겠습니까?`);
      if (!confirmed) return;
    }
    setIsSavingFinal(true);
    try {
      const ok = await doSave('final');
      if (ok) {
        showToast('최종저장 완료', 'success');
      } else {
        showToast('저장에 실패했습니다.', 'error');
      }
    } catch {
      showToast('네트워크 오류가 발생했습니다.', 'error');
    } finally {
      setIsSavingFinal(false);
    }
  };

  const handleSectionSave = async (si: number) => {
    const nextSections = [...savedSections, si];
    try {
      const ok = await doSave('draft', nextSections);
      if (ok) {
        setSavedSections(new Set(nextSections));
        showToast(`${HYGIENE_SECTIONS[si].category} 저장 완료`, 'success');
      } else {
        showToast('저장에 실패했습니다.', 'error');
      }
    } catch {
      showToast('네트워크 오류가 발생했습니다.', 'error');
    }
  };

  const isBusy = isSavingDraft || isSavingFinal;

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-4 md:p-6">

      {/* 토스트 */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-teal-500 text-slate-950' : 'bg-red-500 text-white'
        }`}>
          {toast.type === 'success' && <CheckCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* 중간저장 불러오기 안내 */}
      {loadInfo && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-4 py-2 rounded-xl shadow-lg text-sm font-medium">
          📂 {loadInfo}
        </div>
      )}

      {/* 헤더 */}
      <div className="mb-6">
        <div className="flex items-start justify-between mb-4">
          <h1 className="text-2xl md:text-3xl font-bold text-teal-400">
            축산물 판매업소<br className="md:hidden" /> 위생관리 점검일지
          </h1>
          <Link
            href="/dashboard/report/hygiene/view"
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-teal-400 transition-colors shrink-0 mt-1"
          >
            <Eye className="w-4 h-4" />
            조회
          </Link>
        </div>
        <div className="flex flex-wrap justify-end items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <label htmlFor="checkDate" className="font-semibold text-slate-400">점검일</label>
            <input
              type="date"
              id="checkDate"
              value={checkDate}
              onChange={e => setCheckDate(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-slate-100 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="inspector" className="font-semibold text-slate-400">점검자</label>
            <input
              type="text"
              id="inspector"
              value={inspectorName}
              onChange={e => setInspectorName(e.target.value)}
              placeholder="이름을 입력하세요"
              className="bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 text-slate-100 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all placeholder:text-slate-500"
            />
          </div>
        </div>
      </div>

      {/* 체크리스트 */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-6">
        {HYGIENE_SECTIONS.map((section, si) => {
          const isSectionSaved = savedSections.has(si);
          return (
            <div key={si} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              {/* 섹션 헤더 */}
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-700">
                <h2 className="text-lg font-bold text-teal-300/90 flex items-center gap-2">
                  {isSectionSaved && <span className="text-teal-400 text-base">✅</span>}
                  {section.category}
                </h2>
                <button
                  onClick={() => handleSectionSave(si)}
                  disabled={isBusy}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-teal-400 disabled:opacity-40 transition-colors px-2 py-1 rounded-md hover:bg-slate-800"
                >
                  <Save className="w-3 h-3" />
                  이 섹션 저장
                </button>
              </div>

              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-400 uppercase bg-slate-800/50">
                  <tr>
                    <th className="px-4 py-3 rounded-l-lg w-3/5">점검항목</th>
                    <th className="px-4 py-3 text-center">평가</th>
                    <th className="px-4 py-3 rounded-r-lg">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item, ii) => {
                    const state = checklistState[section.category]?.[ii];
                    return (
                      <tr key={ii} className={`border-b border-slate-800 hover:bg-slate-800/30 ${
                        state?.evaluation === '부적정' ? 'bg-red-900/10' : ''
                      }`}>
                        <td className="px-4 py-3 font-medium text-slate-300 leading-relaxed">{item}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-4 whitespace-nowrap">
                            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                              <input
                                type="radio"
                                name={`${si}-${ii}`}
                                checked={state?.evaluation === '적정'}
                                onChange={() => handleStateChange(section.category, ii, 'evaluation', '적정')}
                                className="w-4 h-4 accent-teal-500"
                              />
                              적정
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                              <input
                                type="radio"
                                name={`${si}-${ii}`}
                                checked={state?.evaluation === '부적정'}
                                onChange={() => handleStateChange(section.category, ii, 'evaluation', '부적정')}
                                className="w-4 h-4 accent-yellow-500"
                              />
                              부적정
                            </label>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={state?.notes || ''}
                            onChange={e => handleStateChange(section.category, ii, 'notes', e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {/* 하단 버튼 영역 */}
      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={handleDraftSave}
          disabled={isBusy}
          className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 px-6 py-3 rounded-lg font-semibold transition-colors"
        >
          {isSavingDraft && <Loader2 className="w-4 h-4 animate-spin" />}
          중간저장
        </button>
        <button
          onClick={handleFinalSave}
          disabled={isBusy}
          className="flex items-center gap-2 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-slate-950 px-6 py-3 rounded-lg font-bold transition-colors"
        >
          {isSavingFinal && <Loader2 className="w-4 h-4 animate-spin" />}
          최종저장
        </button>
      </div>
    </div>
  );
}

// useSearchParams는 Suspense 경계 안에서 사용해야 함
export default function HygieneChecklistPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
      </div>
    }>
      <HygieneChecklistContent />
    </Suspense>
  );
}

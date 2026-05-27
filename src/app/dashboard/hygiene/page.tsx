'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle, Eye, Save } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { useAuth } from '@/context/AuthContext';
import { HYGIENE_SECTIONS, TOTAL_ITEMS } from '@/lib/hygieneChecklist';
import { db } from '@/lib/firebase/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// 섹션 표시키 → HYGIENE_SECTIONS category 매핑
const SECTION_CATEGORY: Record<string, string> = {
  작업전:   '위생상태(작업전)',
  중간점검: '위생상태(작업중)',
  마감점검: '위생상태(작업후)',
};

interface CheckItemState {
  evaluation: '적정' | '부적정' | null;
  notes: string;
}

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

  // 섹션 자동 체크 (클라이언트 → Firestore 직접 업데이트)
  const autoCheckSection = useCallback(async (
    sectionKey: string,
    isAuto: boolean,
  ) => {
    if (!currentStore?.storeId) return;
    const kstToday = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const category = SECTION_CATEGORY[sectionKey];
    if (!category) return;
    const section = HYGIENE_SECTIONS.find(s => s.category === category);
    if (!section) return;

    const byName = isAuto ? '자동완성' : (user?.displayName || user?.email || '');
    const ts     = serverTimestamp();

    const updates: Record<string, unknown> = {
      [`sections.${sectionKey}.completed`]:   true,
      [`sections.${sectionKey}.completedBy`]: byName,
      [`sections.${sectionKey}.completedAt`]: ts,
      [`autoChecks.${sectionKey}`]: { auto: isAuto, at: ts },
      updatedAt: ts,
    };
    section.items.forEach((_, idx) => {
      updates[`sections.${sectionKey}.items.${idx}.checked`]   = true;
      updates[`sections.${sectionKey}.items.${idx}.checkedBy`] = byName;
      updates[`sections.${sectionKey}.items.${idx}.checkedAt`] = ts;
    });

    const docRef = doc(db, 'hygiene_checklists', `${currentStore.storeId}_${kstToday}`);
    await setDoc(docRef, updates, { merge: true });

    // 로컬 UI 상태도 적정으로 업데이트
    setChecklistState(prev => {
      const next = { ...prev };
      const catState = { ...(next[category] || {}) };
      section.items.forEach((_, ii) => {
        catState[ii] = { ...(catState[ii] || { evaluation: null, notes: '' }), evaluation: '적정' };
      });
      next[category] = catState;
      return next;
    });
  }, [currentStore?.storeId, user]);

  // 페이지 진입 시 KST 11시 이후이면 작업전 자동 체크
  useEffect(() => {
    const handleEntry = async () => {
      if (!currentStore?.storeId || !user?.uid) return;
      const kstNow   = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const kstHour  = kstNow.getUTCHours();
      const kstToday = kstNow.toISOString().slice(0, 10);
      if (kstHour < 11) return;

      const docRef = doc(db, 'hygiene_checklists', `${currentStore.storeId}_${kstToday}`);
      const snap   = await getDoc(docRef);
      const data   = snap.data();

      if (data?.sections?.작업전?.completed || data?.notifications?.morning === false) return;

      await autoCheckSection('작업전', false);

      await setDoc(docRef, {
        notifications:   { morning: false },
        lastEntryUser:   user.uid,
        lastEntryName:   user.displayName || user.email || '',
        lastEntryAt:     serverTimestamp(),
      }, { merge: true });
    };
    handleEntry().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStore?.storeId, user?.uid]);

  useEffect(() => {
    if (user?.displayName) setInspectorName(user.displayName);
  }, [user]);

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

  // [수정 1] 토글 핸들러
  const handleToggle = (category: string, itemIndex: number, value: '적정' | '부적정') => {
    setChecklistState(prev => {
      const current = prev[category]?.[itemIndex]?.evaluation;
      return {
        ...prev,
        [category]: {
          ...prev[category],
          [itemIndex]: {
            ...(prev[category]?.[itemIndex] || { evaluation: null, notes: '' }),
            evaluation: current === value ? null : value,
          },
        },
      };
    });
  };

  const handleNoteChange = (category: string, itemIndex: number, notes: string) => {
    setChecklistState(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [itemIndex]: {
          ...(prev[category]?.[itemIndex] || { evaluation: null, notes: '' }),
          notes,
        },
      },
    }));
  };

  // [수정 2] 섹션별 전체 적정 / 전체 해제
  const handleSectionAllPass = (si: number) => {
    const section = HYGIENE_SECTIONS[si];
    setChecklistState(prev => {
      const catState = { ...prev[section.category] };
      section.items.forEach((_, ii) => {
        catState[ii] = { ...(prev[section.category]?.[ii] || { evaluation: null, notes: '' }), evaluation: '적정' };
      });
      return { ...prev, [section.category]: catState };
    });
  };

  const handleSectionClear = (si: number) => {
    const section = HYGIENE_SECTIONS[si];
    setChecklistState(prev => {
      const catState = { ...prev[section.category] };
      section.items.forEach((_, ii) => {
        catState[ii] = { ...(prev[section.category]?.[ii] || { evaluation: null, notes: '' }), evaluation: null };
      });
      return { ...prev, [section.category]: catState };
    });
  };

  // [수정 3] 전체 페이지 전체 적정 / 전체 해제
  const handleAllPass = () => {
    setChecklistState(prev => {
      const next = { ...prev };
      HYGIENE_SECTIONS.forEach((section, si) => {
        const catState = { ...next[section.category] };
        section.items.forEach((_, ii) => {
          catState[ii] = { ...(prev[section.category]?.[ii] || { evaluation: null, notes: '' }), evaluation: '적정' };
        });
        next[section.category] = catState;
      });
      return next;
    });
  };

  const handleAllClear = () => {
    setChecklistState(prev => {
      const next = { ...prev };
      HYGIENE_SECTIONS.forEach((section) => {
        const catState = { ...next[section.category] };
        section.category && Object.keys(catState).forEach(k => {
          catState[Number(k)] = { ...(catState[Number(k)] || { evaluation: null, notes: '' }), evaluation: null };
        });
        next[section.category] = catState;
      });
      return next;
    });
  };

  // [수정 4] 실시간 진행률
  let checkedCount = 0;
  HYGIENE_SECTIONS.forEach(section => {
    section.items.forEach((_, ii) => {
      if (checklistState[section.category]?.[ii]?.evaluation != null) checkedCount++;
    });
  });
  const progressPct = TOTAL_ITEMS > 0 ? Math.round((checkedCount / TOTAL_ITEMS) * 100) : 0;

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

      {/* 불러오기 안내 */}
      {loadInfo && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-4 py-2 rounded-xl shadow-lg text-sm font-medium">
          📂 {loadInfo}
        </div>
      )}

      {/* 헤더 */}
      <div className="mb-5">
        <div className="flex items-start justify-between mb-4">
          <h1 className="text-2xl md:text-3xl font-bold text-teal-400">
            축산물 판매업소<br className="md:hidden" /> 위생관리 점검일지
          </h1>
          <Link
            href="/dashboard/hygiene/view"
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-teal-400 transition-colors shrink-0 mt-1"
          >
            <Eye className="w-4 h-4" />
            조회
          </Link>
        </div>

        {/* 점검일 / 점검자 */}
        <div className="flex flex-wrap justify-end items-center gap-4 text-sm mb-4">
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

        {/* [수정 4] 진행률 바 */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-300">진행률</span>
              {/* [수정 3] 전체 선택/해제 버튼 */}
              <button
                onClick={handleAllPass}
                className="px-2.5 py-1 rounded-md text-xs font-semibold bg-teal-500/20 text-teal-400 border border-teal-600/30 hover:bg-teal-500/30 transition-colors"
              >
                전체 적정
              </button>
              <button
                onClick={handleAllClear}
                className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-700 text-slate-400 border border-slate-600 hover:bg-slate-600 transition-colors"
              >
                전체 해제
              </button>
            </div>
            <span className="text-sm font-bold text-teal-400">{checkedCount} / {TOTAL_ITEMS}</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-2">
            <div
              className="bg-teal-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-1.5">{progressPct}% 완료</p>
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
                {/* [수정 2] 섹션 전체 적정/해제 + 섹션 저장 */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleSectionAllPass(si)}
                    className="px-2.5 py-1 rounded-md text-xs font-semibold bg-teal-500/20 text-teal-400 border border-teal-600/30 hover:bg-teal-500/30 transition-colors"
                  >
                    전체 적정
                  </button>
                  <button
                    onClick={() => handleSectionClear(si)}
                    className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-700 text-slate-400 border border-slate-600 hover:bg-slate-600 transition-colors"
                  >
                    전체 해제
                  </button>
                  <button
                    onClick={() => handleSectionSave(si)}
                    disabled={isBusy}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-teal-400 disabled:opacity-40 transition-colors px-2 py-1 rounded-md hover:bg-slate-800"
                  >
                    <Save className="w-3 h-3" />
                    저장
                  </button>
                </div>
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
                    const ev = state?.evaluation ?? null;
                    return (
                      <tr key={ii} className={`border-b border-slate-800 hover:bg-slate-800/30 ${
                        ev === '부적정' ? 'bg-red-900/10' : ''
                      }`}>
                        <td className="px-4 py-3 font-medium text-slate-300 leading-relaxed">{item}</td>
                        {/* [수정 1] 토글 버튼 */}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                            <button
                              onClick={() => handleToggle(section.category, ii, '적정')}
                              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                                ev === '적정'
                                  ? 'bg-teal-500 text-slate-950'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-teal-600 hover:text-teal-400'
                              }`}
                            >
                              적정
                            </button>
                            <button
                              onClick={() => handleToggle(section.category, ii, '부적정')}
                              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                                ev === '부적정'
                                  ? 'bg-red-500 text-white'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-red-600 hover:text-red-400'
                              }`}
                            >
                              부적정
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={state?.notes || ''}
                            onChange={e => handleNoteChange(section.category, ii, e.target.value)}
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

      {/* 하단 버튼 */}
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

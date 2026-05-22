'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, CheckCircle, Eye } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { useAuth } from '@/context/AuthContext';
import { HYGIENE_SECTIONS } from '@/lib/hygieneChecklist';

interface CheckItemState {
  evaluation: '적정' | '부적정' | null;
  notes: string;
}

export default function HygieneChecklistPage() {
  const { currentStore } = useStore();
  const { user } = useAuth();

  const [inspectorName, setInspectorName] = useState('');
  const [checkDate, setCheckDate] = useState(new Date().toISOString().slice(0, 10));
  const [checklistState, setChecklistState] = useState<Record<string, Record<number, CheckItemState>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

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

  const handleSave = async () => {
    if (!currentStore?.storeId || !user?.uid) {
      showToast('매장 또는 로그인 정보가 없습니다.', 'error');
      return;
    }

    const itemsData: Record<string, { result: 'pass' | 'fail' | null; note: string }> = {};
    let totalItems = 0;
    let passedItems = 0;

    HYGIENE_SECTIONS.forEach((section, si) => {
      section.items.forEach((_, ii) => {
        const state = checklistState[section.category]?.[ii];
        const result = state?.evaluation === '적정' ? 'pass'
          : state?.evaluation === '부적정' ? 'fail'
          : null;
        itemsData[`${si}_${ii}`] = { result, note: state?.notes || '' };
        totalItems++;
        if (result === 'pass') passedItems++;
      });
    });

    setIsSaving(true);
    try {
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
        }),
      });
      if (res.ok) {
        showToast('저장 완료되었습니다.', 'success');
      } else {
        showToast('저장에 실패했습니다.', 'error');
      }
    } catch {
      showToast('네트워크 오류가 발생했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-4 md:p-6">

      {/* 토스트 */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-fade-in ${
          toast.type === 'success' ? 'bg-teal-500 text-slate-950' : 'bg-red-500 text-white'
        }`}>
          {toast.type === 'success' && <CheckCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* 헤더 */}
      <div className="mb-8">
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
        {HYGIENE_SECTIONS.map((section, si) => (
          <div key={si} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
            <h2 className="text-lg font-bold text-teal-300/90 mb-4 pb-2 border-b border-slate-700">
              {section.category}
            </h2>
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
        ))}
      </div>

      {/* 저장 버튼 */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-slate-950 px-8 py-3 rounded-lg font-bold transition-colors"
        >
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
          {isSaving ? '저장 중...' : '점검 내용 저장'}
        </button>
      </div>
    </div>
  );
}

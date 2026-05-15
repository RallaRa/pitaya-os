'use client';

import React, { useState } from 'react';

// 점검 항목 데이터 구조 정의
const checklistSections = [
  {
    category: '개인위생(정용)',
    items: [
      '위생복, 위생모, 위생화, 장갑 등은 청결하게 관리되고 있는가?',
      '두발, 수염, 손톱 등 개인위생 상태는 잘 지켜지고 있는가?',
      '시계, 반지, 귀걸이, 머리핀 등 장신구를 착용하거나 음식물에 노출되었는가?',
      '피부병, 심한 감기 등 전염성 질병에 감염되었거나 또는 식육의 안전성에 영향을 미칠 수 있는 외상 등이 있는지 영업주 등은 확인하고 있는가?',
    ],
  },
  {
    category: '위생상태(작업전)',
    items: [
      '앞치마, 토시, 도마, 칼, 장갑, 행주 등은 청결하게 관리되고 있는가?',
      '작업대, 도마, 칼, 칼갈이 등은 깨끗한 상태인가?',
      '식육과 접촉되는 장비(슬라이스기, 분쇄기, 믹서 등), 도구 등의 표면에는 흙, 고기 찌꺼기 등이 깨끗하게 제거되어 있는가?',
      '냉장·냉동고 및 진열상자의 온도는 일정기준(냉장 10℃이하, 냉동 -18℃이하)을 유지하고 있으며, 내부는 청결하게 관리되고 있는가?',
      '작업장소는 청결하게 유지되고 있는가?',
      '화장실, 탈의실 등은 청결하게 유지되고 있는가?',
      '벽면, 천장 등은 먼지, 거미줄 등이 제거되어 청결하게 유지되고 있는가?',
      '바닥 및 배수구는 청결하게 관리되고 있으며, 물이 고여 있거나 냄새가 나지 않는가?',
      '포장재는 위생적으로 관리되고 있는가?',
      '도축검사증명서, 축산물등급판정서 등이 비치되어 있는가?',
    ],
  },
  {
    category: '위생상태(작업중)',
    items: [
        '작업 중 흡연, 음식물섭취, 껌 씹는 행위를 하지 않는가?',
        '영업장 외부 및 화장실 출입시 앞치마 및 장갑을 벗고 가는가?',
        '작업장 및 화장실 출입시 손 및 신발을 세척 또는 소독하는가?',
        '작업중 오염되지 않도록 육류와 분리하여 처리 또는 보관하는가?',
        '식육과 접촉하는 장비, 도구 등은 세척, 소독하여 위생적으로 보관하는가?',
        '식육의 신선도가 깨끗한 용기에 담는가?',
    ],
  },
  {
    category: '위생상태(작업후)',
    items: [
        '바닥은 항상 청결하게 유지되고 있는가?',
        '앞치마, 장갑, 행주는 수시로 세척 또는 교환하는가?',
        '냉장(냉동)실 및 진열상자는 적정온도를 유지하고 있는가?',
        '식육을 접시에 담아 진열할 경우 가축육으로부터 혈액에 의한 오염을 방지하고, 교차오염이 일어나지 않는가?',
        '작업중 사용하던 장비, 작업대, 운반기구 등은 고기 찌꺼기를 제거하고 세척이 용이하도록 정리, 정돈되어 있는가?',
        '사용한 식육과 접촉하는 장비, 도구 등은 수시로 세척, 보관하는가?',
        '작업 후 배수구, 벽면, 바닥은 이물질이 제거되어 깨끗이 청소되어 있으며, 물이 고여있지 않는가?',
        '행주, 장갑 등은 삶거나 살균 소독 후 건조 보관하고 있는가?',
        '물, 도마 등은 세척, 소독하여 위생적으로 관리하고 있는가?',
    ],
  },
];

// 상태 관리용 타입 정의
interface CheckItemState {
  evaluation: '적정' | '부적정' | null;
  notes: string;
}

export default function HygieneChecklistPage() {
  const [author, setAuthor] = useState('');
  const [checkDate, setCheckDate] = useState(new Date().toISOString().slice(0, 10));
  const [checklistState, setChecklistState] = useState<Record<string, Record<number, CheckItemState>>>({});

  const handleStateChange = (category: string, itemIndex: number, field: keyof CheckItemState, value: any) => {
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
  
  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-4 md:p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-teal-400 text-center">축산물 판매업소 위생관리 점검일지</h1>
        <div className="mt-6 flex justify-end items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
                <label htmlFor="checkDate" className="font-semibold text-slate-400">점검일</label>
                <input 
                    type="date" 
                    id="checkDate"
                    value={checkDate}
                    onChange={(e) => setCheckDate(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                />
            </div>
            <div className="flex items-center gap-2">
                <label htmlFor="author" className="font-semibold text-slate-400">점검자</label>
                <input 
                    type="text" 
                    id="author"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="이름을 입력하세요"
                    className="bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all placeholder:text-slate-500"
                />
            </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-6">
        {checklistSections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
            <h2 className="text-xl font-bold text-teal-300/90 mb-4 pb-2 border-b border-slate-700">{section.category}</h2>
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-400 uppercase bg-slate-800/50">
                    <tr>
                        <th scope="col" className="px-6 py-3 rounded-l-lg w-2/3">점검항목</th>
                        <th scope="col" className="px-6 py-3 text-center">평가</th>
                        <th scope="col" className="px-6 py-3 rounded-r-lg">비고</th>
                    </tr>
                </thead>
                <tbody>
                {section.items.map((item, itemIndex) => (
                    <tr key={itemIndex} className="border-b border-slate-800 hover:bg-slate-800/30">
                        <td className="px-6 py-3 font-medium text-slate-300">{item}</td>
                        <td className="px-6 py-3">
                            <div className="flex items-center justify-center gap-4">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name={`${section.category}-${itemIndex}`}
                                        checked={checklistState[section.category]?.[itemIndex]?.evaluation === '적정'}
                                        onChange={() => handleStateChange(section.category, itemIndex, 'evaluation', '적정')}
                                        className="w-4 h-4 text-teal-500 bg-gray-700 border-gray-600 focus:ring-teal-600 ring-offset-gray-800 focus:ring-2"
                                    />
                                    적정
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input 
                                        type="radio" 
                                        name={`${section.category}-${itemIndex}`}
                                        checked={checklistState[section.category]?.[itemIndex]?.evaluation === '부적정'}
                                        onChange={() => handleStateChange(section.category, itemIndex, 'evaluation', '부적정')}
                                        className="w-4 h-4 text-yellow-500 bg-gray-700 border-gray-600 focus:ring-yellow-600 ring-offset-gray-800 focus:ring-2"
                                    />
                                    부적정
                                </label>
                            </div>
                        </td>
                        <td className="px-6 py-3">
                            <input 
                                type="text" 
                                value={checklistState[section.category]?.[itemIndex]?.notes || ''}
                                onChange={(e) => handleStateChange(section.category, itemIndex, 'notes', e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-all"
                            />
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="mt-6 text-right">
        <button className="bg-teal-500 hover:bg-teal-400 text-slate-950 px-8 py-3 rounded-lg font-bold transition-colors disabled:opacity-50">
            점검 내용 저장
        </button>
      </div>
    </div>
  );
}

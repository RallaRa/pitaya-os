'use client';

import { useState } from 'react';

const ANIMAL_OPTIONS = [
  { ko: '소', en: 'Beef' },
  { ko: '돼지', en: 'Pork' },
  { ko: '닭', en: 'Chicken' },
  { ko: '기타', en: 'ETC' },
];

const ORIGIN_OPTIONS = [
  { ko: '국내', en: 'KOR' },
  { ko: '미국', en: 'USA' },
  { ko: '호주', en: 'AUS' },
  { ko: '캐나다', en: 'CAN' },
  { ko: '덴마크', en: 'DEN' },
  { ko: '스페인', en: 'ESP' },
  { ko: '칠레', en: 'CHI' },
  { ko: '뉴질랜드', en: 'NZL' },
  { ko: '멕시코', en: 'MEX' },
  { ko: '네덜란드', en: 'NED' },
  { ko: '폴란드', en: 'POL' },
  { ko: '기타', en: 'ETC' },
];

export interface MergeItem {
  originalName: string;
  sourceName: string;
  source: string;
  price: number;
  url?: string;
  animalType?: { ko: string; en: string };
  origin?: { ko: string; en: string };
}

export interface DefinedItem {
  standardName: string;
  animalType?: { ko: string; en: string };
  origin?: { ko: string; en: string };
  storageType?: string;
}

interface MergeModalProps {
  item: MergeItem;
  definedItems: DefinedItem[];
  onMerge: (item: MergeItem, standardName: string, animalType: string, origin: string) => void;
  onClose: () => void;
}

export default function MergeModal({ item, definedItems, onMerge, onClose }: MergeModalProps) {
  const [mode, setMode] = useState<'existing' | 'new'>('new');
  const [selectedExisting, setSelectedExisting] = useState('');
  const [newStandardName, setNewStandardName] = useState('');
  const [selectedAnimal, setSelectedAnimal] = useState(item.animalType?.ko || '돼지');
  const [selectedOrigin, setSelectedOrigin] = useState(item.origin?.ko || '국내');

  const handleSubmit = () => {
    if (mode === 'existing') {
      if (!selectedExisting) return;
      const target = definedItems.find(d => d.standardName === selectedExisting);
      onMerge(
        item,
        selectedExisting,
        target?.animalType?.ko || selectedAnimal,
        target?.origin?.ko || selectedOrigin,
      );
    } else {
      if (!newStandardName.trim()) return;
      onMerge(item, newStandardName.trim(), selectedAnimal, selectedOrigin);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg">
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-bold text-lg text-white">표준명 지정</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
        </div>

        <div className="bg-slate-800 rounded-xl p-4 mb-5">
          <p className="text-xs text-slate-400 mb-1">원본 품목명</p>
          <p className="font-mono text-yellow-300 text-sm">{item.originalName}</p>
          <div className="flex gap-4 mt-2 text-xs text-slate-400">
            <span>출처: {item.sourceName}</span>
            <span>가격: {item.price?.toLocaleString()}원</span>
          </div>
          <div className="flex gap-4 mt-1 text-xs">
            <span className="text-blue-400">
              자동감지 원산지: {item.origin?.ko || '알 수 없음'} ({item.origin?.en || '-'})
            </span>
            <span className="text-green-400">
              자동감지 축종: {item.animalType?.ko || '알 수 없음'} ({item.animalType?.en || '-'})
            </span>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode('new')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${
              mode === 'new' ? 'bg-teal-600 text-white' : 'bg-slate-700 text-slate-300'
            }`}
          >
            새 표준명 등록
          </button>
          <button
            onClick={() => setMode('existing')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${
              mode === 'existing' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'
            }`}
          >
            기존 품목에 병합
          </button>
        </div>

        {mode === 'new' ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">표준 품목명</label>
              <input
                type="text"
                placeholder="예: 삼겹살, 목살, 척아이롤"
                value={newStandardName}
                onChange={e => setNewStandardName(e.target.value)}
                className="w-full bg-slate-800 rounded-lg p-3 text-sm text-white outline-none border border-slate-600 focus:border-teal-500"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">축종 (Animal Type)</label>
              <div className="flex gap-2 flex-wrap">
                {ANIMAL_OPTIONS.map(a => (
                  <button
                    key={a.ko}
                    type="button"
                    onClick={() => setSelectedAnimal(a.ko)}
                    className={`px-3 py-1.5 rounded-lg text-xs ${
                      selectedAnimal === a.ko ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {a.ko} ({a.en})
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">원산지 (Origin)</label>
              <div className="flex gap-2 flex-wrap">
                {ORIGIN_OPTIONS.map(o => (
                  <button
                    key={o.ko}
                    type="button"
                    onClick={() => setSelectedOrigin(o.ko)}
                    className={`px-3 py-1.5 rounded-lg text-xs ${
                      selectedOrigin === o.ko ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {o.ko} ({o.en})
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <label className="text-xs text-slate-400 mb-1 block">병합할 표준 품목 선택</label>
            <select
              value={selectedExisting}
              onChange={e => setSelectedExisting(e.target.value)}
              className="w-full bg-slate-800 rounded-lg p-3 text-sm text-white border border-slate-600"
            >
              <option value="">선택...</option>
              {definedItems.map((d, i) => (
                <option key={i} value={d.standardName}>
                  [{d.animalType?.ko}/{d.animalType?.en}] [{d.origin?.ko}/{d.origin?.en}] {d.standardName}
                  {d.storageType ? ` (${d.storageType})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={handleSubmit}
          className="w-full py-3 bg-teal-600 text-white rounded-xl font-semibold mt-5 hover:bg-teal-500"
        >
          등록
        </button>
      </div>
    </div>
  );
}

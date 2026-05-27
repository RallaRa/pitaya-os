'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/context/StoreContext';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { History, CheckCircle, AlertCircle, XCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';

interface AccuracyRecord {
  id: string;
  predictionDate: string;
  period: string;
  predictedTopItems: string[];
  predictedBottomItems: string[];
  predictedOpinion: string;
  confidence: number;
  actualTopItems: string[] | null;
  accuracyScore: number | null;
  verifiedAt: any;
  createdAt: any;
}

const PERIOD_KO: Record<string, string> = {
  today: '오늘', tomorrow: '내일', thisWeek: '이번주', thisMonth: '이번달',
};

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return (
    <span className="flex items-center gap-1 text-[10px] text-slate-500">
      <Clock className="w-3 h-3" /> 미검증
    </span>
  );
  if (score >= 90) return (
    <span className="flex items-center gap-1 text-[10px] text-green-400 font-bold">
      <CheckCircle className="w-3 h-3" /> {score}%
    </span>
  );
  if (score >= 70) return (
    <span className="flex items-center gap-1 text-[10px] text-amber-400 font-bold">
      <AlertCircle className="w-3 h-3" /> {score}%
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[10px] text-red-400 font-bold">
      <XCircle className="w-3 h-3" /> {score}%
    </span>
  );
}

function DetailModal({ record, onClose }: { record: AccuracyRecord; onClose: () => void }) {
  const predicted = record.predictedTopItems || [];
  const actual    = record.actualTopItems || [];
  const matches   = predicted.filter(n => actual.includes(n));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <h3 className="text-slate-200 font-semibold text-sm">{record.predictionDate} — {PERIOD_KO[record.period]||record.period}</h3>
            <p className="text-slate-500 text-xs mt-0.5">신뢰도 {record.confidence}% / 정합성 {record.accuracyScore !== null ? record.accuracyScore+'%' : '미검증'}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto max-h-96">
          {/* 비교 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-semibold text-teal-400 mb-2 uppercase">예측 TOP5</p>
              {predicted.length > 0 ? predicted.map((name, i) => (
                <div key={i} className={`text-xs py-1 border-b border-slate-800 flex items-center gap-2 ${actual.includes(name) ? 'text-green-400' : 'text-slate-400'}`}>
                  <span className="text-slate-600 w-4">{i+1}</span>
                  {actual.includes(name) && <CheckCircle className="w-3 h-3 text-green-400 shrink-0" />}
                  {name}
                </div>
              )) : <p className="text-xs text-slate-600">없음</p>}
            </div>
            <div>
              <p className="text-[10px] font-semibold text-purple-400 mb-2 uppercase">실제 TOP5</p>
              {actual.length > 0 ? actual.map((name, i) => (
                <div key={i} className={`text-xs py-1 border-b border-slate-800 flex items-center gap-2 ${predicted.includes(name) ? 'text-green-400' : 'text-slate-400'}`}>
                  <span className="text-slate-600 w-4">{i+1}</span>
                  {predicted.includes(name) && <CheckCircle className="w-3 h-3 text-green-400 shrink-0" />}
                  {name}
                </div>
              )) : <p className="text-xs text-slate-600">미수집</p>}
            </div>
          </div>
          {matches.length > 0 && (
            <div className="bg-green-900/20 border border-green-700/40 rounded-lg px-3 py-2">
              <p className="text-xs text-green-300">✓ 일치 품목: {matches.join(', ')}</p>
            </div>
          )}
          {record.predictedOpinion && (
            <div className="bg-slate-800/60 rounded-lg p-3">
              <p className="text-[10px] text-slate-500 mb-1">예측 의견</p>
              <p className="text-xs text-slate-300 leading-relaxed">{record.predictedOpinion.replace(/\*\*/g,'')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PredictionHistoryPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  const [records,  setRecords]  = useState<AccuracyRecord[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<AccuracyRecord | null>(null);
  const [periodFilter, setPeriodFilter] = useState<string>('all');

  useEffect(() => {
    if (!storeId) { setLoading(false); return; }
    const q = query(
      collection(db, 'ai_partner_accuracy'),
      where('storeId', '==', storeId),
      orderBy('predictionDate', 'desc'),
      limit(100),
    );
    getDocs(q).then(snap => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() } as AccuracyRecord)));
    }).catch(() => {}).finally(() => setLoading(false));
  }, [storeId]);

  const filtered = periodFilter === 'all' ? records : records.filter(r => r.period === periodFilter);

  const verified   = records.filter(r => r.accuracyScore !== null);
  const avgScore   = verified.length > 0 ? Math.round(verified.reduce((s,r) => s + (r.accuracyScore||0), 0) / verified.length) : null;

  // 품목별 정합성
  const itemHits: Record<string, { hits: number; total: number }> = {};
  verified.forEach(r => {
    (r.predictedTopItems||[]).forEach((item, i) => {
      if (!itemHits[item]) itemHits[item] = { hits:0, total:0 };
      itemHits[item].total++;
      if ((r.actualTopItems||[]).includes(item)) itemHits[item].hits++;
    });
  });
  const itemAccuracy = Object.entries(itemHits)
    .filter(([,v]) => v.total >= 2)
    .map(([name, v]) => ({ name, rate: Math.round(v.hits/v.total*100), total: v.total }))
    .sort((a,b) => b.rate - a.rate);
  const bestItems  = itemAccuracy.slice(0, 3);
  const worstItems = itemAccuracy.slice(-3).reverse();

  return (
    <div className="flex flex-col min-h-full bg-slate-950 p-6">
      <div className="max-w-5xl mx-auto w-full space-y-6">

        {/* 헤더 */}
        <div className="flex items-center gap-3">
          <History className="w-5 h-5 text-teal-400" />
          <h1 className="text-xl font-bold text-slate-100">AI 예측 히스토리</h1>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-[10px] text-slate-500 uppercase mb-1">전체 예측수</p>
            <p className="text-2xl font-bold text-slate-100">{records.length}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-[10px] text-slate-500 uppercase mb-1">평균 정합성</p>
            <p className={`text-2xl font-bold ${avgScore !== null ? (avgScore >= 80 ? 'text-green-400' : avgScore >= 60 ? 'text-amber-400' : 'text-red-400') : 'text-slate-600'}`}>
              {avgScore !== null ? `${avgScore}%` : '—'}
            </p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-[10px] text-slate-500 uppercase mb-2">🎯 정확한 품목 TOP3</p>
            {bestItems.length > 0 ? bestItems.map((item, i) => (
              <p key={i} className="text-xs text-green-400 truncate">{item.name} <span className="text-slate-500">{item.rate}%</span></p>
            )) : <p className="text-xs text-slate-600">데이터 부족</p>}
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-[10px] text-slate-500 uppercase mb-2">⚠️ 부정확한 품목 TOP3</p>
            {worstItems.length > 0 ? worstItems.map((item, i) => (
              <p key={i} className="text-xs text-red-400 truncate">{item.name} <span className="text-slate-500">{item.rate}%</span></p>
            )) : <p className="text-xs text-slate-600">데이터 부족</p>}
          </div>
        </div>

        {/* 필터 */}
        <div className="flex items-center gap-2 flex-wrap">
          {['all','today','tomorrow','thisWeek','thisMonth'].map(p => (
            <button key={p} onClick={() => setPeriodFilter(p)}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${periodFilter === p ? 'bg-teal-600/20 text-teal-300 border border-teal-500/30' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
              {p === 'all' ? '전체' : PERIOD_KO[p]||p}
            </button>
          ))}
        </div>

        {/* 테이블 */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_,i) => (
              <div key={i} className="h-14 bg-slate-800/40 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-600">
            <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">예측 기록이 없습니다</p>
            <p className="text-xs mt-1">AI 토탈 운영파트너 위젯을 활성화하면 자동으로 기록됩니다</p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="grid grid-cols-5 gap-2 px-4 py-2 border-b border-slate-800 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              <span>날짜</span><span>기간</span><span>예측 TOP5</span><span>실제 TOP5</span><span>정합성</span>
            </div>
            <div className="divide-y divide-slate-800/60">
              {filtered.map(r => (
                <button key={r.id} onClick={() => setSelected(r)}
                  className="w-full grid grid-cols-5 gap-2 px-4 py-3 hover:bg-slate-800/40 transition-colors text-left">
                  <span className="text-xs text-slate-300">{r.predictionDate}</span>
                  <span className="text-xs">
                    <span className="bg-slate-700 px-1.5 py-0.5 rounded text-slate-300">
                      {PERIOD_KO[r.period]||r.period}
                    </span>
                  </span>
                  <div className="text-[10px] text-slate-400 truncate">
                    {(r.predictedTopItems||[]).slice(0,3).join(', ')}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">
                    {(r.actualTopItems||[]).slice(0,3).join(', ') || '—'}
                  </div>
                  <ScoreBadge score={r.accuracyScore} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {selected && <DetailModal record={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

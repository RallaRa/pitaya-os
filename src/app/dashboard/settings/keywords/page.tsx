'use client';

import { getAuthJsonHeaders, getAuthHeaders } from '@/lib/getAuthHeaders';
import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/context/StoreContext';
import { useAuth } from '@/context/AuthContext';
import {
  Tag, Plus, X, Save, RefreshCw, ToggleLeft, ToggleRight,
  Loader2, AlertTriangle, Bot, Edit2, Check, RotateCcw, Clock,
} from 'lucide-react';

interface KeywordGroup {
  id: string;
  groupName: string;
  keywords: string[];
  analysisNote?: string;
  priorityScore?: number;
  active: boolean;
  source: 'auto' | 'manual';
  admin_edited: boolean;
  lastUpdated?: any;
  salesRank?: number;
}

interface KeywordDoc {
  keywordGroups: KeywordGroup[];
  marketKeywords?: string[];
  operationHint?: string;
  lastAutoUpdate?: any;
  nextAutoUpdate?: any;
}

interface TrendPreview {
  groupName: string;
  current: number;
  change: number;
  data: { period: string; ratio: number }[];
}

export default function KeywordsPage() {
  const { currentStore } = useStore();
  const { user } = useAuth();

  const [doc,        setDoc]        = useState<KeywordDoc | null>(null);
  const [groups,     setGroups]     = useState<KeywordGroup[]>([]);
  const [isLoading,  setIsLoading]  = useState(true);
  const [isSaving,   setIsSaving]   = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editName,   setEditName]   = useState('');
  const [editTags,   setEditTags]   = useState<string[]>([]);
  const [newTag,     setNewTag]     = useState('');
  const [trends,     setTrends]     = useState<TrendPreview[]>([]);
  const [trendError, setTrendError] = useState('');
  const [isTrendLoading, setIsTrendLoading] = useState(false);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState('');

  const storeId = currentStore?.storeId || 'global';

  const loadTrends = useCallback(async () => {
    if (!storeId || storeId === 'global') return;
    setIsTrendLoading(true);
    setTrendError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/external/naver-trend?storeId=${storeId}`, { headers });
      const data = await res.json();
      if (data.noKeywords) {
        setTrendError('활성 키워드가 없습니다. 키워드를 활성화하거나 "지금 즉시 갱신"을 실행하세요.');
        setTrends([]);
      } else if (data.error && !data.trends?.length) {
        setTrendError(data.error);
        setTrends([]);
      } else {
        setTrends(data.trends || []);
      }
    } catch {
      setTrendError('트렌드 조회 실패');
      setTrends([]);
    } finally {
      setIsTrendLoading(false);
    }
  }, [storeId]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res  = await fetch(`/api/keywords?storeId=${encodeURIComponent(storeId)}&_=${Date.now()}`, { headers });
      if (!res.ok) throw new Error('키워드 불러오기 실패');
      const data = await res.json();
      setDoc(data);
      setGroups(data.keywordGroups || []);
      await loadTrends();
    } catch {
      setError('데이터를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [storeId, loadTrends]);

  useEffect(() => { load(); }, [load]);

  const activeCount = groups.filter(g => g.active).length;
  const showWarning = activeCount > 5;

  /* 활성 토글 */
  const toggleActive = (id: string) => {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, active: !g.active } : g));
  };

  /* 편집 시작 */
  const startEdit = (g: KeywordGroup) => {
    setEditingId(g.id);
    setEditName(g.groupName);
    setEditTags([...g.keywords]);
    setNewTag('');
  };

  /* 편집 저장 */
  const saveEdit = (id: string) => {
    setGroups(prev => prev.map(g =>
      g.id === id
        ? { ...g, groupName: editName, keywords: editTags, admin_edited: true, source: 'manual' }
        : g
    ));
    setEditingId(null);
  };

  /* 태그 추가 */
  const addTag = () => {
    const t = newTag.trim();
    if (t && !editTags.includes(t)) {
      setEditTags(prev => [...prev, t]);
    }
    setNewTag('');
  };

  /* 자동갱신 초기화 */
  const resetToAuto = (id: string) => {
    setGroups(prev => prev.map(g =>
      g.id === id ? { ...g, admin_edited: false, source: 'auto' } : g
    ));
  };

  /* 전체 저장 */
  const saveAll = async () => {
    setIsSaving(true);
    setError('');
    try {
      const res = await fetch('/api/keywords', {
        method: 'POST',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({ storeId, keywordGroups: groups }),
      });
      if (!res.ok) throw new Error('저장 실패');
      setSuccess('저장되었습니다.');
      setTimeout(() => setSuccess(''), 2500);
      await loadTrends();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  /* 즉시 갱신 */
  const runCron = async () => {
    setIsUpdating(true);
    setError('');
    setSuccess('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/cron/update-keywords?storeId=${encodeURIComponent(storeId)}`, {
        method: 'POST',
        headers,
      });
      const data = await res.json().catch(() => ({}));
      const result = (data.results || []).find((r: { storeId?: string }) => r.storeId === storeId)
        || data.results?.[0];

      if (!res.ok) {
        throw new Error(data.error || result?.error || '갱신 실패');
      }
      if (result?.status === 'error') {
        throw new Error(String(result.error || '키워드 생성 중 오류'));
      }
      if (result?.status === 'skipped') {
        throw new Error(String(result.reason || '키워드 생성 실패'));
      }
      if (!result || result.status !== 'updated') {
        throw new Error('키워드 갱신 결과를 확인할 수 없습니다');
      }

      setSuccess(`키워드 ${result.keywordCount ?? 0}개 · 그룹 ${result.groupCount ?? 0}개 갱신 완료`);
      setTimeout(() => setSuccess(''), 3500);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '갱신 실패');
    } finally {
      setIsUpdating(false);
    }
  };

  const formatTs = (ts: any) => {
    if (!ts) return '-';
    if (ts._seconds) return new Date(ts._seconds * 1000).toLocaleString('ko-KR');
    if (ts instanceof Date) return ts.toLocaleString('ko-KR');
    return '-';
  };

  if (!currentStore?.storeId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <Tag className="w-12 h-12 mb-3 opacity-30" />
        <p className="text-sm">매장을 먼저 선택해주세요.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-1">
        <Tag className="w-5 h-5 text-teal-400" />
        <h1 className="text-lg font-bold text-teal-400">네이버 트렌드 키워드 관리</h1>
      </div>
      <p className="text-slate-400 text-sm mb-5">
        AI가 시장 전반 참조 변수 <strong className="text-slate-300">검색 키워드 30개</strong>를 선정합니다. POS 품목과 무관하며, 운영방향·트렌드 분석의 기준값으로 사용됩니다.
      </p>

      {/* 정보 바 */}
      <div className="flex flex-wrap gap-3 mb-5 p-3 bg-slate-800/50 rounded-xl border border-slate-700/40 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          마지막 갱신: <strong className="text-slate-200">{formatTs(doc?.lastAutoUpdate)}</strong>
        </span>
        <span className="flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          다음 예정: <strong className="text-slate-200">{doc?.nextAutoUpdate ? formatTs(doc.nextAutoUpdate) : '매주 월요일 오전 5시'}</strong>
        </span>
        <button
          onClick={runCron}
          disabled={isUpdating}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-teal-600/20 border border-teal-500/30 text-teal-300 rounded-lg hover:bg-teal-600/30 transition-colors disabled:opacity-50"
        >
          {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          지금 즉시 갱신
        </button>
      </div>

      {/* 경고 배너 */}
      {showWarning && (
        <div className="flex items-center gap-2 bg-amber-900/20 border border-amber-500/30 rounded-xl px-4 py-3 mb-4 text-amber-300 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          네이버 API는 최대 5개 그룹만 지원됩니다. 현재 활성 {activeCount}개 — 5개 이하로 줄여주세요.
        </div>
      )}

      {/* 알림 */}
      {success && (
        <div className="flex items-center gap-2 bg-teal-900/20 border border-teal-500/30 rounded-xl px-4 py-3 mb-4 text-teal-300 text-sm">
          <Check className="w-4 h-4" /> {success}
        </div>
      )}
      {error && (
        <div className="bg-red-900/30 border border-red-500/30 rounded-xl px-4 py-3 mb-4 text-red-400 text-sm">
          {error}
          <button className="ml-2 underline text-xs" onClick={() => setError('')}>닫기</button>
        </div>
      )}

      {/* 시장 참조 키워드 30개 */}
      {!isLoading && doc?.marketKeywords && doc.marketKeywords.length > 0 && (
        <div className="mb-5 bg-slate-900 border border-teal-700/30 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-teal-300 mb-2">
            시장 참조 키워드 ({doc.marketKeywords.length}개)
          </h2>
          {doc.operationHint && (
            <p className="text-xs text-slate-400 mb-3">{doc.operationHint}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {doc.marketKeywords.map((kw, i) => (
              <span key={i} className="bg-teal-900/30 border border-teal-700/40 text-teal-200 text-xs rounded-full px-2.5 py-1">
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 트렌드 미리보기 */}
      {!isLoading && (
        <div className="mb-5 bg-slate-900 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-200">네이버 검색 트렌드 (최근 7일)</h2>
            <button
              onClick={loadTrends}
              disabled={isTrendLoading}
              className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 disabled:opacity-50"
            >
              {isTrendLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              새로고침
            </button>
          </div>
          {trendError ? (
            <p className="text-xs text-amber-400">{trendError}</p>
          ) : trends.length === 0 ? (
            <p className="text-xs text-slate-500">활성 키워드 그룹의 트렌드가 표시됩니다.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {trends.map(t => (
                <div key={t.groupName} className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm text-slate-200 font-medium">{t.groupName}</p>
                    <p className="text-[10px] text-slate-500">검색지수 {t.current}</p>
                  </div>
                  <span className={`text-sm font-bold ${t.change > 0 ? 'text-green-400' : t.change < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                    {t.change > 0 ? '+' : ''}{t.change}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 테이블 */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 text-teal-400 animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
          <Bot className="w-10 h-10 opacity-30" />
          <p className="text-sm">키워드 그룹이 없습니다.</p>
          <p className="text-xs text-slate-600">&quot;지금 즉시 갱신&quot;을 누르면 AI가 시장·통계 기준으로 검색 키워드를 다시 선정합니다.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* 헤더 */}
          <div className="grid grid-cols-[32px_1fr_2fr_80px_80px] gap-3 px-4 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            <span>순위</span>
            <span>트렌드 테마</span>
            <span>네이버 검색 키워드</span>
            <span>출처</span>
            <span className="text-center">활성</span>
          </div>

          <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
            <div className="divide-y divide-slate-800">
              {groups.map((g) => (
                <div
                  key={g.id}
                  className={`p-4 transition-colors ${g.active ? '' : 'opacity-50'}`}
                >
                  {editingId === g.id ? (
                    /* 편집 모드 */
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="flex-1 bg-slate-800 border border-teal-500/50 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
                          placeholder="검색 테마명"
                        />
                        <button
                          onClick={() => saveEdit(g.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-black text-xs font-semibold rounded-lg"
                        >
                          <Check className="w-3.5 h-3.5" /> 저장
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 bg-slate-700 text-slate-400 text-xs rounded-lg"
                        >
                          취소
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {editTags.map((tag, ti) => (
                          <span key={ti} className="flex items-center gap-1 bg-teal-900/30 border border-teal-700/40 text-teal-300 text-xs rounded-full px-2.5 py-1">
                            {tag}
                            <button onClick={() => setEditTags(prev => prev.filter((_, i) => i !== ti))}>
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                        <div className="flex gap-1">
                          <input
                            value={newTag}
                            onChange={e => setNewTag(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                            className="bg-slate-800 border border-slate-600 rounded-full px-2.5 py-1 text-xs text-white w-24 focus:outline-none focus:border-teal-500"
                            placeholder="키워드 추가"
                          />
                          <button onClick={addTag} className="p-1 text-teal-400 hover:text-teal-300">
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* 뷰 모드 */
                    <div className="grid grid-cols-[32px_1fr_2fr_80px_80px] gap-3 items-center">
                      <span className="text-slate-500 text-xs font-mono">#{g.salesRank ?? '-'}</span>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-100 text-sm font-medium truncate">{g.groupName}</span>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => startEdit(g)} className="p-1 text-slate-500 hover:text-teal-400 transition-colors">
                              <Edit2 className="w-3 h-3" />
                            </button>
                            {g.admin_edited && (
                              <button onClick={() => resetToAuto(g.id)} title="자동갱신으로 초기화" className="p-1 text-slate-500 hover:text-orange-400 transition-colors">
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        {g.analysisNote && (
                          <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2" title={g.analysisNote}>
                            {g.analysisNote}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {g.keywords.slice(0, 5).map((kw, ki) => (
                          <span key={ki} className="bg-slate-800 text-slate-300 text-[10px] rounded-full px-2 py-0.5">{kw}</span>
                        ))}
                        {g.keywords.length > 5 && (
                          <span className="text-slate-600 text-[10px]">+{g.keywords.length - 5}</span>
                        )}
                      </div>

                      <div>
                        {g.admin_edited ? (
                          <span className="flex items-center gap-1 text-[10px] text-orange-400 bg-orange-900/20 rounded px-1.5 py-0.5">
                            <Edit2 className="w-2.5 h-2.5" /> 관리자수정
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] text-blue-400 bg-blue-900/20 rounded px-1.5 py-0.5">
                            <Bot className="w-2.5 h-2.5" /> 자동생성
                          </span>
                        )}
                      </div>

                      <div className="flex justify-center">
                        <button onClick={() => toggleActive(g.id)} className="text-slate-400 hover:text-teal-400 transition-colors">
                          {g.active
                            ? <ToggleRight className="w-6 h-6 text-teal-400" />
                            : <ToggleLeft  className="w-6 h-6" />
                          }
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 저장 버튼 */}
      {!isLoading && (
        <div className="flex justify-end mt-4">
          <button
            onClick={saveAll}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            변경사항 저장
          </button>
        </div>
      )}
    </div>
  );
}

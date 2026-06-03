'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Link2, Plus, Loader2, Trash2, ArrowLeft, Eye, Play, X } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

interface ScraperSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  encoding?: string;
  categories?: { url: string; name: string }[];
  selectors?: { item: string; name: string; price: string };
  lastScraped?: any;
  itemCount?: number;
  pendingCount?: number;
  bondaeroAccessToken?: string;
  bondaeroRefreshToken?: string;
}

const EMPTY_FORM = {
  id: '',
  name: '',
  url: '',
  encoding: 'utf-8',
  categoryUrl: '',
  categoryName: '',
  itemSelector: '.goods-item',
  nameSelector: '.name',
  priceSelector: '.price',
};

interface PreviewResult {
  itemCount: number;
  pendingCount: number;
  items?: {
    originalName: string;
    standardName: string;
    price: number;
    url: string;
    origin?: { ko: string; en: string };
    animalType?: { ko: string; en: string };
  }[];
}

export default function ScraperSourcesPage() {
  const [sources, setSources] = useState<ScraperSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [previewSourceId, setPreviewSourceId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [runningSourceId, setRunningSourceId] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/scraper-sources', { headers });
      const data = await res.json();
      setSources(data.sources || []);
    } catch {
      setError('목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const formatDate = (val: any) => {
    if (!val) return '-';
    if (val._seconds) return new Date(val._seconds * 1000).toLocaleString('ko-KR');
    if (val.toDate) return val.toDate().toLocaleString('ko-KR');
    return String(val);
  };

  const toggleEnabled = async (source: ScraperSource) => {
    const headers = await getAuthJsonHeaders();
    await fetch('/api/scraper-sources', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ id: source.id, enabled: !source.enabled }),
    });
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 소스를 삭제하시겠습니까?')) return;
    const headers = await getAuthJsonHeaders();
    await fetch(`/api/scraper-sources?id=${id}`, { method: 'DELETE', headers });
    await load();
  };

  const handlePreview = async (sourceId: string) => {
    setPreviewSourceId(sourceId);
    setPreviewLoading(true);
    setPreviewData(null);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(`/api/scraper/run?sourceId=${encodeURIComponent(sourceId)}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPreviewData(data);
    } catch (e: any) {
      setError(e.message);
      setPreviewSourceId(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleRun = async (sourceId?: string) => {
    if (sourceId) setRunningSourceId(sourceId);
    else setRunningAll(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/scraper/run', {
        method: 'POST',
        headers,
        body: JSON.stringify(sourceId ? { sourceId } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunningSourceId(null);
      setRunningAll(false);
    }
  };

  const handleSave = async () => {
    if (!form.id || !form.name || !form.url) {
      setError('ID, 사이트명, URL은 필수입니다.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/scraper-sources', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: form.id.replace(/\s/g, '_').toLowerCase(),
          name: form.name,
          url: form.url,
          encoding: form.encoding,
          enabled: true,
          categories: form.categoryUrl
            ? [{ url: form.categoryUrl, name: form.categoryName || '전체' }]
            : [],
          selectors: {
            item: form.itemSelector,
            name: form.nameSelector,
            price: form.priceSelector,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setShowForm(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Link href="/dashboard/settings" className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-sm mb-4">
        <ArrowLeft className="w-4 h-4" /> 설정으로
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Link2 className="w-5 h-5 text-teal-400" />
          <h1 className="text-lg font-bold text-teal-400">스크래핑 소스 관리</h1>
        </div>
        <button
          onClick={() => handleRun()}
          disabled={runningAll}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 text-white rounded-lg text-sm hover:bg-slate-600 disabled:opacity-50"
        >
          {runningAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          전체 수집
        </button>
        <button
          onClick={() => { setShowForm(true); setError(''); }}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-500"
        >
          <Plus className="w-4 h-4" /> 사이트 추가
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-3 mb-4 text-red-400 text-xs">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 text-teal-400 animate-spin" />
        </div>
      ) : sources.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">
          등록된 소스가 없습니다. scraper/init-sources.js를 실행하거나 사이트를 추가하세요.
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map(source => (
            <div key={source.id} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${source.enabled ? 'bg-green-400' : 'bg-slate-500'}`} />
                    <p className="text-white font-bold">{source.name}</p>
                    <span className="text-xs text-slate-500 font-mono">{source.id}</span>
                  </div>
                  <a href={source.url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:underline mt-0.5 block">{source.url}</a>
                  <p className="text-xs text-slate-400 mt-2">
                    마지막: {formatDate(source.lastScraped)} · {source.itemCount ?? 0}개 · 미정의 {source.pendingCount ?? 0}개
                    {(source.categories?.length ?? 0) > 0 && ` · 카테고리 ${source.categories!.length}개`}
                  </p>
                  {source.id === 'bondaero' && (
                    <p className="text-xs text-green-400/90 mt-2">
                      v2 공개 API 사용 — 별도 auth token 불필요
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handlePreview(source.id)}
                    disabled={previewLoading && previewSourceId === source.id}
                    className="px-3 py-1.5 rounded-lg text-xs bg-slate-800 text-slate-300 hover:bg-slate-700 inline-flex items-center gap-1"
                  >
                    {previewLoading && previewSourceId === source.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Eye className="w-3.5 h-3.5" />}
                    미리보기
                  </button>
                  <button
                    onClick={() => handleRun(source.id)}
                    disabled={runningSourceId === source.id}
                    className="px-3 py-1.5 rounded-lg text-xs bg-teal-700 text-white hover:bg-teal-600 inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    {runningSourceId === source.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Play className="w-3.5 h-3.5" />}
                    수집
                  </button>
                  <button
                    onClick={() => toggleEnabled(source)}
                    className={`px-3 py-1.5 rounded-lg text-xs ${
                      source.enabled ? 'bg-slate-700 text-slate-300' : 'bg-teal-600 text-white'
                    }`}
                  >
                    {source.enabled ? '비활성화' : '활성화'}
                  </button>
                  <button
                    onClick={() => handleDelete(source.id)}
                    className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-red-900/20"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {previewSourceId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">
                품목 미리보기 — {sources.find(s => s.id === previewSourceId)?.name}
              </h3>
              <button onClick={() => { setPreviewSourceId(null); setPreviewData(null); }} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            {previewLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-teal-400 animate-spin" /></div>
            ) : previewData ? (
              <>
                <p className="text-sm text-slate-400 mb-4">
                  {previewData.itemCount}개 수집 · 미정의 {previewData.pendingCount}개 (저장하지 않음)
                </p>
                {(previewData.items?.length ?? 0) === 0 ? (
                  <p className="text-sm text-orange-300">수집된 품목이 없습니다. 사이트 구조 변경 또는 로그인 필요 여부를 확인하세요.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-700">
                        <th className="text-left p-2">품목</th>
                        <th className="text-left p-2">원산지</th>
                        <th className="text-right p-2">가격</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.items!.map((item, i) => (
                        <tr key={i} className="border-b border-slate-800">
                          <td className="p-2">
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-teal-300 hover:underline">
                              {item.standardName || item.originalName}
                            </a>
                            {item.originalName !== item.standardName && (
                              <p className="text-[10px] text-slate-500 font-mono">{item.originalName}</p>
                            )}
                          </td>
                          <td className="p-2 text-slate-400">{item.origin?.ko || '-'}</td>
                          <td className="p-2 text-right text-green-400">{item.price.toLocaleString()}원</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-white mb-4">새 스크래핑 소스 추가</h3>
            <div className="space-y-3">
              <input placeholder="ID (예: meatclub)" value={form.id}
                onChange={e => setForm(p => ({ ...p, id: e.target.value }))}
                className="w-full bg-slate-800 rounded-lg p-3 text-sm text-white border border-slate-600" />
              <input placeholder="사이트명 (예: 미트클럽)" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-slate-800 rounded-lg p-3 text-sm text-white border border-slate-600" />
              <input placeholder="URL (예: https://meatclub.kr)" value={form.url}
                onChange={e => setForm(p => ({ ...p, url: e.target.value }))}
                className="w-full bg-slate-800 rounded-lg p-3 text-sm text-white border border-slate-600" />
              <select value={form.encoding} onChange={e => setForm(p => ({ ...p, encoding: e.target.value }))}
                className="w-full bg-slate-800 rounded-lg p-3 text-sm text-white border border-slate-600">
                <option value="utf-8">UTF-8</option>
                <option value="euc-kr">EUC-KR</option>
              </select>
              <input placeholder="카테고리 URL" value={form.categoryUrl}
                onChange={e => setForm(p => ({ ...p, categoryUrl: e.target.value }))}
                className="w-full bg-slate-800 rounded-lg p-3 text-sm text-white border border-slate-600" />
              <input placeholder="카테고리명" value={form.categoryName}
                onChange={e => setForm(p => ({ ...p, categoryName: e.target.value }))}
                className="w-full bg-slate-800 rounded-lg p-3 text-sm text-white border border-slate-600" />
              <input placeholder="Item CSS selector" value={form.itemSelector}
                onChange={e => setForm(p => ({ ...p, itemSelector: e.target.value }))}
                className="w-full bg-slate-800 rounded-lg p-3 text-sm text-white border border-slate-600" />
              <input placeholder="Name CSS selector" value={form.nameSelector}
                onChange={e => setForm(p => ({ ...p, nameSelector: e.target.value }))}
                className="w-full bg-slate-800 rounded-lg p-3 text-sm text-white border border-slate-600" />
              <input placeholder="Price CSS selector" value={form.priceSelector}
                onChange={e => setForm(p => ({ ...p, priceSelector: e.target.value }))}
                className="w-full bg-slate-800 rounded-lg p-3 text-sm text-white border border-slate-600" />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <button onClick={() => setShowForm(false)}
                className="py-2.5 bg-slate-700 text-slate-300 rounded-xl text-sm">취소</button>
              <button onClick={handleSave} disabled={saving}
                className="py-2.5 bg-teal-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

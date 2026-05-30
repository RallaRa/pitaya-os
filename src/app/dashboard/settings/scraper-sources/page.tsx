'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Link2, Plus, Loader2, Trash2, ArrowLeft } from 'lucide-react';
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

export default function ScraperSourcesPage() {
  const [sources, setSources] = useState<ScraperSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

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
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
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

'use client';

import { useState, useCallback, useEffect } from 'react';
import { Loader2, Trash2, LayoutTemplate, Wand2 } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

export interface CouponLayout {
  id: string;
  name: string;
  backgroundUrl: string;
  imagePrompt?: string;
  includeBarcodeDefault?: boolean;
}

interface Props {
  storeId: string;
  storeName: string;
  onLayoutsChange?: (layouts: CouponLayout[]) => void;
}

export default function CouponLayoutManager({ storeId, storeName, onLayoutsChange }: Props) {
  const [layouts, setLayouts] = useState<CouponLayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(`/api/coupons/layouts?storeId=${encodeURIComponent(storeId)}`, { headers });
      const data = await res.json();
      const list = data.layouts || [];
      setLayouts(list);
      onLayoutsChange?.(list);
    } catch {
      setLayouts([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, onLayoutsChange]);

  useEffect(() => { load(); }, [load]);

  const generateLayout = async () => {
    const msg = prompt.trim();
    if (!msg || generating) return;
    setGenerating(true);
    setError('');
    setReply('');
    try {
      const headers = await getAuthJsonHeaders();

      const aiRes = await fetch('/api/coupons/layouts/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId, storeName, message: msg, aiOnly: true }),
      });
      const aiData = await aiRes.json();
      if (!aiRes.ok) throw new Error(aiData.error || '레이아웃 AI 오류');

      const imgRes = await fetch('/api/signage/generate-image', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: aiData.imagePrompt,
          storeId,
          aspect: 'portrait',
        }),
      });
      const imgData = await imgRes.json();
      if (!imgRes.ok) throw new Error(imgData.error || '배경 생성 실패');

      const saveRes = await fetch('/api/coupons/layouts', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          name: aiData.name || '새 레이아웃',
          backgroundUrl: imgData.url,
          imagePrompt: aiData.imagePrompt,
        }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error || '저장 실패');

      setReply(aiData.reply || '레이아웃이 저장됐습니다. (FLUX + Canvas)');
      setPrompt('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '레이아웃 생성 실패');
    } finally {
      setGenerating(false);
    }
  };

  const removeLayout = async (id: string) => {
    if (!confirm('이 레이아웃을 삭제할까요?')) return;
    const headers = await getAuthJsonHeaders();
    await fetch(`/api/coupons/layouts?id=${id}&storeId=${encodeURIComponent(storeId)}`, {
      method: 'DELETE',
      headers,
    });
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-violet-800/40 rounded-xl p-4">
        <p className="text-sm font-semibold text-violet-300 flex items-center gap-2 mb-1">
          <LayoutTemplate className="w-4 h-4" /> 레이아웃 AI (배경만)
        </p>
        <p className="text-[11px] text-slate-500 mb-3">
          할인 문구 없이 카드 배경만 만듭니다. 사이니지와 동일한 FLUX 배경 생성을 사용합니다.
        </p>
        <div className="flex gap-2">
          <input
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && generateLayout()}
            placeholder="예: 봄 시즌 한우, 밝은 톤, 하단 여백 넓게"
            className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 outline-none focus:border-violet-500"
          />
          <button
            type="button"
            onClick={generateLayout}
            disabled={generating || !prompt.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded-lg text-xs text-white font-medium"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            생성·저장
          </button>
        </div>
        {reply && <p className="text-[11px] text-violet-300/90 mt-2">{reply}</p>}
        {error && <p className="text-[11px] text-red-400 mt-2">{error}</p>}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 text-teal-400 animate-spin" /></div>
      ) : layouts.length === 0 ? (
        <p className="text-center text-slate-500 text-sm py-8">저장된 레이아웃이 없습니다.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {layouts.map(l => (
            <div key={l.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden group">
              <div className="aspect-[4/5] bg-slate-950">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.backgroundUrl} alt={l.name} className="w-full h-full object-cover" />
              </div>
              <div className="px-3 py-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-200 truncate">{l.name}</p>
                <button
                  type="button"
                  onClick={() => removeLayout(l.id)}
                  className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

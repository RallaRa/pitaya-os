'use client';

import { useState, useEffect } from 'react';
import { LayoutGrid, Loader2, Save, ArrowLeft, Check } from 'lucide-react';
import Link from 'next/link';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

const WIDGET_LIST = [
  { key: 'news',               label: '정육 최신 뉴스',   desc: '네이버/구글 뉴스 RSS' },
  { key: 'weather',            label: '오늘 날씨',         desc: '매장 위치 기반 날씨' },
  { key: 'weekly_analysis',    label: 'AI 주간 판매 분석', desc: '최근 7일 판매 AI 분석' },
  { key: 'yesterday_analysis', label: '전일 판매 분석',    desc: '전일 판매 TOP/BOTTOM' },
  { key: 'quick_menu',         label: '빠른 메뉴',         desc: '자주 쓰는 메뉴 바로가기' },
  { key: 'ai_insight',         label: 'AI 인사이트',       desc: '금일 Best / 이슈 / 준비사항' },
  { key: 'total_partner',      label: 'AI 토탈 운영파트너', desc: '4기간 AI 운영 분석' },
  { key: 'sales_prediction',   label: 'AI 매출 예측',      desc: '예측 + AI 서포터 코멘트' },
  { key: 'today_sales',        label: '당일 매출 현황',    desc: '실시간 POS 매출' },
  { key: 'sales_compare',      label: '매출 비교',         desc: '6개 기간 비교 차트' },
];

const ROLE_COLS: { key: string; label: string; locked?: boolean }[] = [
  { key: 'master', label: 'Master', locked: true },
  { key: 'admin',  label: '관리자' },
  { key: 'user',   label: '사용자' },
  { key: 'staff',  label: '직원'   },
];

type Permissions = Record<string, Record<string, boolean>>;

const DEFAULT_PERMS: Permissions = {
  news:               { master: true, admin: true,  user: true,  staff: false },
  weather:            { master: true, admin: true,  user: true,  staff: true  },
  weekly_analysis:    { master: true, admin: true,  user: false, staff: false },
  yesterday_analysis: { master: true, admin: true,  user: true,  staff: false },
  quick_menu:         { master: true, admin: true,  user: true,  staff: true  },
  ai_insight:         { master: true, admin: true,  user: true,  staff: false },
  total_partner:      { master: true, admin: true,  user: true,  staff: false },
  sales_prediction:   { master: true, admin: true,  user: true,  staff: false },
  today_sales:        { master: true, admin: true,  user: true,  staff: true  },
  sales_compare:      { master: true, admin: true,  user: true,  staff: false },
};

export default function WidgetPermissionsPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || 'global';

  const [perms,   setPerms]   = useState<Permissions>(DEFAULT_PERMS);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');

  const isAdmin = ['master', 'superuser', 'admin', 'owner'].includes(currentStore?.role || '');

  useEffect(() => {
    const q = storeId !== 'global' ? `?storeId=${storeId}` : '';
    getAuthJsonHeaders()
      .then(headers => fetch(`/api/dashboard/widget-permissions${q}`, { headers }))
      .then(r => r.json())
      .then(d => setPerms({ ...DEFAULT_PERMS, ...d.widgets }))
      .finally(() => setLoading(false));
  }, [storeId]);

  const toggle = (widgetKey: string, roleKey: string) => {
    if (!isAdmin || roleKey === 'master') return;
    setPerms(prev => ({
      ...prev,
      [widgetKey]: {
        ...prev[widgetKey],
        [roleKey]: !prev[widgetKey]?.[roleKey],
      },
    }));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/dashboard/widget-permissions', {
        method: 'POST',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({ storeId, widgets: perms }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-950 p-4 md:p-6">
      {/* 헤더 */}
      <div className="mb-6">
        <Link href="/dashboard/settings" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm mb-4">
          <ArrowLeft className="w-4 h-4" /> 설정으로 돌아가기
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-500/10 border border-teal-500/20 rounded-xl flex items-center justify-center">
            <LayoutGrid className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h1 className="text-slate-100 font-bold">메인 대시보드 위젯 권한</h1>
            <p className="text-slate-500 text-sm">역할별 위젯 표시 여부를 설정합니다</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-slate-600 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* 테이블 */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            {/* 헤더 행 */}
            <div className="grid grid-cols-5 border-b border-slate-800 px-4 py-3">
              <div className="col-span-2 text-slate-500 text-xs font-semibold uppercase tracking-wider">위젯</div>
              {ROLE_COLS.map(r => (
                <div key={r.key} className={`text-center text-xs font-semibold uppercase tracking-wider ${
                  r.locked ? 'text-yellow-500' : 'text-slate-500'
                }`}>
                  {r.label}
                  {r.locked && <span className="ml-0.5 text-[8px]">🔒</span>}
                </div>
              ))}
            </div>

            {/* 위젯 행 */}
            {WIDGET_LIST.map((widget, wi) => (
              <div
                key={widget.key}
                className={`grid grid-cols-5 items-center px-4 py-3 ${wi < WIDGET_LIST.length - 1 ? 'border-b border-slate-800/60' : ''}`}
              >
                <div className="col-span-2">
                  <p className="text-slate-200 text-sm font-medium">{widget.label}</p>
                  <p className="text-slate-600 text-xs">{widget.desc}</p>
                </div>
                {ROLE_COLS.map(role => {
                  const enabled = perms[widget.key]?.[role.key] !== false;
                  return (
                    <div key={role.key} className="flex justify-center">
                      <button
                        onClick={() => toggle(widget.key, role.key)}
                        disabled={!isAdmin || !!role.locked}
                        className={`w-9 h-5 rounded-full transition-all relative ${
                          enabled ? 'bg-teal-500' : 'bg-slate-700'
                        } ${(!isAdmin || role.locked) ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                          enabled ? 'right-0.5' : 'left-0.5'
                        }`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* 저장 */}
          {isAdmin && (
            <div className="flex items-center gap-3 justify-end">
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : saved ? (
                  <><Check className="w-4 h-4" /> 저장됨</>
                ) : (
                  <><Save className="w-4 h-4" /> 저장하기</>
                )}
              </button>
            </div>
          )}

          {!isAdmin && (
            <p className="text-slate-600 text-xs text-center">관리자만 위젯 권한을 변경할 수 있습니다.</p>
          )}
        </div>
      )}
    </div>
  );
}

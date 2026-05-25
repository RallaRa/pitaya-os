'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/context/StoreContext';
import {
  SlidersHorizontal, Save, RotateCcw, ChevronDown, ChevronUp,
  Loader2, Check, AlertTriangle, Plus, X, ToggleLeft, ToggleRight,
  Thermometer, CloudRain, CalendarDays, Sparkles, Info,
} from 'lucide-react';

/* ── 타입 ── */
interface Condition {
  metric: string;
  operator: '>=' | '<=' | '==' | 'between' | 'in';
  value: number | number[] | boolean;
}

interface WeatherVariable {
  id: string;
  name: string;
  category: 'temperature' | 'precipitation' | 'event' | 'dayofweek';
  active: boolean;
  condition: Condition;
  itemEffects: Record<string, number>;
  description: string;
  dataSource: string;
  sampleCount: number;
}

/* ── 상수 ── */
const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  temperature:   { label: '기온',    icon: <Thermometer className="w-4 h-4" />, color: 'text-orange-400 bg-orange-900/30 border-orange-700/40' },
  precipitation: { label: '강수',    icon: <CloudRain   className="w-4 h-4" />, color: 'text-blue-400 bg-blue-900/30 border-blue-700/40' },
  event:         { label: '이벤트',  icon: <Sparkles    className="w-4 h-4" />, color: 'text-purple-400 bg-purple-900/30 border-purple-700/40' },
  dayofweek:     { label: '요일/날짜', icon: <CalendarDays className="w-4 h-4" />, color: 'text-teal-400 bg-teal-900/30 border-teal-700/40' },
};

const CATEGORY_ORDER = ['temperature', 'precipitation', 'dayofweek', 'event'];

function conditionLabel(c: Condition): string {
  const { metric, operator, value } = c;
  const metricMap: Record<string, string> = {
    tempMax: '최고기온', tempMin: '최저기온', precipProb: '강수확률',
    dayOfWeek: '요일', dayOfMonth: '날짜', holidayEve: '연휴전날',
  };
  const m = metricMap[metric] || metric;
  if (operator === 'between' && Array.isArray(value)) return `${m} ${value[0]}~${value[1]}`;
  if (operator === 'in'      && Array.isArray(value)) return `${m} in [${value.join(', ')}]`;
  if (operator === '=='      && value === true)       return `${m} = 예`;
  return `${m} ${operator} ${value}`;
}

/* ── 품목 영향도 편집 ── */
function ItemEffectsEditor({
  effects, onChange,
}: { effects: Record<string, number>; onChange: (v: Record<string, number>) => void }) {
  const [newItem, setNewItem] = useState('');
  const [newVal, setNewVal]   = useState('');

  const add = () => {
    const item = newItem.trim();
    const val  = Number(newVal);
    if (!item || isNaN(val)) return;
    onChange({ ...effects, [item]: val });
    setNewItem(''); setNewVal('');
  };

  const remove = (key: string) => {
    const next = { ...effects };
    delete next[key];
    onChange(next);
  };

  const update = (key: string, val: number) => onChange({ ...effects, [key]: val });

  return (
    <div className="space-y-2 mt-2">
      <p className="text-[11px] text-slate-500 font-semibold">품목 영향도 (% 증감)</p>
      {Object.keys(effects).length > 0 && (
        <div className="space-y-1">
          {Object.entries(effects).map(([item, val]) => (
            <div key={item} className="flex items-center gap-2">
              <span className="text-xs text-slate-300 flex-1">{item}</span>
              <input
                type="number" value={val}
                onChange={e => update(item, Number(e.target.value))}
                className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100 text-right focus:outline-none focus:border-teal-500"
              />
              <span className="text-[10px] text-slate-500">%</span>
              <button onClick={() => remove(item)} className="p-1 text-slate-600 hover:text-red-400 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <input
          value={newItem} onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="품목명 (예: 삼겹살)"
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-teal-500 placeholder:text-slate-600"
        />
        <input
          type="number" value={newVal} onChange={e => setNewVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="+20"
          className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100 text-center focus:outline-none focus:border-teal-500 placeholder:text-slate-600"
        />
        <button onClick={add} className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs transition-colors">
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

/* ── 변수 카드 ── */
function VariableCard({
  variable, onChange,
}: { variable: WeatherVariable; onChange: (v: WeatherVariable) => void }) {
  const [expanded, setExpanded] = useState(false);
  const meta = CATEGORY_META[variable.category];

  const set = <K extends keyof WeatherVariable>(k: K, v: WeatherVariable[K]) =>
    onChange({ ...variable, [k]: v });

  return (
    <div className={`rounded-xl border transition-all ${
      variable.active
        ? 'bg-slate-900 border-slate-700/60'
        : 'bg-slate-900/40 border-slate-800/40 opacity-60'
    }`}>
      {/* 헤더 행 */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* 활성 토글 */}
        <button
          onClick={() => set('active', !variable.active)}
          className="shrink-0 transition-colors"
        >
          {variable.active
            ? <ToggleRight className="w-6 h-6 text-teal-400" />
            : <ToggleLeft  className="w-6 h-6 text-slate-600" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-100">{variable.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${meta.color}`}>
              {conditionLabel(variable.condition)}
            </span>
            {variable.sampleCount > 0 && (
              <span className="text-[10px] text-slate-500">{variable.sampleCount}회 학습</span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate">{variable.description}</p>
        </div>

        <button
          onClick={() => setExpanded(v => !v)}
          className="shrink-0 p-1 text-slate-500 hover:text-slate-300 transition-colors"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* 확장 편집 영역 */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-800 space-y-3 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">변수명</label>
              <input
                value={variable.name}
                onChange={e => set('name', e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">데이터 출처</label>
              <input
                value={variable.dataSource}
                onChange={e => set('dataSource', e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-teal-500"
              />
            </div>
            <div className="col-span-2">
              <label className="text-[11px] text-slate-500 mb-1 block">설명</label>
              <input
                value={variable.description}
                onChange={e => set('description', e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          {/* 조건 미리보기 */}
          <div className="bg-slate-800/50 rounded-lg px-3 py-2">
            <p className="text-[10px] text-slate-500 mb-1">적용 조건 (자동 감지)</p>
            <p className="text-xs text-slate-300 font-mono">{conditionLabel(variable.condition)}</p>
          </div>

          <ItemEffectsEditor
            effects={variable.itemEffects}
            onChange={v => set('itemEffects', v)}
          />
        </div>
      )}
    </div>
  );
}

/* ── 메인 페이지 ── */
export default function PredictionVariablesPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || 'global';

  const [variables, setVariables] = useState<WeatherVariable[]>([]);
  const [original,  setOriginal]  = useState<WeatherVariable[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/weather-variables?storeId=${storeId}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setVariables(data.variables || []);
      setOriginal(data.variables || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const isDirty = JSON.stringify(variables) !== JSON.stringify(original);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/weather-variables', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, variables }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error('저장 실패');
      setOriginal(variables);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('변경사항을 취소하고 저장된 값으로 되돌릴까요?')) setVariables(original);
  };

  const updateVar = (updated: WeatherVariable) =>
    setVariables(vs => vs.map(v => v.id === updated.id ? updated : v));

  const grouped = CATEGORY_ORDER.map(cat => ({
    cat,
    items: variables.filter(v => v.category === cat),
  })).filter(g => g.items.length > 0);

  const activeCount   = variables.filter(v => v.active).length;
  const inactiveCount = variables.filter(v => !v.active).length;

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <SlidersHorizontal className="w-5 h-5 text-teal-400" />
            <h1 className="text-xl font-bold text-slate-100">예측 변수 설정</h1>
          </div>
          <p className="text-sm text-slate-400">
            날씨·요일·이벤트가 매출에 미치는 영향을 조정합니다.
          </p>
          {!loading && (
            <p className="text-xs text-slate-500 mt-1">
              활성 {activeCount}개 · 비활성 {inactiveCount}개
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          {isDirty && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 rounded-xl transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> 되돌리기
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs rounded-xl transition-all ${
              saved
                ? 'bg-green-700 text-white'
                : isDirty
                ? 'bg-teal-600 hover:bg-teal-500 text-white'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : saved ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {saved ? '저장됨' : '저장'}
          </button>
        </div>
      </div>

      {/* 안내 배너 */}
      <div className="flex items-start gap-2 bg-blue-950/30 border border-blue-700/30 rounded-xl px-4 py-3 mb-6">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-[11px] text-blue-300/80 space-y-0.5">
          <p>각 변수가 활성화되면 AI 매출 예측 시 해당 조건이 충족될 때 자동으로 반영됩니다.</p>
          <p>품목 영향도는 <strong>%(증감률)</strong> 형태로 입력하세요. 예: 삼겹살 +20, 국거리 -10</p>
        </div>
      </div>

      {/* 오류 */}
      {error && (
        <div className="flex items-center gap-2 bg-red-950/40 border border-red-700/40 rounded-xl px-4 py-3 mb-4">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {/* 로딩 */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 bg-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ cat, items }) => {
            const meta = CATEGORY_META[cat];
            return (
              <section key={cat}>
                <div className={`flex items-center gap-2 mb-3 text-sm font-semibold px-1 ${meta.color.split(' ')[0]}`}>
                  {meta.icon}
                  <span>{meta.label}</span>
                  <span className="text-[11px] font-normal text-slate-500 ml-1">
                    {items.filter(v => v.active).length}/{items.length} 활성
                  </span>
                </div>
                <div className="space-y-2">
                  {items.map(v => (
                    <VariableCard key={v.id} variable={v} onChange={updateVar} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* 하단 변경 알림 */}
      {isDirty && !loading && (
        <div className="fixed bottom-6 right-6 flex items-center gap-3 bg-slate-800 border border-teal-600/40 rounded-2xl px-5 py-3 shadow-2xl">
          <span className="text-xs text-slate-300">저장하지 않은 변경사항이 있습니다</span>
          <button
            onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs rounded-xl transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            저장
          </button>
        </div>
      )}
    </div>
  );
}

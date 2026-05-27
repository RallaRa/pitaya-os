'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ClipboardCheck, MessageCircle, ShoppingCart,
  Plus, X, BarChart2, Calendar, Sparkles, LineChart,
} from 'lucide-react';
import WidgetWrapper from './WidgetWrapper';

interface MenuItem { label: string; href: string; icon: string; }

const ALL_MENUS: MenuItem[] = [
  { label: '위생 점검일지', href: '/dashboard/hygiene',                icon: 'clipboard' },
  { label: '메신저',        href: '/dashboard/messenger',              icon: 'message'   },
  { label: 'AI 매입관리',   href: '/dashboard/report/purchases/input', icon: 'cart'      },
  { label: '일마감내역',    href: '/dashboard/report/view',            icon: 'bar'       },
  { label: '캘린더',        href: '/dashboard/hr/calendar',            icon: 'calendar'  },
  { label: 'AI 대화',       href: '/dashboard/ai',                     icon: 'sparkles'  },
  { label: '매출 추이',     href: '/dashboard/sales-forecast',         icon: 'linechart' },
];

const DEFAULT_ACTIVE = ['clipboard', 'message', 'cart', 'bar'];

const ICON_MAP: Record<string, React.ReactNode> = {
  clipboard: <ClipboardCheck className="w-5 h-5" />,
  message:   <MessageCircle className="w-5 h-5" />,
  cart:      <ShoppingCart  className="w-5 h-5" />,
  bar:       <BarChart2     className="w-5 h-5" />,
  calendar:  <Calendar      className="w-5 h-5" />,
  sparkles:  <Sparkles      className="w-5 h-5" />,
  linechart: <LineChart     className="w-5 h-5" />,
};

const ICON_COLOR: Record<string, string> = {
  clipboard: 'text-teal-400   bg-teal-500/10   hover:bg-teal-500/20',
  message:   'text-blue-400   bg-blue-500/10   hover:bg-blue-500/20',
  cart:      'text-orange-400 bg-orange-500/10 hover:bg-orange-500/20',
  bar:       'text-purple-400 bg-purple-500/10 hover:bg-purple-500/20',
  calendar:  'text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20',
  sparkles:  'text-pink-400   bg-pink-500/10   hover:bg-pink-500/20',
  linechart: 'text-green-400  bg-green-500/10  hover:bg-green-500/20',
};

export default function QuickMenuWidget({
  editMode, onRemove,
}: {
  editMode: boolean; onRemove: () => void;
}) {
  const [activeIcons,  setActiveIcons]  = useState<string[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_ACTIVE;
    try { return JSON.parse(localStorage.getItem('quickMenuIcons') || 'null') || DEFAULT_ACTIVE; }
    catch { return DEFAULT_ACTIVE; }
  });
  const [configMode, setConfigMode] = useState(false);

  const saveIcons = (icons: string[]) => {
    setActiveIcons(icons);
    try { localStorage.setItem('quickMenuIcons', JSON.stringify(icons)); } catch {}
  };

  const activeMenus = ALL_MENUS.filter(m => activeIcons.includes(m.icon));

  return (
    <WidgetWrapper
      title="⚡ 빠른 메뉴"
      editMode={editMode}
      onRemove={onRemove}
    >
      <div className="h-full p-2 flex flex-col">
        {/* 설정 버튼 */}
        {!editMode && (
          <div className="flex justify-end mb-1">
            <button
              onClick={() => setConfigMode(v => !v)}
              className="text-[9px] text-slate-600 hover:text-slate-400 px-2 py-0.5 rounded"
            >
              {configMode ? '완료' : '편집'}
            </button>
          </div>
        )}

        {/* 구성 모드: 항목 토글 */}
        {configMode ? (
          <div className="flex-1 overflow-y-auto space-y-1">
            {ALL_MENUS.map(m => (
              <button
                key={m.icon}
                onClick={() => {
                  const has = activeIcons.includes(m.icon);
                  saveIcons(has ? activeIcons.filter(i => i !== m.icon) : [...activeIcons, m.icon]);
                }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                  activeIcons.includes(m.icon)
                    ? 'bg-teal-600/20 text-teal-300 border border-teal-500/30'
                    : 'text-slate-500 hover:bg-slate-800'
                }`}
              >
                <span className="shrink-0">{ICON_MAP[m.icon]}</span>
                <span className="flex-1 text-left">{m.label}</span>
                {activeIcons.includes(m.icon) ? (
                  <X className="w-3 h-3 shrink-0" />
                ) : (
                  <Plus className="w-3 h-3 shrink-0" />
                )}
              </button>
            ))}
          </div>
        ) : (
          /* 일반 모드: 바로가기 그리드 */
          <div className="flex-1 grid grid-cols-2 gap-1.5 content-start">
            {activeMenus.map(m => (
              <Link
                key={m.icon}
                href={m.href}
                className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl text-center transition-colors ${
                  ICON_COLOR[m.icon] || 'text-slate-400 bg-slate-800 hover:bg-slate-700'
                }`}
              >
                {ICON_MAP[m.icon]}
                <span className="text-[9px] font-medium leading-tight">{m.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </WidgetWrapper>
  );
}

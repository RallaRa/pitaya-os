'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Sparkles, PenLine, ScrollText, Settings, Monitor } from 'lucide-react';
import {
  STOCK_TRADER_SIDEBAR_LINKS,
  isStockTraderSubLinkActive,
} from '@/lib/stock-trader/menuStructure';

const TAB_ICONS: Record<string, typeof LayoutGrid> = {
  '/dashboard/stock-trader': LayoutGrid,
  '/dashboard/stock-trader/trade': Monitor,
  '/dashboard/stock-trader/ai': Sparkles,
  '/dashboard/stock-trader/logs': ScrollText,
  '/dashboard/stock-trader/settings': Settings,
};

export default function StockTraderSubNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 px-2 sm:px-3 py-2 border-b border-slate-800 bg-slate-950/90 scrollbar-thin-x">
      {STOCK_TRADER_SIDEBAR_LINKS.map(tab => {
        const active = isStockTraderSubLinkActive(pathname, tab);
        const Icon = TAB_ICONS[tab.href] || LayoutGrid;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0 min-h-[2.75rem] ${
              active
                ? 'bg-amber-600/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

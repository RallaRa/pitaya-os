'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid, Sparkles, LineChart, ScrollText, Settings, Monitor, Bot, FileText, Home,
} from 'lucide-react';
import {
  STOCK_SUPERUSER_LINKS,
  isStockSuperuserLinkActive,
} from '@/lib/stock/menuStructure';

const ICONS: Record<string, typeof LayoutGrid> = {
  '/dashboard/superuser/stock': LayoutGrid,
  '/dashboard/superuser/stock/ai-engine': Sparkles,
  '/dashboard/superuser/stock/backtest': LineChart,
  '/dashboard/superuser/stock/journal': ScrollText,
  '/dashboard/stock-trader/trade': Monitor,
  '/dashboard/stock-trader/ai': Bot,
  '/dashboard/stock-trader/logs': FileText,
  '/dashboard/superuser/stock/settings': Settings,
  '/dashboard': Home,
};

export default function StockSuperuserSubNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 px-2 sm:px-3 py-2 border-b border-slate-800 bg-slate-950/90 overflow-x-auto scrollbar-thin-x">
      {STOCK_SUPERUSER_LINKS.map(tab => {
        const active = isStockSuperuserLinkActive(pathname, tab);
        const Icon = ICONS[tab.href] || LayoutGrid;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 min-h-[2.75rem] ${
              active
                ? 'bg-amber-600/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

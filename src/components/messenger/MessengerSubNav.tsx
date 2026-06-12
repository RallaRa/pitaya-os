'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle, BookOpen, FolderOpen, CalendarDays, LayoutGrid, FileText } from 'lucide-react';
import {
  MESSENGER_SIDEBAR_LINKS,
  isMessengerSubLinkActive,
} from '@/lib/messenger/menuStructure';

const TAB_ICONS: Record<string, typeof MessageCircle> = {
  '/dashboard/messenger': MessageCircle,
  '/dashboard/messenger/wiki': BookOpen,
  '/dashboard/messenger/files': FolderOpen,
  '/dashboard/messenger/calendar': CalendarDays,
  '/dashboard/messenger/tasks': LayoutGrid,
  '/dashboard/messenger/docs': FileText,
};

export default function MessengerSubNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 px-2 sm:px-3 py-2 border-b border-slate-800 bg-slate-950/90 scrollbar-thin-x safe-top">
      {MESSENGER_SIDEBAR_LINKS.map(tab => {
        const active = isMessengerSubLinkActive(pathname, tab);
        const Icon = TAB_ICONS[tab.href] || MessageCircle;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0 min-h-[2.75rem] ${
              active
                ? 'bg-teal-600/20 text-teal-300 border border-teal-500/30'
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

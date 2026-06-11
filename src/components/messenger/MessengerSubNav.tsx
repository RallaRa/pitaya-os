'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle, BookOpen, FolderOpen, CalendarDays, LayoutGrid, FileText } from 'lucide-react';

const TABS = [
  { href: '/dashboard/messenger', label: '채팅', icon: MessageCircle, exact: true },
  { href: '/dashboard/messenger/wiki', label: '위키', icon: BookOpen, exact: false },
  { href: '/dashboard/messenger/files', label: '파일', icon: FolderOpen, exact: false },
  { href: '/dashboard/messenger/calendar', label: '캘린더', icon: CalendarDays, exact: false },
  { href: '/dashboard/messenger/tasks', label: '칸반', icon: LayoutGrid, exact: false },
  { href: '/dashboard/messenger/docs', label: '문서', icon: FileText, exact: false },
] as const;

export default function MessengerSubNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 px-2 sm:px-3 py-2 border-b border-slate-800 bg-slate-950/90 scrollbar-thin-x safe-top">
      {TABS.map(tab => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        const Icon = tab.icon;
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

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2, ChevronRight, BookOpenCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { useLicense } from '@/hooks/useLicense';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { isSuperuserEmail } from '@/lib/auth/permissions';
import {
  ACCOUNTING_MENU_SECTIONS,
  canAccessAccountingSection,
  findAccountingMenuItem,
  findAccountingSection,
} from '@/lib/accounting/menuStructure';
import type { MenuAccessKey } from '@/lib/menuAccessKeys';

interface Props {
  children: React.ReactNode;
  title?: string;
  description?: string;
  /** 페이지별 추가 액션 버튼 */
  actions?: React.ReactNode;
}

export default function AccountingShell({ children, title, description, actions }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { currentStore } = useStore();
  const { hasModule } = useLicense();
  const [menuAccess, setMenuAccess] = useState<Partial<Record<MenuAccessKey, boolean>>>({});
  const [loading, setLoading] = useState(true);

  const isSuperuser = isSuperuserEmail(user?.email);
  const currentItem = findAccountingMenuItem(pathname);
  const currentSection = findAccountingSection(pathname);
  const pageTitle = title || currentItem?.label || '회계관리';
  const pageDesc = description || currentItem?.description || '';

  useEffect(() => {
    if (!currentStore?.storeId || !user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/permissions?type=myAccess&storeId=${encodeURIComponent(currentStore.storeId)}`,
          { headers },
        );
        const data = await res.json();
        if (!cancelled) setMenuAccess(data.menuAccess || {});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentStore?.storeId, user]);

  useEffect(() => {
    if (loading) return;
    if (isSuperuser) return;
    if (!hasModule('accounting')) {
      router.replace('/dashboard');
      return;
    }
    const hasAny = ACCOUNTING_MENU_SECTIONS.some(s =>
      canAccessAccountingSection(menuAccess, s.permission),
    ) || menuAccess.accounting;
    if (!hasAny) router.replace('/dashboard');
  }, [loading, menuAccess, isSuperuser, hasModule, router]);

  const visibleSections = ACCOUNTING_MENU_SECTIONS.filter(s =>
    isSuperuser || canAccessAccountingSection(menuAccess, s.permission),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
      </div>
    );
  }

  if (!hasModule('accounting') && !isSuperuser) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">
        회계 모듈 라이선스가 활성화되지 않았습니다. 설정 → 모듈에서 활성화하세요.
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-4rem)] gap-0">
      {/* 영림원형 좌측 메뉴 */}
      <aside className="lg:w-56 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950/80 overflow-y-auto">
        <div className="p-3 border-b border-slate-800">
          <Link
            href="/dashboard/accounting"
            className="flex items-center gap-2 text-sm font-semibold text-slate-100 hover:text-teal-300"
          >
            <BookOpenCheck className="w-4 h-4 text-teal-400" />
            회계관리
          </Link>
          <p className="text-[10px] text-slate-500 mt-1 pl-6">SystemEver 구조</p>
        </div>
        <nav className="p-2 space-y-3">
          {visibleSections.map(section => (
            <div key={section.id}>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-2 py-1">
                {section.label}
              </p>
              <ul className="space-y-0.5">
                {section.items.map(item => {
                  const active = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`block text-xs px-2 py-1.5 rounded-lg transition-colors ${
                          active
                            ? 'bg-teal-900/40 text-teal-200 font-medium'
                            : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* 본문 */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="shrink-0 px-4 py-3 border-b border-slate-800 bg-slate-900/40">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {currentSection && (
                <p className="text-[10px] text-slate-500 flex items-center gap-1 mb-0.5">
                  {currentSection.label}
                  <ChevronRight className="w-3 h-3" />
                  {pageTitle}
                </p>
              )}
              <h1 className="text-lg font-bold text-white">{pageTitle}</h1>
              {pageDesc && <p className="text-xs text-slate-400 mt-0.5">{pageDesc}</p>}
            </div>
            {actions && <div className="shrink-0 flex gap-2">{actions}</div>}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4">{children}</main>
      </div>
    </div>
  );
}

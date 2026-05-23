'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Store, Shield, Users, ChevronRight, Layers, UserCog, Loader2, LayoutGrid } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';

type MenuAccess = {
  ai: boolean; sales: boolean; purchase: boolean; report: boolean;
  messenger: boolean; members: boolean; store: boolean;
  permissionGroup: boolean; memberGroup: boolean;
};

export default function SettingsPage() {
  const { user } = useAuth();
  const { currentStore, storesLoaded } = useStore();
  const [menuAccess, setMenuAccess] = useState<MenuAccess | null>(null);
  const [accessLoaded, setAccessLoaded] = useState(false);

  useEffect(() => {
    if (!user?.uid || !storesLoaded) return;
    const storeId = currentStore?.storeId || '';
    const url = `/api/permissions?type=myAccess&uid=${user.uid}${storeId ? `&storeId=${storeId}` : ''}`;
    fetch(url)
      .then(r => r.json())
      .then(data => { if (data.menuAccess) setMenuAccess(data.menuAccess); })
      .finally(() => setAccessLoaded(true));
  }, [user?.uid, currentStore?.storeId, storesLoaded]);

  const allMenus = [
    {
      key: 'members' as const,
      href: '/dashboard/hr/members',
      icon: <Users className="w-5 h-5 text-blue-400" />,
      label: '멤버 관리',
      description: '소속 신청 승인/거절 및 멤버 목록 확인',
    },
    {
      key: 'store' as const,
      href: '/dashboard/settings/store',
      icon: <Store className="w-5 h-5 text-teal-400" />,
      label: '매장 정보',
      description: '매장 정보, 지역, 연결 계정 관리',
    },
    {
      key: 'permissionGroup' as const,
      href: '/dashboard/settings/permission-group',
      icon: <Layers className="w-5 h-5 text-purple-400" />,
      label: '권한 그룹 관리',
      description: '그룹별 메뉴 접근 권한 설정',
    },
    {
      key: 'memberGroup' as const,
      href: '/dashboard/settings/member-group',
      icon: <UserCog className="w-5 h-5 text-yellow-400" />,
      label: '멤버-그룹 연결',
      description: '멤버에게 권한 그룹 배정',
    },
  ];

  const adminOnlyMenus = [
    {
      href: '/dashboard/settings/widgets',
      icon: <LayoutGrid className="w-5 h-5 text-teal-400" />,
      label: '대시보드 위젯 권한',
      description: '역할별 위젯 표시 여부 설정',
      show: ['master', 'superuser', 'admin', 'owner'].includes(currentStore?.role || ''),
    },
  ].filter(m => m.show);

  const visibleMenus = menuAccess
    ? allMenus.filter(m => menuAccess[m.key])
    : [];

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-teal-400">설정</h1>
        <p className="text-slate-400 text-sm mt-1">
          Pitaya OS 운영 환경을 설정합니다.
        </p>
      </div>

      {!accessLoaded || !storesLoaded ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {visibleMenus.length === 0 && adminOnlyMenus.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">접근 가능한 설정 항목이 없습니다.</p>
          ) : (
            [...visibleMenus, ...adminOnlyMenus].map((menu) => (
              <Link
                key={menu.href}
                href={menu.href}
                className="flex items-center justify-between bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-teal-500/50 rounded-xl p-5 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-slate-800 group-hover:bg-slate-700 p-3 rounded-xl transition-colors">
                    {menu.icon}
                  </div>
                  <div>
                    <p className="text-white font-bold">{menu.label}</p>
                    <p className="text-slate-400 text-sm">{menu.description}</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-teal-400 transition-colors" />
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}

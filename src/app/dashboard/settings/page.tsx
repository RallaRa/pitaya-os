'use client';

import Link from 'next/link';
import { Store, Shield, Users, ChevronRight } from 'lucide-react';

const SETTING_MENUS = [
  {
    href: '/dashboard/settings/store',
    icon: <Store className="w-5 h-5 text-teal-400" />,
    label: '매장 설정',
    description: '매장 정보, 지역, 연결 계정 관리',
  },
  {
    href: '/dashboard/settings/members',
    icon: <Users className="w-5 h-5 text-blue-400" />,
    label: '멤버 관리',
    description: '소속 신청 승인/거절 및 멤버 목록 확인',
  },
  {
    href: '/dashboard/settings/permission',
    icon: <Shield className="w-5 h-5 text-yellow-400" />,
    label: '권한 설정',
    description: '역할별 메뉴 접근 권한 관리 (Superuser 전용)',
  },
  // {
  //   href: '/dashboard/settings/account',
  //   icon: <User className="w-5 h-5 text-blue-400" />,
  //   label: '계정 설정',
  //   description: '이름, 비밀번호, 로그인 정보',
  // },
  // {
  //   href: '/dashboard/settings/notification',
  //   icon: <Bell className="w-5 h-5 text-yellow-400" />,
  //   label: '알림 설정',
  //   description: '푸시 알림, 이메일 알림',
  // },
];

export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-teal-400">설정</h1>
        <p className="text-slate-400 text-sm mt-1">
          Pitaya OS 운영 환경을 설정합니다.
        </p>
      </div>

      <div className="space-y-3">
        {SETTING_MENUS.map((menu) => (
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
        ))}
      </div>
    </div>
  );
}

'use client';

import { Construction } from 'lucide-react';

export default function AccountingPlaceholder({ feature }: { feature: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center mb-4">
        <Construction className="w-6 h-6 text-slate-500" />
      </div>
      <p className="text-sm text-slate-300 font-medium">{feature}</p>
      <p className="text-xs text-slate-500 mt-2 max-w-sm leading-relaxed">
        영림원 회계관리와 동일한 메뉴·권한 구조가 준비되었습니다.
        화면 기능은 순차적으로 연결됩니다.
      </p>
    </div>
  );
}

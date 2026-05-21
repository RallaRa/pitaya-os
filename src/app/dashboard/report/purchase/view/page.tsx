'use client';

import { ShoppingCart } from 'lucide-react';

export default function PurchaseViewPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-slate-950 text-slate-100 p-8">
      <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-900 border border-slate-700 rounded-2xl mb-4">
        <ShoppingCart className="w-7 h-7 text-slate-500" />
      </div>
      <h1 className="text-xl font-bold text-slate-300 mb-2">매입 이력</h1>
      <p className="text-slate-500 text-sm">준비 중입니다</p>
    </div>
  );
}

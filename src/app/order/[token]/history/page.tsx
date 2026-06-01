'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

export default function PublicOrderHistoryPage() {
  const params = useParams();
  const router = useRouter();
  const token = String(params.token || '');

  useEffect(() => {
    router.replace(`/order/${token}`);
  }, [router, token]);

  return (
    <div className="max-w-lg mx-auto p-6 text-center">
      <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
      <p className="text-slate-300 mb-2">주문 내역은 매장에서만 확인할 수 있습니다.</p>
      <Link href={`/order/${token}`} className="text-sm text-teal-400 underline">
        주문 페이지로 돌아가기
      </Link>
    </div>
  );
}

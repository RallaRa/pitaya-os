'use client';

import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import AttendanceMap from '@/components/hr/AttendanceMap';
import { Clock } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

export default function AttendancePage() {
  const { user } = useAuth();
  const { currentStore } = useStore();

  const handleAttend = async (type: 'in' | 'out', lat: number, lng: number) => {
    if (!currentStore?.storeId || !user?.uid) return;

    const res = await fetch('/api/hr/attendance', {
      method: 'POST',
      headers: await getAuthJsonHeaders(),
      body: JSON.stringify({
        type: type === 'in' ? 'check_in' : 'check_out',
        lat,
        lng,
        storeId: currentStore.storeId,
        employeeId: user.uid,
      }),
    });
    const data = await res.json();
    if (data.error) alert(data.error);
    else alert(type === 'in' ? '출근 완료!' : '퇴근 완료!');
  };

  if (!currentStore?.storeId) {
    return (
      <div className="p-6 text-slate-400 text-sm">매장을 선택해주세요.</div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-5 h-5 text-teal-400" />
          <h1 className="text-xl font-bold text-slate-100">출퇴근</h1>
        </div>
        <p className="text-sm text-slate-500">
          {currentStore.storeName} · 매장 {200}m 이내에서만 출퇴근 가능
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6">
        <AttendanceMap onAttend={handleAttend} />
      </div>
    </div>
  );
}

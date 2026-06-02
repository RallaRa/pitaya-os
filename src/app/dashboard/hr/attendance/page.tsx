'use client';

import { useStore } from '@/context/StoreContext';
import AttendanceMap from '@/components/hr/AttendanceMap';
import { Clock } from 'lucide-react';
import { useAttendancePunch } from '@/hooks/useAttendancePunch';
import { DEFAULT_ATTENDANCE_RADIUS_M } from '@/lib/hr/attendanceGeo';

export default function AttendancePage() {
  const { currentStore } = useStore();
  const { geo, punch, checkInTime, checkOutTime } = useAttendancePunch();

  const handleAttend = async (type: 'in' | 'out', _lat: number, _lng: number) => {
    const result = await punch(type);
    alert(result.message);
  };

  if (!currentStore?.storeId) {
    return (
      <div className="p-6 text-slate-400 text-sm">매장을 선택해주세요.</div>
    );
  }

  const radiusM = geo.radiusM || DEFAULT_ATTENDANCE_RADIUS_M;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-5 h-5 text-teal-400" />
          <h1 className="text-xl font-bold text-slate-100">출퇴근</h1>
        </div>
        <p className="text-sm text-slate-500">
          {currentStore.storeName} · 매장 <strong className="text-slate-400">{radiusM}m</strong> 이내에서만 출퇴근 가능
        </p>
        <p className="text-xs text-slate-600 mt-1">
          오늘 출근 {checkInTime || '—'} · 퇴근 {checkOutTime || '—'}
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6">
        <AttendanceMap
          store={currentStore}
          storeName={currentStore.storeName}
          onAttend={handleAttend}
        />
      </div>

      <p className="text-xs text-slate-600 text-center">
        사이드바에서도 출·퇴근 버튼으로 기록할 수 있습니다.
      </p>
    </div>
  );
}

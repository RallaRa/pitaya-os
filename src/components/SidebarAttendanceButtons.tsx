'use client';

import Link from 'next/link';
import { LogIn, LogOut, MapPin, Loader2 } from 'lucide-react';
import { useAttendancePunch } from '@/hooks/useAttendancePunch';

export default function SidebarAttendanceButtons({ onClose }: { onClose?: () => void }) {
  const {
    geo,
    loading,
    statusLoading,
    checkInTime,
    checkOutTime,
    canCheckIn,
    canCheckOut,
    punch,
  } = useAttendancePunch();

  const handle = async (type: 'in' | 'out') => {
    const result = await punch(type);
    if (result.ok) alert(result.message);
    else alert(result.message);
  };

  return (
    <div className="mx-1 bg-slate-800/50 border border-slate-700/50 rounded-xl px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">출퇴근</p>
        <Link
          href="/dashboard/hr/attendance"
          onClick={onClose}
          className="text-[10px] text-teal-500 hover:text-teal-400"
        >
          지도
        </Link>
      </div>

      <p className="text-[10px] text-slate-500 flex items-center gap-1">
        <MapPin className="w-3 h-3 shrink-0" />
        {geo.name} · {geo.radiusM}m 이내
      </p>

      {statusLoading ? (
        <div className="h-8 bg-slate-800/60 rounded-lg animate-pulse" />
      ) : (
        <div className="flex items-center justify-between text-[10px] text-slate-400 tabular-nums">
          <span>출근 {checkInTime ? <strong className="text-blue-400">{checkInTime}</strong> : '—'}</span>
          <span>퇴근 {checkOutTime ? <strong className="text-orange-400">{checkOutTime}</strong> : '—'}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={loading || !canCheckIn}
          onClick={() => handle('in')}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
            canCheckIn && !loading
              ? 'bg-blue-600 hover:bg-blue-500 text-white'
              : 'bg-slate-700/80 text-slate-500 cursor-not-allowed'
          }`}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
          출근
        </button>
        <button
          type="button"
          disabled={loading || !canCheckOut}
          onClick={() => handle('out')}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
            canCheckOut && !loading
              ? 'bg-orange-600 hover:bg-orange-500 text-white'
              : 'bg-slate-700/80 text-slate-500 cursor-not-allowed'
          }`}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
          퇴근
        </button>
      </div>
    </div>
  );
}

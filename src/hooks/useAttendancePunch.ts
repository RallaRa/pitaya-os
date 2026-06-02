'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import {
  attendanceDistanceM,
  isWithinAttendanceRange,
  resolveAttendanceGeo,
} from '@/lib/hr/attendanceGeo';

export interface TodayAttendance {
  id?: string;
  checkIn?: { recordedAt?: string };
  checkOut?: { recordedAt?: string };
}

function formatRecordedAt(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  }
  if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  }
  return null;
}

export function useAttendancePunch() {
  const { user } = useAuth();
  const { currentStore } = useStore();
  const [today, setToday] = useState<TodayAttendance | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

  const storeId = currentStore?.storeId || '';
  const geo = resolveAttendanceGeo(currentStore);

  const loadToday = useCallback(async () => {
    if (!storeId || !user?.uid) {
      setToday(null);
      return;
    }
    setStatusLoading(true);
    try {
      const params = new URLSearchParams({ storeId, uid: user.uid });
      const res = await fetch(`/api/hr/attendance?${params}`, { headers: await getAuthHeaders() });
      const data = await res.json();
      const rec = (data.records || [])[0] as TodayAttendance | undefined;
      setToday(rec || null);
    } catch {
      setToday(null);
    } finally {
      setStatusLoading(false);
    }
  }, [storeId, user?.uid]);

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  const punch = useCallback(async (type: 'in' | 'out'): Promise<{ ok: boolean; message: string }> => {
    if (!storeId || !user?.uid) {
      return { ok: false, message: '매장·로그인 정보가 없습니다.' };
    }
    if (!navigator.geolocation) {
      return { ok: false, message: '이 기기에서는 위치 확인을 지원하지 않습니다.' };
    }

    setLoading(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      if (!isWithinAttendanceRange(lat, lng, currentStore)) {
        const dist = attendanceDistanceM(lat, lng, currentStore);
        return {
          ok: false,
          message: `매장 ${geo.radiusM}m 밖입니다 (${dist}m). 매장 근처에서 다시 시도해주세요.`,
        };
      }

      const res = await fetch('/api/hr/attendance', {
        method: 'POST',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({
          storeId,
          type: type === 'in' ? 'in' : 'out',
          lat,
          lng,
          employeeId: user.uid,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return { ok: false, message: data.error || '출퇴근 처리에 실패했습니다.' };
      }

      await loadToday();
      return {
        ok: true,
        message: type === 'in' ? '출근이 기록되었습니다.' : '퇴근이 기록되었습니다.',
      };
    } catch (e: unknown) {
      const msg = e instanceof GeolocationPositionError
        ? (e.code === 1 ? '위치 권한을 허용해주세요.' : '위치를 가져오지 못했습니다.')
        : e instanceof Error ? e.message : '출퇴근 처리 실패';
      return { ok: false, message: msg };
    } finally {
      setLoading(false);
    }
  }, [storeId, user?.uid, currentStore, geo.radiusM, loadToday]);

  const checkInTime = formatRecordedAt(today?.checkIn?.recordedAt);
  const checkOutTime = formatRecordedAt(today?.checkOut?.recordedAt);
  const canCheckIn = !today?.checkIn;
  const canCheckOut = !!today?.checkIn && !today?.checkOut;

  return {
    geo,
    today,
    loading,
    statusLoading,
    checkInTime,
    checkOutTime,
    canCheckIn,
    canCheckOut,
    punch,
    reload: loadToday,
  };
}

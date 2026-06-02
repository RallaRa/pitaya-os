import {
  calculateDistanceM,
  DEFAULT_ATTENDANCE_RADIUS_M,
  resolveStoreGeo,
  type StoreGeoInput,
} from '@/lib/kakao/location';

export { DEFAULT_ATTENDANCE_RADIUS_M };
export type { StoreGeoInput };

export function resolveAttendanceGeo(store?: StoreGeoInput | null) {
  const geo = resolveStoreGeo(store);
  return {
    ...geo,
    radiusM: store?.attendanceRadiusM ?? DEFAULT_ATTENDANCE_RADIUS_M,
  };
}

export function isWithinAttendanceRange(
  userLat: number,
  userLng: number,
  store?: StoreGeoInput | null,
): boolean {
  const geo = resolveAttendanceGeo(store);
  return calculateDistanceM(userLat, userLng, geo.lat, geo.lng) <= geo.radiusM;
}

export function attendanceDistanceM(
  userLat: number,
  userLng: number,
  store?: StoreGeoInput | null,
): number {
  const geo = resolveAttendanceGeo(store);
  return Math.round(calculateDistanceM(userLat, userLng, geo.lat, geo.lng));
}

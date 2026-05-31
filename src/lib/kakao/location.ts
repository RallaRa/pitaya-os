export const STORE_CONFIG = {
  lat: parseFloat(process.env.KAKAO_STORE_LAT || '37.5509'),
  lng: parseFloat(process.env.KAKAO_STORE_LNG || '126.8495'),
  radius: parseInt(process.env.KAKAO_ATTENDANCE_RADIUS || '200', 10),
  name: '강서정육점',
};

export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinStore(userLat: number, userLng: number): boolean {
  return calculateDistance(userLat, userLng, STORE_CONFIG.lat, STORE_CONFIG.lng) <= STORE_CONFIG.radius;
}

export function calculateDistanceM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  return calculateDistance(lat1, lng1, lat2, lng2);
}

export function resolveStoreGeo(store?: {
  attendanceLat?: number;
  attendanceLng?: number;
  attendanceRadiusM?: number;
} | null) {
  return {
    lat: store?.attendanceLat ?? STORE_CONFIG.lat,
    lng: store?.attendanceLng ?? STORE_CONFIG.lng,
    radiusM: store?.attendanceRadiusM ?? STORE_CONFIG.radius,
    name: STORE_CONFIG.name,
  };
}

export function isWithinStoreGeo(
  userLat: number,
  userLng: number,
  store?: { attendanceLat?: number; attendanceLng?: number; attendanceRadiusM?: number } | null,
): boolean {
  const geo = resolveStoreGeo(store);
  return calculateDistance(userLat, userLng, geo.lat, geo.lng) <= geo.radiusM;
}

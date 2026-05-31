'use client';

import { useEffect, useRef, useState } from 'react';
import { isWithinStore, calculateDistance, STORE_CONFIG } from '@/lib/kakao/location';
import { MapPin, CheckCircle, XCircle, Clock } from 'lucide-react';

declare global {
  interface Window {
    kakao?: {
      maps: {
        load: (cb: () => void) => void;
        LatLng: new (lat: number, lng: number) => unknown;
        Map: new (el: HTMLElement, opts: Record<string, unknown>) => unknown;
        Marker: new (opts: Record<string, unknown>) => unknown;
        Circle: new (opts: Record<string, unknown>) => unknown;
      };
    };
  }
}

export default function AttendanceMap({
  onAttend,
}: {
  onAttend: (type: 'in' | 'out', lat: number, lng: number) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [withinRange, setWithinRange] = useState<boolean | null>(null);
  const [distance, setDistance] = useState(0);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const jsKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
    if (!jsKey) {
      setLoading(false);
      return;
    }

    const script = document.createElement('script');
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${jsKey}&autoload=false`;
    script.onload = () => {
      window.kakao?.maps.load(() => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            setUserPos({ lat, lng });
            const dist = calculateDistance(lat, lng, STORE_CONFIG.lat, STORE_CONFIG.lng);
            setDistance(Math.round(dist));
            setWithinRange(isWithinStore(lat, lng));
            setLoading(false);

            if (!mapRef.current || !window.kakao?.maps) return;
            const map = new window.kakao.maps.Map(mapRef.current, {
              center: new window.kakao.maps.LatLng(STORE_CONFIG.lat, STORE_CONFIG.lng),
              level: 4,
            });

            new window.kakao.maps.Marker({
              map,
              position: new window.kakao.maps.LatLng(STORE_CONFIG.lat, STORE_CONFIG.lng),
              title: STORE_CONFIG.name,
            });

            new window.kakao.maps.Marker({
              map,
              position: new window.kakao.maps.LatLng(lat, lng),
              title: '현재 위치',
            });

            new window.kakao.maps.Circle({
              map,
              center: new window.kakao.maps.LatLng(STORE_CONFIG.lat, STORE_CONFIG.lng),
              radius: STORE_CONFIG.radius,
              strokeWeight: 2,
              strokeColor: dist <= STORE_CONFIG.radius ? '#10b981' : '#ef4444',
              strokeOpacity: 0.8,
              fillColor: dist <= STORE_CONFIG.radius ? '#10b981' : '#ef4444',
              fillOpacity: 0.1,
            });
          },
          () => setLoading(false),
          { enableHighAccuracy: true, timeout: 15000 },
        );
      });
    };
    document.head.appendChild(script);
    return () => { script.remove(); };
  }, []);

  return (
    <div className="space-y-4">
      <div ref={mapRef} className="w-full h-64 rounded-xl overflow-hidden bg-slate-800" />

      {loading ? (
        <p className="text-center text-slate-400 text-sm">위치 확인 중...</p>
      ) : withinRange === null ? (
        <p className="text-center text-red-400 text-sm">위치 권한을 허용해주세요</p>
      ) : (
        <div className="space-y-3">
          <div className={`flex items-center gap-3 p-3 rounded-xl ${
            withinRange ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-700'
          }`}>
            {withinRange
              ? <CheckCircle className="text-green-400 shrink-0" size={20} />
              : <XCircle className="text-red-400 shrink-0" size={20} />
            }
            <div>
              <p className={`text-sm font-medium ${withinRange ? 'text-green-300' : 'text-red-300'}`}>
                {withinRange ? '매장 범위 내' : '매장 범위 밖'}
              </p>
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {STORE_CONFIG.name}까지 {distance}m
                {!withinRange && ` (${STORE_CONFIG.radius}m 이내 필요)`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!withinRange}
              onClick={() => userPos && onAttend('in', userPos.lat, userPos.lng)}
              className={`py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 ${
                withinRange
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Clock size={16} />
              출근
            </button>
            <button
              type="button"
              disabled={!withinRange}
              onClick={() => userPos && onAttend('out', userPos.lat, userPos.lng)}
              className={`py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 ${
                withinRange
                  ? 'bg-orange-600 text-white hover:bg-orange-500'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Clock size={16} />
              퇴근
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

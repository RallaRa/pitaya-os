'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Camera, ExternalLink, Loader2, RefreshCw, Save, Settings2, Video,
} from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import type { CapsCamera, CapsStreamType } from '@/lib/caps/capsTypes';

interface CameraPublic {
  id: string;
  name: string;
  storeId?: string;
  storeName?: string;
  streamType: CapsStreamType;
  enabled: boolean;
}

function CameraTile({ camera }: { camera: CameraPublic }) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadStream = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/superuser/caps/stream-ticket', {
        method: 'POST',
        headers,
        body: JSON.stringify({ cameraId: camera.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '스트림 티켓 실패');
      const path = `${data.streamPath}${camera.streamType === 'snapshot' ? `&t=${Date.now()}` : ''}`;
      setSrc(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : '로드 실패');
    } finally {
      setLoading(false);
    }
  }, [camera.id, camera.streamType]);

  useEffect(() => {
    void loadStream();
    if (camera.streamType !== 'snapshot') return undefined;
    const iv = setInterval(() => { void loadStream(); }, 2500);
    return () => clearInterval(iv);
  }, [loadStream, camera.streamType]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
        <div>
          <p className="text-sm font-medium text-slate-200">{camera.name}</p>
          {camera.storeName && (
            <p className="text-[10px] text-slate-500">{camera.storeName}</p>
          )}
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
          {camera.streamType}
        </span>
      </div>
      <div className="aspect-video bg-black relative flex items-center justify-center">
        {loading && !src && (
          <Loader2 className="w-6 h-6 animate-spin text-slate-600" />
        )}
        {error && (
          <p className="text-xs text-red-400 px-3 text-center">{error}</p>
        )}
        {src && !error && camera.streamType === 'hls' && (
          <video
            src={src}
            className="w-full h-full object-contain"
            controls
            autoPlay
            muted
            playsInline
          />
        )}
        {src && !error && camera.streamType !== 'hls' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={camera.name}
            className="w-full h-full object-contain"
          />
        )}
      </div>
      <div className="px-3 py-2 flex justify-end">
        <button
          type="button"
          onClick={() => loadStream()}
          className="text-[10px] text-slate-500 hover:text-slate-300 inline-flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" /> 새로고침
        </button>
      </div>
    </div>
  );
}

export default function CapsSuperuserPage() {
  const [cameras, setCameras] = useState<CameraPublic[]>([]);
  const [camerasFull, setCamerasFull] = useState<CapsCamera[]>([]);
  const [capsliveUrl, setCapsliveUrl] = useState('https://capslive.co.kr');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editJson, setEditJson] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/superuser/caps/cameras', { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setCameras(data.cameras || []);
      setCamerasFull(data.camerasFull || []);
      setCapsliveUrl(data.capsliveUrl || 'https://capslive.co.kr');
      setEditJson(JSON.stringify(data.camerasFull || [], null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveConfig = async () => {
    setSaving(true);
    setMsg('');
    setError('');
    try {
      const parsed = JSON.parse(editJson) as CapsCamera[];
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/superuser/caps/cameras', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ cameras: parsed, capsliveUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
      setMsg('카메라 설정 저장됨');
      await load();
      setShowSettings(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <Link
        href="/dashboard/settings"
        className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-sm mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> 설정
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Camera className="w-5 h-5 text-purple-400" />
            캡스 CCTV (슈퍼유저)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            ADT 캡스 뷰가드 영상 — 공개 API 없음, NVR/HLS·MJPEG URL을 서버에 등록해 프록시합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={capsliveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 inline-flex items-center gap-1"
          >
            뷰가드 웹관제 <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            type="button"
            onClick={() => setShowSettings(s => !s)}
            className="text-xs px-3 py-1.5 rounded-lg border border-purple-500/30 text-purple-300 hover:bg-purple-950/30 inline-flex items-center gap-1"
          >
            <Settings2 className="w-3.5 h-3.5" /> 카메라 설정
          </button>
        </div>
      </div>

      {(error || msg) && (
        <p className={`text-sm mb-4 px-3 py-2 rounded-lg border ${error ? 'text-red-300 bg-red-950/30 border-red-500/20' : 'text-teal-300 bg-teal-950/20 border-teal-500/20'}`}>
          {error || msg}
        </p>
      )}

      {showSettings && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 mb-6">
          <h2 className="text-sm font-medium text-slate-200 mb-2">카메라 URL 설정</h2>
          <p className="text-xs text-slate-500 mb-3 leading-relaxed">
            각 카메라의 <code className="text-slate-400">streamUrl</code>은 NVR·녹화기에서 제공하는 HLS/MJPEG/스냅샷 URL입니다.
            Vercel 환경변수 <code className="text-slate-400">CAPS_CAMERAS_JSON</code>으로도 초기값을 넣을 수 있습니다.
          </p>
          <textarea
            value={editJson}
            onChange={e => setEditJson(e.target.value)}
            rows={12}
            className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs font-mono text-slate-200 mb-2"
          />
          <div className="flex gap-2 items-center">
            <label className="text-xs text-slate-500">뷰가드 URL</label>
            <input
              value={capsliveUrl}
              onChange={e => setCapsliveUrl(e.target.value)}
              className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-2 py-1 text-xs text-slate-200"
            />
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={saveConfig}
            className="mt-3 text-xs px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-600 text-white inline-flex items-center gap-1 disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            저장
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16 text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : cameras.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center">
          <Video className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400 mb-2">등록된 카메라가 없습니다.</p>
          <p className="text-xs text-slate-600 mb-4">
            「카메라 설정」에서 streamUrl을 추가하거나 서버에 CAPS_CAMERAS_JSON을 설정하세요.
          </p>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 text-white"
          >
            설정 열기
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cameras.map(cam => (
            <CameraTile key={cam.id} camera={cam} />
          ))}
        </div>
      )}
    </div>
  );
}

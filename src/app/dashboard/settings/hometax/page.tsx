'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Check, Copy, ExternalLink, Loader2, RefreshCw,
  Shield, Trash2, Upload,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

interface SessionStatus {
  connected: boolean;
  cookieCount: number;
  linkedAt: string | null;
  lastVerifiedAt: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
  lastSyncImported: number;
  autoSyncEnabled: boolean;
  syncLookbackDays: number;
  sessionValid: boolean | null;
  verify?: { valid: boolean; message: string };
}

interface SyncLogRow {
  id?: string;
  trigger: string;
  startDate: string;
  endDate: string;
  ok: boolean;
  sessionValid: boolean;
  message: string;
  imported: { total: number };
  skipped: { total: number };
  errors: string[];
  completedAt: string | null;
}

function fmt(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ko-KR');
  } catch {
    return iso;
  }
}

export default function HometaxSettingsPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [linkCode, setLinkCode] = useState('');
  const [linkExpires, setLinkExpires] = useState('');
  const [cookieInput, setCookieInput] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [syncLookbackDays, setSyncLookbackDays] = useState(90);
  const [syncLogs, setSyncLogs] = useState<SyncLogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const loadStatus = useCallback(async (verify = false) => {
    if (!storeId) return;
    setLoading(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const params = new URLSearchParams({ storeId });
      if (verify) params.set('verify', '1');
      const res = await fetch(`/api/purchases/hometax/status?${params}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setStatus(data);
      setAutoSyncEnabled(Boolean(data.autoSyncEnabled));
      setSyncLookbackDays(Number(data.syncLookbackDays || 90) || 90);
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  const loadSyncLogs = useCallback(async () => {
    if (!storeId) return;
    setLogsLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(`/api/purchases/hometax/logs?storeId=${encodeURIComponent(storeId)}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '이력 조회 실패');
      setSyncLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      setSyncLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, [storeId]);

  useEffect(() => { void loadStatus(); void loadSyncLogs(); }, [loadStatus, loadSyncLogs]);

  const createLinkCode = async () => {
    if (!storeId) return;
    setBusy('link');
    setMsg('');
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/purchases/hometax/link-code', {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '코드 생성 실패');
      setLinkCode(data.code);
      setLinkExpires(data.expiresAt);
      setMsg(`${data.expiresInSec}초 내 Chrome 확장에서 코드를 입력하세요.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '코드 생성 실패');
    } finally {
      setBusy('');
    }
  };

  const copyCode = async () => {
    if (!linkCode) return;
    await navigator.clipboard.writeText(linkCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveManualCookies = async () => {
    if (!storeId || !cookieInput.trim()) return;
    setBusy('save');
    setMsg('');
    setError('');
    try {
      let cookies: unknown = cookieInput.trim();
      try {
        cookies = JSON.parse(cookieInput.trim());
      } catch {
        /* document.cookie 형태 허용 */
      }

      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/purchases/hometax/session', {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId, cookies }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
      setMsg(`홈택스 세션 ${data.cookieCount}개 쿠키 저장됨`);
      setCookieInput('');
      await loadStatus(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setBusy('');
    }
  };

  const verifySession = async () => {
    setBusy('verify');
    setMsg('');
    setError('');
    try {
      await loadStatus(true);
      setMsg('세션 검증을 완료했습니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '검증 실패');
    } finally {
      setBusy('');
    }
  };

  const syncNow = async () => {
    if (!storeId) return;
    setBusy('sync');
    setMsg('');
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/purchases/hometax/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId, lookbackDays: syncLookbackDays }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '동기화 실패');
      const skipped = data.skipped?.total ?? 0;
      setMsg(skipped > 0 && data.imported?.total > 0
        ? `${data.message} (중복 ${skipped}건 제외)`
        : (data.message || '동기화 완료'));
      await loadStatus();
      await loadSyncLogs();
    } catch (e) {
      setError(e instanceof Error ? e.message : '동기화 실패');
    } finally {
      setBusy('');
    }
  };

  const saveAutoSyncSettings = async () => {
    if (!storeId || !status?.connected) return;
    setBusy('autosync');
    setMsg('');
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/purchases/hometax/settings', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          storeId,
          autoSyncEnabled,
          syncLookbackDays,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '설정 저장 실패');
      setMsg(autoSyncEnabled
        ? `자동 동기화 켜짐 — 매일 07:00 KST, 최근 ${syncLookbackDays}일`
        : '자동 동기화 꺼짐');
      await loadStatus();
      await loadSyncLogs();
    } catch (e) {
      setError(e instanceof Error ? e.message : '설정 저장 실패');
    } finally {
      setBusy('');
    }
  };

  const disconnect = async () => {
    if (!storeId || !confirm('홈택스 연결을 해제하시겠습니까?')) return;
    setBusy('disconnect');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(
        `/api/purchases/hometax/session?storeId=${encodeURIComponent(storeId)}`,
        { method: 'DELETE', headers },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '해제 실패');
      setMsg('연결이 해제되었습니다.');
      setLinkCode('');
      await loadStatus();
      await loadSyncLogs();
    } catch (e) {
      setError(e instanceof Error ? e.message : '해제 실패');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <Link
        href="/dashboard/settings"
        className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-sm mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> 설정
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">홈택스 연동</h1>
          <p className="text-sm text-slate-400 mt-1">
            로그인 세션(쿠키)만 암호화 저장 · 비밀번호·인증서 파일은 저장하지 않습니다
          </p>
        </div>
        <Link
          href="/dashboard/report/purchases/reconciliation"
          className="text-xs px-2.5 py-1.5 rounded-lg border border-teal-500/30 text-teal-300 hover:bg-teal-950/40 shrink-0"
        >
          증빙 3자 대조 →
        </Link>
      </div>

      {!storeId && (
        <p className="text-sm text-amber-300 bg-amber-950/30 border border-amber-500/20 rounded-lg px-3 py-2">
          매장을 선택한 뒤 설정하세요.
        </p>
      )}

      {(error || msg) && (
        <p className={`text-sm mb-4 px-3 py-2 rounded-lg border ${error ? 'text-red-300 bg-red-950/30 border-red-500/20' : 'text-teal-300 bg-teal-950/20 border-teal-500/20'}`}>
          {error || msg}
        </p>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-teal-400" />
          <h2 className="text-sm font-medium text-slate-200">연결 상태</h2>
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />}
        </div>

        {status && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <dt className="text-slate-500">연결</dt>
            <dd className={status.connected ? 'text-teal-300' : 'text-slate-400'}>
              {status.connected ? `연결됨 (${status.cookieCount} cookies)` : '미연결'}
            </dd>
            <dt className="text-slate-500">마지막 연결</dt>
            <dd className="text-slate-300">{fmt(status.linkedAt)}</dd>
            <dt className="text-slate-500">세션 검증</dt>
            <dd className="text-slate-300">{fmt(status.lastVerifiedAt)}</dd>
            <dt className="text-slate-500">마지막 동기화</dt>
            <dd className="text-slate-300">{fmt(status.lastSyncAt)}</dd>
            <dt className="text-slate-500">상태</dt>
            <dd className="text-slate-300">{status.lastSyncMessage || status.lastSyncStatus || '—'}</dd>
          </dl>
        )}

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            disabled={!storeId || !!busy}
            onClick={() => loadStatus()}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 inline-flex items-center gap-1 disabled:opacity-40"
          >
            <RefreshCw className="w-3.5 h-3.5" /> 새로고침
          </button>
          <button
            type="button"
            disabled={!storeId || !status?.connected || !!busy}
            onClick={verifySession}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          >
            세션 검증
          </button>
          <button
            type="button"
            disabled={!storeId || !status?.connected || !!busy}
            onClick={syncNow}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-600 text-white inline-flex items-center gap-1 disabled:opacity-40"
          >
            {busy === 'sync' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            홈택스 동기화
          </button>
          {status?.connected && (
            <button
              type="button"
              disabled={!!busy}
              onClick={disconnect}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-950/30 inline-flex items-center gap-1 disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" /> 연결 해제
            </button>
          )}
        </div>
      </div>

      {status?.connected && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 mb-4">
          <h2 className="text-sm font-medium text-slate-200 mb-2">자동 동기화</h2>
          <p className="text-xs text-slate-500 mb-3 leading-relaxed">
            매일 오전 7시(KST)에 홈택스 증빙을 자동 수집합니다. 중복 건은 제외됩니다.
          </p>
          <label className="flex items-center gap-2 text-sm text-slate-300 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSyncEnabled}
              onChange={e => setAutoSyncEnabled(e.target.checked)}
              disabled={!!busy}
              className="rounded border-slate-600"
            />
            자동 동기화 사용
          </label>
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">조회 기간 (일)</label>
              <input
                type="number"
                min={7}
                max={365}
                value={syncLookbackDays}
                onChange={e => setSyncLookbackDays(Number(e.target.value) || 90)}
                disabled={!!busy}
                className="w-24 rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs text-slate-200"
              />
            </div>
            <button
              type="button"
              disabled={!storeId || !!busy}
              onClick={saveAutoSyncSettings}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-40"
            >
              {busy === 'autosync' ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : null}
              {' '}설정 저장
            </button>
          </div>
          <p className="text-[10px] text-slate-600">
            세션이 만료되면 자동 동기화가 실패합니다. 매일 06:30에 만료 알림을 보냅니다. Chrome 확장으로 세션을 갱신하세요.
          </p>
        </div>
      )}

      {status?.connected && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 mb-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-medium text-slate-200">동기화 이력</h2>
            <button
              type="button"
              disabled={logsLoading || !storeId}
              onClick={() => loadSyncLogs()}
              className="text-[10px] px-2 py-1 rounded border border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-40"
            >
              {logsLoading ? '…' : '새로고침'}
            </button>
          </div>
          {syncLogs.length === 0 ? (
            <p className="text-xs text-slate-600">동기화 이력이 없습니다.</p>
          ) : (
            <ul className="space-y-2 max-h-56 overflow-y-auto">
              {syncLogs.map(log => (
                <li
                  key={log.id || `${log.completedAt}-${log.message}`}
                  className="text-xs rounded-lg bg-slate-950/60 border border-slate-800 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={log.ok ? 'text-teal-300' : 'text-amber-300'}>
                      {log.trigger === 'cron' ? '자동' : '수동'}
                      {' · '}
                      {log.imported?.total ?? 0}건 신규
                      {(log.skipped?.total ?? 0) > 0 && ` · ${log.skipped.total}건 중복`}
                    </span>
                    <span className="text-slate-600 shrink-0">{fmt(log.completedAt)}</span>
                  </div>
                  <p className="text-slate-400">{log.message}</p>
                  {log.errors?.length > 0 && (
                    <p className="text-red-400/80 mt-1 truncate" title={log.errors.join(', ')}>
                      {log.errors[0]}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 mb-4">
        <h2 className="text-sm font-medium text-slate-200 mb-2">① Chrome 확장 연결</h2>
        <p className="text-xs text-slate-500 mb-3 leading-relaxed">
          Pitaya Chrome 확장이 홈택스 로그인 쿠키를 Pitaya로 전달합니다. 비밀번호·인증서는 저장하지 않습니다.
        </p>
        <ol className="text-xs text-slate-500 space-y-1 mb-3 list-decimal list-inside leading-relaxed">
          <li>Chrome → 확장 프로그램 → 개발자 모드 → 「압축해제된 확장 프로그램을 로드합니다」</li>
          <li>
            프로젝트{' '}
            <code className="text-slate-400">extensions/pitaya-hometax</code>
            {' '}폴더 선택
          </li>
          <li>아래 「연결 코드 발급」 → 확장 팝업에 코드 입력 → 홈택스 로그인 상태에서 연결</li>
        </ol>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            disabled={!storeId || !!busy}
            onClick={createLinkCode}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-40"
          >
            연결 코드 발급
          </button>
          {linkCode && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950 border border-teal-500/30">
              <span className="font-mono text-teal-300 text-sm tracking-widest">{linkCode}</span>
              <button type="button" onClick={copyCode} className="text-slate-400 hover:text-white">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
          {linkExpires && (
            <span className="text-[10px] text-slate-600">만료 {fmt(linkExpires)}</span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="text-sm font-medium text-slate-200 mb-2">② 수동 세션 연결 (테스트용)</h2>
        <ol className="text-xs text-slate-500 space-y-1 mb-3 list-decimal list-inside leading-relaxed">
          <li>
            <a
              href="https://www.hometax.go.kr"
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal-400 hover:underline inline-flex items-center gap-0.5"
            >
              홈택스 <ExternalLink className="w-3 h-3" />
            </a>
            에서 공동인증서/간편인증으로 로그인
          </li>
          <li>브라우저 개발자도구 → Application → Cookies → hometax.go.kr</li>
          <li>쿠키를 JSON 배열 <code className="text-slate-400">[{`{name,value}`}]</code> 형태로 붙여넣기</li>
        </ol>
        <textarea
          value={cookieInput}
          onChange={e => setCookieInput(e.target.value)}
          disabled={!storeId || !!busy}
          rows={6}
          placeholder={'[{"name":"TXPPsessionID","value":"..."},{"name":"...","value":"..."}]'}
          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-teal-600 disabled:opacity-50"
        />
        <button
          type="button"
          disabled={!storeId || !cookieInput.trim() || !!busy}
          onClick={saveManualCookies}
          className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-600 text-white disabled:opacity-40 inline-flex items-center gap-1"
        >
          {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          세션 저장
        </button>
        <p className="text-[10px] text-slate-600 mt-2">
          쿠키는 AES-256-GCM으로 암호화되어 Firestore에 저장됩니다. 세션 만료 시 다시 로그인 후 저장하세요.
        </p>
      </div>
    </div>
  );
}

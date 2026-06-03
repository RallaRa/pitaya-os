'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Smartphone, Copy, Check, Loader2, ChevronDown, ChevronUp, ArrowRight,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

interface HookConfig {
  enabled: boolean;
  openChatRoomName: string;
  sourceChatTitle: string;
  notifyKeywords: string[];
}

interface AndroidProfile {
  steps: string[];
  openChatRoomName: string;
  sourceChatTitle: string;
  notifyKeywords: string[];
}

interface Props {
  storeId: string;
}

export default function PublicOrderKakaoHookSettings({ storeId }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [config, setConfig] = useState<HookConfig | null>(null);
  const [profile, setProfile] = useState<AndroidProfile | null>(null);
  const [flow, setFlow] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [keywordInput, setKeywordInput] = useState('');

  const load = useCallback(async () => {
    if (!storeId || !user?.uid) return;
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(
        `/api/public-orders/kakao-hook?storeId=${encodeURIComponent(storeId)}`,
        { headers },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConfig(data.config);
      setProfile(data.androidProfile);
      setFlow(data.flow || []);
      setKeywordInput((data.config?.notifyKeywords || []).join(', '));
      setCanManage(!!data.canManage);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : '설정 불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId, user?.uid]);

  useEffect(() => { load(); }, [load]);

  const save = async (patch: Partial<HookConfig>) => {
    if (!canManage) return;
    setSaving(true);
    setMsg('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/public-orders/kakao-hook', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ storeId, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConfig(data.config);
      setProfile(data.androidProfile);
      setMsg('저장되었습니다');
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const saveKeywords = () => {
    const notifyKeywords = keywordInput
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    save({ notifyKeywords });
  };

  const copySteps = () => {
    if (!profile?.steps) return;
    navigator.clipboard.writeText(profile.steps.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!storeId) return null;

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-800/50"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <Smartphone className="w-4 h-4 text-yellow-400" />
          내 카톡 → 오픈채팅 전달 (안드로이드)
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-slate-800 space-y-3 text-xs text-slate-400">
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-teal-400 my-4" />
          ) : config ? (
            <>
              <p className="pt-3 leading-relaxed text-[11px]">
                Pitaya는 공개주문 접수 시 이미 <strong className="text-slate-300">카카오 「나에게 보내기」</strong>로
                알립니다. 서버는 여기까지이고, 폰에서는 그 알림만 잡아
                아래에 적은 <strong className="text-slate-300">오픈채팅방</strong>에 붙여 넣으면 됩니다.
              </p>

              {flow.length > 0 && (
                <ol className="space-y-1.5 text-[11px]">
                  {flow.map((step, i) => (
                    <li key={step} className="flex items-start gap-2 text-slate-500">
                      <span className="text-teal-500 font-mono shrink-0">{i + 1}.</span>
                      <span>{step.replace(/^\d+\.\s*/, '')}</span>
                    </li>
                  ))}
                </ol>
              )}

              <div className="flex items-center gap-2 text-[10px] text-slate-500 py-1">
                <span className="px-2 py-1 rounded bg-slate-800">나에게 보내기 알림</span>
                <ArrowRight className="w-3 h-3" />
                <span className="px-2 py-1 rounded bg-yellow-900/30 text-yellow-200/90">오픈채팅방</span>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  disabled={!canManage || saving}
                  onChange={e => save({ enabled: e.target.checked })}
                  className="rounded border-slate-600"
                />
                <span className="text-slate-300">안드로이드 자동 전달 사용 (설정·가이드 표시)</span>
              </label>

              <div>
                <label className="block text-[10px] text-slate-500 mb-1">
                  전달할 오픈채팅·단체방 이름 (카톡 검색용, 일부 일치)
                </label>
                <input
                  value={config.openChatRoomName}
                  disabled={!canManage}
                  onChange={e => setConfig({ ...config, openChatRoomName: e.target.value })}
                  onBlur={() => canManage && save({ openChatRoomName: config.openChatRoomName })}
                  placeholder="예: 한우특판 주문 오픈채팅"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-200"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 mb-1">
                  후킹할 알림 채팅 (보통 「나와의 채팅」)
                </label>
                <input
                  value={config.sourceChatTitle}
                  disabled={!canManage}
                  onChange={e => setConfig({ ...config, sourceChatTitle: e.target.value })}
                  onBlur={() => canManage && save({ sourceChatTitle: config.sourceChatTitle })}
                  placeholder="나와의 채팅"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-200"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 mb-1">
                  알림에 포함될 키워드 (쉼표 구분, 공개주문만 걸러냄)
                </label>
                <div className="flex gap-2">
                  <input
                    value={keywordInput}
                    disabled={!canManage}
                    onChange={e => setKeywordInput(e.target.value)}
                    placeholder="공개 주문, Pitaya"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-200"
                  />
                  {canManage && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={saveKeywords}
                      className="px-3 py-2 rounded-lg bg-teal-700/80 text-white text-[10px] shrink-0"
                    >
                      저장
                    </button>
                  )}
                </div>
              </div>

              {config.enabled && profile && (
                <div className="bg-slate-950 rounded-xl p-3 border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] text-slate-500 font-medium">MacroDroid / Tasker 조건</p>
                    <button
                      type="button"
                      onClick={copySteps}
                      className="flex items-center gap-1 text-teal-400 hover:text-teal-300 text-[10px]"
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      복사
                    </button>
                  </div>
                  <ul className="space-y-1 text-[10px] text-slate-500">
                    {profile.steps.map((s, i) => (
                      <li key={i}>· {s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {msg && <p className="text-[10px] text-teal-400">{msg}</p>}
              {!canManage && (
                <p className="text-[10px] text-amber-500/90">설정 변경은 매장 관리자만 가능합니다.</p>
              )}
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}

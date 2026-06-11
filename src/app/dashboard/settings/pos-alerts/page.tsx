'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, Loader2, Save, Check } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { useAuth } from '@/context/AuthContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { isSuperuserEmail } from '@/lib/auth/permissions';
import type { PosAlertSettings } from '@/lib/pos/posAlertSettings';

export default function PosAlertsSettingsPage() {
  const { currentStore } = useStore();
  const { user } = useAuth();
  const storeId = currentStore?.storeId || '';
  const canManage = isSuperuserEmail(user?.email)
    || ['owner', 'admin', 'master', 'superuser'].includes(currentStore?.role || '');

  const [settings, setSettings] = useState<PosAlertSettings>({
    realtimeSaleEnabled: true,
    dailyCloseEnabled: true,
    goodsSyncNotifyEnabled: true,
    itemSpeedAlertEnabled: true,
    firstPurchaseEnabled: true,
    vipVisitEnabled: true,
    regularVisitEnabled: false,
    discountAbuseEnabled: true,
    transactionAnomalyEnabled: true,
    repurchaseReminderEnabled: true,
    signageAutoSwitchEnabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!storeId) { setLoading(false); return; }
    getAuthJsonHeaders()
      .then(h => fetch(`/api/store/pos-alerts?storeId=${encodeURIComponent(storeId)}`, { headers: h }))
      .then(r => r.json())
      .then(d => { if (d.settings) setSettings(d.settings); })
      .catch(() => setError('불러오기 실패'))
      .finally(() => setLoading(false));
  }, [storeId]);

  const save = async () => {
    if (!storeId || !canManage) return;
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/store/pos-alerts', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ storeId, settings }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
      if (data.settings) setSettings(data.settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  if (!storeId) return <div className="p-6 text-slate-400 text-sm">매장을 선택해주세요.</div>;
  if (!canManage) return <div className="p-6 text-center text-slate-400">master/admin 이상만 변경 가능합니다.</div>;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link href="/dashboard/settings" className="flex items-center gap-2 text-slate-400 hover:text-teal-400 text-sm mb-6 w-fit">
        <ArrowLeft className="w-4 h-4" /> 설정으로 돌아가기
      </Link>
      <div className="flex items-center gap-2 mb-2">
        <Bell className="w-5 h-5 text-teal-400" />
        <h1 className="text-lg font-bold text-teal-400">POS 알림 설정</h1>
      </div>
      {error && <div className="mb-4 p-3 bg-red-900/30 border border-red-500/30 rounded-xl text-red-400 text-sm">{error}</div>}
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-12 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중...</div>
      ) : (
        <div className="space-y-4">
          {([
            ['realtimeSaleEnabled', '실시간 매출 알림', '신규 결제(SaT) 감지 시 💰매출알림 채널로 즉시 알림'],
            ['dailyCloseEnabled', '일 마감 리포트', 'Finish 마감 확정 시 AI 코멘트 + 💰매출알림 발송'],
            ['goodsSyncNotifyEnabled', '품목 변경 알림', 'Goods 추가·삭제·가격변경 시 💰매출알림 (5분 주기)'],
            ['itemSpeedAlertEnabled', '품목 판매 속도', '최근 1시간 vs 7일 동시간대 평균 200%↑ 시 💰매출알림 (30분 주기)'],
            ['firstPurchaseEnabled', '신규 고객 방문', '회원번호(Cus_Code) 첫 방문 시 💰매출알림 + 자정 일일 리포트'],
            ['vipVisitEnabled', 'VIP 고객 방문', 'pitayaGrade VIP 방문 시 09~21시 💰매출알림'],
            ['regularVisitEnabled', '단골 고객 방문', 'pitayaGrade 단골 방문 시 09~21시 💰매출알림 (기본 OFF)'],
            ['discountAbuseEnabled', '할인 중복 감지', '같은 영수증 할인 2회↑ 시 🌙야간모니터링 즉시 알림'],
            ['transactionAnomalyEnabled', '이상 거래 감지', '마이너스·야간·대량·고할인 거래 🌙야간모니터링'],
            ['repurchaseReminderEnabled', '재구매 주기 알림', '6개월 평균 주기+2일 초과 시 notification_queue 등록 (자정)'],
            ['signageAutoSwitchEnabled', '사이니지 자동 전환', '1시간 TOP1 품목 → signage_content 자동 갱신 (기본 OFF)'],
          ] as const).map(([key, title, desc]) => (
            <label key={key} className="flex items-start gap-3 p-4 rounded-xl border border-slate-800 bg-slate-900/60 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 accent-teal-400"
                checked={settings[key]}
                onChange={e => setSettings(prev => ({ ...prev, [key]: e.target.checked }))}
              />
              <span>
                <span className="block text-slate-100 font-medium">{title}</span>
                <span className="block text-slate-400 text-sm mt-1">{desc}</span>
              </span>
            </label>
          ))}
          <button type="button" onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/40">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? '저장됨' : '저장'}
          </button>
        </div>
      )}
    </div>
  );
}

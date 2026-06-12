'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Save, Send } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import AccountingShell from '@/components/accounting/AccountingShell';
import VoucherLineSheet, { type CodeNameOption, type PartnerOption } from '@/components/accounting/VoucherLineSheet';
import VoucherEntryAiChat from '@/components/accounting/VoucherEntryAiChat';
import type { VoucherAiDraft } from '@/lib/accounting/voucherAiPrompt';
import { todayYMD } from '@/components/accounting/accountingDateUtils';
import {
  VOUCHER_STATUS_LABELS,
  VOUCHER_TYPE_LABELS,
  type AccountingAccount,
  type VoucherLine,
  type VoucherType,
} from '@/lib/accounting/types';

const EMPTY_LINE = (): VoucherLine => ({
  lineNo: 1,
  accountCode: '',
  accountName: '',
  partnerCode: '',
  partnerName: '',
  deptCode: '',
  projectCode: '',
  debit: 0,
  credit: 0,
  memo: '',
});

interface Props {
  voucherId?: string;
  defaultVoucherType?: VoucherType;
  title?: string;
  fundMode?: boolean;
}

export default function VoucherEntryForm({
  voucherId,
  defaultVoucherType = 'general',
  title,
  fundMode,
}: Props) {
  const router = useRouter();
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [depts, setDepts] = useState<CodeNameOption[]>([]);
  const [projects, setProjects] = useState<CodeNameOption[]>([]);
  const [loading, setLoading] = useState(!!voucherId);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [voucherNo, setVoucherNo] = useState('');
  const [status, setStatus] = useState('draft');
  const [voucherDate, setVoucherDate] = useState(todayYMD());
  const [voucherType, setVoucherType] = useState<VoucherType>(defaultVoucherType);
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<VoucherLine[]>([EMPTY_LINE(), EMPTY_LINE()]);

  const entryAccounts = useMemo(() => {
    const list = accounts.filter(a => a.allowEntry !== false);
    if (fundMode) {
      return list.filter(a => a.isFundAccount || ['101', '102', '103'].includes(String(a.code)));
    }
    return list;
  }, [accounts, fundMode]);

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const l of lines) {
      debit += Number(l.debit || 0);
      credit += Number(l.credit || 0);
    }
    return { debit, credit, balanced: debit === credit && debit > 0 };
  }, [lines]);

  const loadMasterData = useCallback(async () => {
    if (!storeId) return;
    const headers = await getAuthJsonHeaders();
    const [accRes, supRes, deptRes, projRes] = await Promise.all([
      fetch(`/api/accounting/accounts?storeId=${encodeURIComponent(storeId)}`, { headers }),
      fetch(`/api/suppliers?storeId=${encodeURIComponent(storeId)}`, { headers }),
      fetch(`/api/accounting/management-items?storeId=${encodeURIComponent(storeId)}&type=dept`, { headers }),
      fetch(`/api/accounting/management-items?storeId=${encodeURIComponent(storeId)}&type=project`, { headers }),
    ]);
    const [accData, supData, deptData, projData] = await Promise.all([
      accRes.json(),
      supRes.json(),
      deptRes.json(),
      projRes.json(),
    ]);
    if (accRes.ok) setAccounts(accData.accounts || []);
    if (supRes.ok) {
      setPartners((supData.suppliers || []).map((s: { id: string; supplierName: string }) => ({
        id: s.id,
        supplierName: s.supplierName,
      })));
    }
    if (deptRes.ok) {
      setDepts((deptData.items || []).map((i: { code: string; name: string }) => ({
        code: i.code,
        name: i.name,
      })));
    }
    if (projRes.ok) {
      setProjects((projData.items || []).map((i: { code: string; name: string }) => ({
        code: i.code,
        name: i.name,
      })));
    }
  }, [storeId]);

  const loadVoucher = useCallback(async () => {
    if (!storeId || !voucherId) return;
    setLoading(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(
        `/api/accounting/vouchers?storeId=${encodeURIComponent(storeId)}&id=${encodeURIComponent(voucherId)}`,
        { headers },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      const v = data.voucher;
      setVoucherNo(String(v.voucherNo || ''));
      setStatus(String(v.status || 'draft'));
      setVoucherDate(String(v.voucherDate || todayYMD()));
      setVoucherType(v.voucherType || defaultVoucherType);
      setDescription(String(v.description || ''));
      setLines((v.lines || [EMPTY_LINE(), EMPTY_LINE()]).map((l: VoucherLine, i: number) => ({
        ...l,
        lineNo: i + 1,
        deptCode: l.deptCode || '',
        projectCode: l.projectCode || '',
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId, voucherId, defaultVoucherType]);

  useEffect(() => { loadMasterData(); }, [loadMasterData]);
  useEffect(() => { loadVoucher(); }, [loadVoucher]);

  const save = async (submit: boolean) => {
    if (!storeId || saving) return;
    if (!totals.balanced) {
      setError('차변·대변 합계가 일치해야 합니다.');
      return;
    }
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const headers = await getAuthJsonHeaders();
      const payloadLines = lines
        .filter(l => String(l.accountCode || '').trim() || Number(l.debit) > 0 || Number(l.credit) > 0)
        .map((l, i) => ({ ...l, lineNo: i + 1 }));
      if (payloadLines.length < 2) {
        setError('분개는 2행 이상 입력해야 합니다.');
        setSaving(false);
        return;
      }
      if (voucherId) {
        const res = await fetch('/api/accounting/vouchers', {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            id: voucherId,
            storeId,
            action: submit ? 'submit' : 'update',
            voucherDate,
            voucherType,
            description,
            lines: payloadLines,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '저장 실패');
        setMsg(submit ? '전표가 제출되었습니다.' : '저장되었습니다.');
        if (submit) await loadVoucher();
      } else {
        const res = await fetch('/api/accounting/vouchers', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            storeId,
            voucherDate,
            voucherType,
            description,
            lines: payloadLines,
            status: submit ? 'submit' : 'draft',
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '저장 실패');
        router.replace(`/dashboard/accounting/voucher/entry/${data.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const readOnly = status !== 'draft';

  const applyAiDraft = useCallback((draft: VoucherAiDraft) => {
    if (draft.description) setDescription(draft.description);
    if (draft.voucherDate) setVoucherDate(draft.voucherDate);
    if (draft.voucherType) setVoucherType(draft.voucherType);
    if (draft.lines?.length) {
      const padded = [...draft.lines.map((l, i) => ({ ...l, lineNo: i + 1 }))];
      while (padded.length < 2) padded.push(EMPTY_LINE());
      setLines(padded);
    }
    setMsg('AI 분개가 반영되었습니다. 내용을 확인한 뒤 저장하세요.');
    setError('');
  }, []);

  const aiContext = useMemo(() => ({
    voucherDate,
    voucherType,
    description,
    lines,
    fundMode,
  }), [voucherDate, voucherType, description, lines, fundMode]);

  return (
    <AccountingShell
      title={title || (voucherId ? '전표 수정' : '전표 작성')}
      actions={(
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/accounting/voucher/entry"
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            목록
          </Link>
          {!readOnly && (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => save(false)}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white inline-flex items-center gap-1 disabled:opacity-40"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                저장
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => save(true)}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-600 text-white inline-flex items-center gap-1 disabled:opacity-40"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                제출
              </button>
            </>
          )}
        </div>
      )}
    >
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      ) : (
        <>
          {/* 영림원형 전표 헤더 — 라벨|값 셀 구조 */}
          <div className="mb-2 border border-slate-500/60 rounded overflow-hidden bg-[#0c1219]">
            <div className="grid grid-cols-1 md:grid-cols-12 text-[11px]">
              <div className="md:col-span-2 flex border-b md:border-b-0 border-r border-slate-700/60">
                <span className="w-20 shrink-0 px-2 py-1.5 bg-[#1e3a5f] text-sky-100 font-medium border-r border-slate-600/50">전표일자</span>
                <input
                  type="date"
                  value={voucherDate}
                  disabled={readOnly}
                  onChange={e => setVoucherDate(e.target.value)}
                  className="flex-1 px-2 py-1.5 bg-transparent text-white font-mono focus:outline-none focus:bg-sky-950/30 disabled:opacity-60"
                />
              </div>
              <div className="md:col-span-2 flex border-b md:border-b-0 border-r border-slate-700/60">
                <span className="w-20 shrink-0 px-2 py-1.5 bg-[#1e3a5f] text-sky-100 font-medium border-r border-slate-600/50">전표유형</span>
                <select
                  value={voucherType}
                  disabled={readOnly}
                  onChange={e => setVoucherType(e.target.value as VoucherType)}
                  className="flex-1 px-2 py-1.5 bg-transparent text-white focus:outline-none focus:bg-sky-950/30 disabled:opacity-60"
                >
                  {Object.entries(VOUCHER_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key} className="bg-slate-900">{label}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2 flex border-b md:border-b-0 border-r border-slate-700/60">
                <span className="w-20 shrink-0 px-2 py-1.5 bg-[#1e3a5f] text-sky-100 font-medium border-r border-slate-600/50">전표번호</span>
                <span className="flex-1 px-2 py-1.5 font-mono text-teal-300">{voucherNo || '—'}</span>
              </div>
              <div className="md:col-span-2 flex border-b md:border-b-0 border-r border-slate-700/60">
                <span className="w-16 shrink-0 px-2 py-1.5 bg-[#1e3a5f] text-sky-100 font-medium border-r border-slate-600/50">상태</span>
                <span className="flex-1 px-2 py-1.5 text-slate-200">
                  {VOUCHER_STATUS_LABELS[status as keyof typeof VOUCHER_STATUS_LABELS] || status}
                </span>
              </div>
              <div className="md:col-span-4 flex">
                <span className="w-20 shrink-0 px-2 py-1.5 bg-[#1e3a5f] text-sky-100 font-medium border-r border-slate-600/50">전표적요</span>
                <input
                  value={description}
                  disabled={readOnly}
                  onChange={e => setDescription(e.target.value)}
                  className="flex-1 px-2 py-1.5 bg-transparent text-white focus:outline-none focus:bg-sky-950/30 disabled:opacity-60"
                  placeholder="헤더 적요"
                />
              </div>
            </div>
          </div>

          <VoucherLineSheet
            lines={lines}
            accounts={entryAccounts}
            partners={partners}
            depts={depts}
            projects={projects}
            readOnly={readOnly}
            onChange={setLines}
            totals={totals}
          />

          <VoucherEntryAiChat
            storeId={storeId}
            readOnly={readOnly}
            context={aiContext}
            onApply={applyAiDraft}
          />

          {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
          {msg && <p className="text-xs text-teal-300 mt-3">{msg}</p>}
        </>
      )}
    </AccountingShell>
  );
}

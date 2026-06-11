'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Plus, Save, Send, Trash2 } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import AccountingShell from '@/components/accounting/AccountingShell';
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

  const loadAccounts = useCallback(async () => {
    if (!storeId) return;
    const headers = await getAuthJsonHeaders();
    const res = await fetch(`/api/accounting/accounts?storeId=${encodeURIComponent(storeId)}`, { headers });
    const data = await res.json();
    if (res.ok) setAccounts(data.accounts || []);
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
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId, voucherId, defaultVoucherType]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  useEffect(() => { loadVoucher(); }, [loadVoucher]);

  const updateLine = (index: number, patch: Partial<VoucherLine>) => {
    setLines(prev => prev.map((line, i) => {
      if (i !== index) return line;
      const next = { ...line, ...patch };
      if (patch.accountCode !== undefined) {
        const acc = entryAccounts.find(a => String(a.code) === String(patch.accountCode));
        if (acc) next.accountName = acc.name;
      }
      return next;
    }));
  };

  const addLine = () => setLines(prev => [...prev, EMPTY_LINE()]);
  const removeLine = (index: number) => {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter((_, i) => i !== index));
  };

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
            lines,
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
            lines,
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4 p-4 bg-slate-900 border border-slate-800 rounded-xl">
            {voucherNo && (
              <label className="text-[10px] text-slate-500">
                전표번호
                <div className="mt-1 text-sm font-mono text-teal-300">{voucherNo}</div>
              </label>
            )}
            <label className="text-[10px] text-slate-500">
              전표일자
              <input
                type="date"
                value={voucherDate}
                disabled={readOnly}
                onChange={e => setVoucherDate(e.target.value)}
                className="block mt-1 w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white disabled:opacity-60"
              />
            </label>
            <label className="text-[10px] text-slate-500">
              전표유형
              <select
                value={voucherType}
                disabled={readOnly}
                onChange={e => setVoucherType(e.target.value as VoucherType)}
                className="block mt-1 w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white disabled:opacity-60"
              >
                {Object.entries(VOUCHER_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </label>
            <label className="text-[10px] text-slate-500 md:col-span-1">
              상태
              <div className="mt-1 text-xs text-slate-300">
                {VOUCHER_STATUS_LABELS[status as keyof typeof VOUCHER_STATUS_LABELS] || status}
              </div>
            </label>
            <label className="text-[10px] text-slate-500 md:col-span-4">
              적요
              <input
                value={description}
                disabled={readOnly}
                onChange={e => setDescription(e.target.value)}
                className="block mt-1 w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white disabled:opacity-60"
                placeholder="전표 적요"
              />
            </label>
          </div>

          <div className="border border-slate-800 rounded-xl overflow-x-auto mb-3">
            <table className="w-full text-xs min-w-[920px]">
              <thead className="bg-slate-800/80 text-slate-400">
                <tr>
                  <th className="text-left px-3 py-2">계정</th>
                  <th className="text-left px-3 py-2">거래처</th>
                  <th className="text-right px-3 py-2">차변</th>
                  <th className="text-right px-3 py-2">대변</th>
                  <th className="text-left px-3 py-2">적요</th>
                  {!readOnly && <th className="w-10" />}
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx} className="border-t border-slate-800/80">
                    <td className="px-3 py-2">
                      <select
                        value={line.accountCode}
                        disabled={readOnly}
                        onChange={e => updateLine(idx, { accountCode: e.target.value })}
                        className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white disabled:opacity-60"
                      >
                        <option value="">계정 선택</option>
                        {entryAccounts.map(acc => (
                          <option key={acc.id || acc.code} value={acc.code}>
                            {acc.code} · {acc.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={line.partnerName || ''}
                        disabled={readOnly}
                        onChange={e => updateLine(idx, { partnerName: e.target.value })}
                        className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white disabled:opacity-60"
                        placeholder="거래처"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={line.debit || ''}
                        disabled={readOnly}
                        onChange={e => updateLine(idx, { debit: Number(e.target.value || 0), credit: 0 })}
                        className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-right disabled:opacity-60"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={line.credit || ''}
                        disabled={readOnly}
                        onChange={e => updateLine(idx, { credit: Number(e.target.value || 0), debit: 0 })}
                        className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-right disabled:opacity-60"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={line.memo || ''}
                        disabled={readOnly}
                        onChange={e => updateLine(idx, { memo: e.target.value })}
                        className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white disabled:opacity-60"
                      />
                    </td>
                    {!readOnly && (
                      <td className="px-2 py-2">
                        <button type="button" onClick={() => removeLine(idx)} className="text-slate-500 hover:text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900/80">
                <tr>
                  <td colSpan={2} className="px-3 py-2 text-right text-slate-400">합계</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-200">{totals.debit.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-200">{totals.credit.toLocaleString()}</td>
                  <td colSpan={readOnly ? 1 : 2} className={`px-3 py-2 text-xs ${totals.balanced ? 'text-teal-400' : 'text-red-400'}`}>
                    {totals.balanced ? '차·대변 일치' : '차·대변 불일치'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {!readOnly && (
            <button
              type="button"
              onClick={addLine}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> 분개 추가
            </button>
          )}

          {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
          {msg && <p className="text-xs text-teal-300 mt-3">{msg}</p>}
        </>
      )}
    </AccountingShell>
  );
}

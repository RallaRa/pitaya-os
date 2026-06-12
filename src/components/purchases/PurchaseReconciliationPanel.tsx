'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import {
  Check, CheckSquare, CreditCard, FileSpreadsheet, FileText, Loader2,
  RefreshCw, Receipt, Square, Upload,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import PurchaseShell from '@/components/purchase/PurchaseShell';
import {
  EVIDENCE_SOURCE_LABELS,
  RECONCILIATION_STATUS_LABELS,
  type PurchaseEvidenceSource,
  type ReconciliationRow,
  type ReconciliationSummary,
} from '@/lib/purchase/purchaseEvidence';
import {
  parseCsvText,
  parseEvidenceRows,
  sheetRowsToObjects,
} from '@/lib/purchase/purchaseEvidenceImport';
import { TAX_DOC_WORKFLOW_STATUS_LABELS } from '@/lib/purchase/taxInvoiceWorkflow';

function monthStartYMD() {
  const d = new Date(Date.now() + 9 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function todayYMD() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

function formatDiff(n: number) {
  if (n === 0) return '0';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toLocaleString()}`;
}

function DiffCell({ diff }: { diff: ReconciliationRow['statementVsTax'] }) {
  if (!diff) {
    return <span className="text-slate-600 text-[10px]">—</span>;
  }
  if (!diff.hasStatement || !diff.hasTaxInvoice) {
    return (
      <span className="text-[10px] text-slate-500">
        {!diff.hasStatement ? '명세 없음' : '세금계산서 없음'}
      </span>
    );
  }
  const mismatch = Math.abs(diff.diffTotal) > 1
    || Math.abs(diff.diffSupply) > 1
    || Math.abs(diff.diffTax) > 1;
  return (
    <div className="text-[10px] leading-snug tabular-nums">
      <p className={mismatch ? 'text-red-300 font-semibold' : 'text-teal-300'}>
        합계 {formatDiff(diff.diffTotal)}원
      </p>
      {(diff.diffSupply !== 0 || diff.diffTax !== 0) && (
        <p className="text-slate-500">
          공급 {formatDiff(diff.diffSupply)} · 세액 {formatDiff(diff.diffTax)}
        </p>
      )}
      <p className="text-slate-600">
        명세 {diff.statementTotal.toLocaleString()} / 세금 {diff.taxTotal.toLocaleString()}
      </p>
    </div>
  );
}

function statusColor(status: ReconciliationRow['status']) {
  switch (status) {
    case 'full_match': return 'text-teal-300 bg-teal-950/40 border-teal-500/30';
    case 'partial_match': return 'text-amber-300 bg-amber-950/30 border-amber-500/30';
    case 'amount_mismatch': return 'text-red-300 bg-red-950/30 border-red-500/30';
    case 'evidence_only': return 'text-sky-300 bg-sky-950/30 border-sky-500/30';
    default: return 'text-slate-400 bg-slate-900/40 border-slate-700/40';
  }
}

function EvidenceCell({ ev, label }: { ev: ReconciliationRow['card']; label: string }) {
  if (!ev) {
    return <span className="text-slate-600 text-[10px]">—</span>;
  }
  return (
    <div className="text-[10px] leading-snug">
      <p className="text-slate-200 truncate max-w-[140px]" title={ev.merchantName}>{ev.merchantName}</p>
      <p className="text-slate-500 tabular-nums">{ev.txnDate}</p>
      <p className="text-teal-300 tabular-nums font-medium">{ev.totalAmount.toLocaleString()}원</p>
      {(ev.approvalNo || ev.docNumber) && (
        <p className="text-slate-600 font-mono truncate max-w-[140px]" title={ev.approvalNo || ev.docNumber}>
          {label} {ev.approvalNo || ev.docNumber}
        </p>
      )}
    </div>
  );
}

const SOURCE_ICONS: Record<PurchaseEvidenceSource, typeof CreditCard> = {
  card: CreditCard,
  cash_receipt: Receipt,
  tax_invoice: FileText,
};

export default function PurchaseReconciliationPanel() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [evidenceCount, setEvidenceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [importing, setImporting] = useState<PurchaseEvidenceSource | null>(null);
  const [startDate, setStartDate] = useState(monthStartYMD());
  const [endDate, setEndDate] = useState(todayYMD());
  const [filterStatus, setFilterStatus] = useState<'all' | ReconciliationRow['status']>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [hometaxSyncing, setHometaxSyncing] = useState(false);

  const cardInputRef = useRef<HTMLInputElement>(null);
  const cashInputRef = useRef<HTMLInputElement>(null);
  const taxInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const params = new URLSearchParams({ storeId, startDate, endDate });
      const res = await fetch(`/api/purchases/reconciliation?${params}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setRows(data.rows || []);
      setSummary(data.summary || null);
      setEvidenceCount(data.evidenceCount || 0);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const filteredRows = useMemo(() => {
    if (filterStatus === 'all') return rows;
    return rows.filter(r => r.status === filterStatus);
  }, [rows, filterStatus]);

  const confirmableRows = useMemo(
    () => rows.filter(r => r.canConfirm),
    [rows],
  );

  const toggleAll = () => {
    if (selected.size === confirmableRows.length && confirmableRows.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(confirmableRows.map(r => r.purchaseId!).filter(Boolean)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const importFile = async (file: File, sourceType: PurchaseEvidenceSource) => {
    if (!storeId || importing) return;
    setImporting(sourceType);
    setMsg('');
    setError('');
    try {
      let objects: Record<string, unknown>[] = [];
      const name = file.name.toLowerCase();

      if (name.endsWith('.csv')) {
        const text = await file.text();
        objects = parseCsvText(text);
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
        objects = sheetRowsToObjects(matrix as unknown[][]);
      } else {
        throw new Error('CSV 또는 Excel(.xlsx) 파일만 지원합니다.');
      }

      const parsed = parseEvidenceRows(objects, sourceType, storeId);
      if (!parsed.records.length) {
        throw new Error(parsed.warnings.join(' ') || '가져올 행이 없습니다.');
      }

      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/purchases/reconciliation', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          action: 'import',
          sourceType,
          records: parsed.records,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '가져오기 실패');

      setMsg(
        `${EVIDENCE_SOURCE_LABELS[sourceType]} ${data.imported}건 등록`
        + (parsed.skipped ? ` · ${parsed.skipped}건 제외` : '')
        + (parsed.warnings.length ? `\n${parsed.warnings.join('\n')}` : ''),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '가져오기 실패');
    } finally {
      setImporting(null);
    }
  };

  const confirmOne = async (purchaseId: string, release: boolean) => {
    if (!storeId || processing) return;
    setProcessing(true);
    setMsg('');
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/purchases/reconciliation', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          action: 'confirm',
          purchaseId,
          releaseToAutoVoucher: release,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '확정 실패');
      setMsg(release ? '대조 확정 후 자동전표처리로 전송했습니다.' : '대조 확정했습니다. (세금)계산서 처리에서 전송하세요.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '확정 실패');
    } finally {
      setProcessing(false);
    }
  };

  const confirmSelected = async (release: boolean) => {
    if (!storeId || selected.size === 0 || processing) return;
    setProcessing(true);
    setMsg('');
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/purchases/reconciliation', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          action: 'confirm_batch',
          purchaseIds: [...selected],
          releaseToAutoVoucher: release,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '일괄 확정 실패');
      setMsg(`${data.processed}건 대조 확정${data.failed ? ` · ${data.failed}건 실패` : ''}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '일괄 확정 실패');
    } finally {
      setProcessing(false);
    }
  };

  const syncHometax = async () => {
    if (!storeId || hometaxSyncing) return;
    setHometaxSyncing(true);
    setMsg('');
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/purchases/hometax/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId, startDate, endDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '동기화 실패');
      const skipped = data.skipped?.total ?? 0;
      const imported = data.imported?.total ?? 0;
      setMsg(data.sessionValid === false
        ? (data.message || '홈택스 세션이 만료되었습니다. 설정에서 다시 연결하세요.')
        : skipped > 0 && imported > 0
          ? `${data.message} (중복 ${skipped}건 제외)`
          : (data.message || '홈택스 동기화 완료'));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '동기화 실패');
    } finally {
      setHometaxSyncing(false);
    }
  };

  const renderImportButton = (sourceType: PurchaseEvidenceSource, inputRef: RefObject<HTMLInputElement | null>) => {
    const Icon = SOURCE_ICONS[sourceType];
    const busy = importing === sourceType;
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) void importFile(f, sourceType);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={!!importing || !storeId}
          onClick={() => inputRef.current?.click()}
          className="flex-1 min-w-[140px] text-[11px] px-3 py-2.5 rounded-lg border border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-200 inline-flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5 text-teal-400" />}
          {EVIDENCE_SOURCE_LABELS[sourceType]} 가져오기
        </button>
      </>
    );
  };

  return (
    <PurchaseShell
      title="증빙 대조 · 명세↔세금 차액"
      description="Track B: 거래명세서(OCR)와 세금계산서(홈택스) 차액 확인. Track A: 일치 시 자동전표로 회계 반영."
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 inline-flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" /> 조회
          </button>
          <button
            type="button"
            disabled={processing || selected.size === 0}
            onClick={() => confirmSelected(false)}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white inline-flex items-center gap-1 disabled:opacity-40"
          >
            {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            선택 · 대조 확정 ({selected.size})
          </button>
          <button
            type="button"
            disabled={processing || selected.size === 0}
            onClick={() => confirmSelected(true)}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-600 text-white inline-flex items-center gap-1 disabled:opacity-40"
          >
            {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            선택 · 자동전표 전송
          </button>
          <button
            type="button"
            disabled={hometaxSyncing || !storeId}
            onClick={syncHometax}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/40 inline-flex items-center gap-1 disabled:opacity-40"
          >
            {hometaxSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            홈택스 동기화
          </button>
          <Link
            href="/dashboard/settings/hometax"
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            홈택스 연결
          </Link>
          <Link
            href="/dashboard/report/purchases/tax-invoice"
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            (세금)계산서 처리
          </Link>
          <Link
            href="/dashboard/accounting/voucher/auto-process"
            className="text-xs px-2.5 py-1.5 rounded-lg border border-teal-500/30 text-teal-300 hover:bg-teal-950/40"
          >
            자동전표처리 →
          </Link>
        </div>
      )}
    >
      <div className="mb-4 p-3 rounded-xl border border-slate-800 bg-slate-900/40 text-[11px] text-slate-400 leading-relaxed">
        <p className="text-slate-300 font-medium mb-1">처리 흐름</p>
        <p>
          <span className="text-teal-400">매입 OCR 키인</span> (거래명세서) + <span className="text-teal-400">홈택스 세금계산서</span>
          → 명세↔세금 차액 확인 → 일치 시 <span className="text-teal-400">자동전표</span> · 미매칭 카드는 <span className="text-teal-400">경비 전표</span>
        </p>
        <p className="mt-1.5 text-slate-500">
          Excel 업로드 또는 <Link href="/dashboard/settings/hometax" className="text-teal-400 hover:underline">홈택스 세션 연동</Link> 후 동기화할 수 있습니다.
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-4">
          {[
            { label: '매입 건', value: summary.totalPurchases, tone: 'text-slate-200' },
            { label: '3자 일치', value: summary.fullMatch, tone: 'text-teal-300' },
            { label: '명세↔세금 차이', value: summary.statementTaxDiffCount, tone: 'text-red-300' },
            { label: '차액 합계', value: summary.statementTaxDiffTotal.toLocaleString(), tone: 'text-red-200' },
            { label: '부분 일치', value: summary.partialMatch, tone: 'text-amber-300' },
            { label: '매입만', value: summary.purchaseOnly, tone: 'text-slate-400' },
            { label: '증빙만(경비후보)', value: summary.evidenceOnly, tone: 'text-sky-300' },
            { label: '전표 가능', value: summary.readyToRelease, tone: 'text-teal-400' },
          ].map(s => (
            <div key={s.label} className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
              <p className="text-[10px] text-slate-500">{s.label}</p>
              <p className={`text-lg font-semibold tabular-nums ${s.tone}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 p-3 rounded-xl border border-slate-800 bg-slate-950/50">
        <div className="flex items-center gap-2 mb-2">
          <FileSpreadsheet className="w-4 h-4 text-teal-400" />
          <p className="text-xs font-medium text-slate-200">외부 증빙 가져오기</p>
          <span className="text-[10px] text-slate-500">등록된 증빙 {evidenceCount}건</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {renderImportButton('card', cardInputRef)}
          {renderImportButton('cash_receipt', cashInputRef)}
          {renderImportButton('tax_invoice', taxInputRef)}
        </div>
        <p className="text-[10px] text-slate-600 mt-2">
          CSV·Excel — 일자, 거래처/가맹점, 금액(합계·공급가·세액), 승인번호 열을 자동 인식합니다.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-[10px] text-slate-500">
          시작일
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="block mt-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white" />
        </label>
        <label className="text-[10px] text-slate-500">
          종료일
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="block mt-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white" />
        </label>
        <label className="text-[10px] text-slate-500">
          대조 상태
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as typeof filterStatus)} className="block mt-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white">
            <option value="all">전체</option>
            {Object.entries(RECONCILIATION_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
      </div>

      {(error || msg) && (
        <p className={`text-xs mb-3 px-3 py-2 rounded-lg border whitespace-pre-wrap ${error ? 'text-red-300 bg-red-950/30 border-red-500/20' : 'text-teal-300 bg-teal-950/20 border-teal-500/20'}`}>
          {error || msg}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      ) : filteredRows.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-12">대조할 내역이 없습니다. 증빙 파일을 가져오거나 매입을 등록하세요.</p>
      ) : (
        <div className="border border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-xs min-w-[1400px]">
            <thead className="bg-slate-800/80 text-slate-400">
              <tr>
                <th className="px-2 py-2 w-10">
                  <button type="button" onClick={toggleAll} className="text-slate-400 hover:text-teal-400">
                    {selected.size === confirmableRows.length && confirmableRows.length > 0
                      ? <CheckSquare className="w-4 h-4" />
                      : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="text-left px-2 py-2">대조</th>
                <th className="text-left px-2 py-2" colSpan={4}>거래명세서 · OCR 매입등록</th>
                <th className="text-left px-2 py-2">명세↔세금 차액</th>
                <th className="text-left px-2 py-2">카드사용</th>
                <th className="text-left px-2 py-2">현금영수증</th>
                <th className="text-left px-2 py-2">세금계산서</th>
                <th className="text-left px-2 py-2">이슈</th>
                <th className="text-center px-2 py-2 w-24">처리</th>
              </tr>
              <tr className="text-[10px] border-t border-slate-700/50">
                <th />
                <th />
                <th className="text-left px-2 py-1 font-normal">매입일</th>
                <th className="text-left px-2 py-1 font-normal">거래처</th>
                <th className="text-right px-2 py-1 font-normal">합계</th>
                <th className="text-left px-2 py-1 font-normal">세금처리</th>
                <th />
                <th colSpan={3} />
                <th />
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(row => (
                <tr key={row.key} className="border-t border-slate-800/80 align-top">
                  <td className="px-2 py-2">
                    {row.canConfirm && row.purchaseId && (
                      <button type="button" onClick={() => toggleOne(row.purchaseId!)} className="text-slate-400 hover:text-teal-400">
                        {selected.has(row.purchaseId!) ? <CheckSquare className="w-4 h-4 text-teal-400" /> : <Square className="w-4 h-4" />}
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded border text-[10px] ${statusColor(row.status)}`}>
                      {RECONCILIATION_STATUS_LABELS[row.status]}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-slate-300 tabular-nums">{row.purchaseDate || '—'}</td>
                  <td className="px-2 py-2 text-slate-200 max-w-[120px] truncate" title={row.supplierName}>
                    {row.supplierName || '—'}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-teal-300 font-medium">
                    {row.totalAmount ? row.totalAmount.toLocaleString() : '—'}
                  </td>
                  <td className="px-2 py-2 text-[10px] text-slate-400">
                    {row.purchaseId ? (
                      <>
                        <p>{TAX_DOC_WORKFLOW_STATUS_LABELS[row.taxDocWorkflowStatus as keyof typeof TAX_DOC_WORKFLOW_STATUS_LABELS] || row.taxDocWorkflowStatus}</p>
                        <p className="text-slate-500">{row.paymentMethod || '결제미상'}</p>
                      </>
                    ) : '—'}
                  </td>
                  <td className="px-2 py-2"><DiffCell diff={row.statementVsTax} /></td>
                  <td className="px-2 py-2"><EvidenceCell ev={row.card} label="승인" /></td>
                  <td className="px-2 py-2"><EvidenceCell ev={row.cashReceipt} label="승인" /></td>
                  <td className="px-2 py-2"><EvidenceCell ev={row.taxInvoice} label="번호" /></td>
                  <td className="px-2 py-2 text-[10px] text-slate-500 max-w-[160px]">
                    {row.issues.length ? row.issues.join(' · ') : '—'}
                  </td>
                  <td className="px-2 py-2">
                    {row.canConfirm && row.purchaseId && (
                      <div className="flex justify-center gap-1">
                        <button
                          type="button"
                          disabled={processing}
                          onClick={() => confirmOne(row.purchaseId!, false)}
                          className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-40"
                          title="대조 확정"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={processing}
                          onClick={() => confirmOne(row.purchaseId!, true)}
                          className="p-1.5 rounded bg-teal-700/80 hover:bg-teal-600 text-white disabled:opacity-40"
                          title="자동전표 전송"
                        >
                          <Upload className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    {row.status === 'evidence_only' && (
                      <span className="text-[10px] text-sky-400">매입 미등록</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PurchaseShell>
  );
}

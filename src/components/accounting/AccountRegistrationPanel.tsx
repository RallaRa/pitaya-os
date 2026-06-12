'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Plus, RefreshCw, Save, Trash2, ChevronRight, ChevronDown, Search,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import AccountingShell from '@/components/accounting/AccountingShell';
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPE_ORDER,
  type AccountType,
  type AccountingAccount,
} from '@/lib/accounting/types';
import {
  EMPTY_ACCOUNT_FORM,
  accountToForm,
  filterAccounts,
  groupAccountsByType,
  type AccountFormState,
} from '@/lib/accounting/accountTree';

export default function AccountRegistrationPanel() {
  const { currentStore } = useStore();
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [initing, setIniting] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [search, setSearch] = useState('');
  const [expandedTypes, setExpandedTypes] = useState<Set<AccountType>>(
    () => new Set(ACCOUNT_TYPE_ORDER),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<AccountFormState>(EMPTY_ACCOUNT_FORM);

  const load = useCallback(async () => {
    if (!currentStore?.storeId) return;
    setLoading(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(
        `/api/accounting/accounts?storeId=${encodeURIComponent(currentStore.storeId)}`,
        { headers },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setAccounts(data.accounts || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패');
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [currentStore?.storeId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => filterAccounts(accounts, search),
    [accounts, search],
  );
  const tree = useMemo(() => groupAccountsByType(filtered), [filtered]);

  const selected = accounts.find(a => a.id === selectedId) || null;

  const selectAccount = (ac: AccountingAccount) => {
    setSelectedId(ac.id || null);
    setIsNew(false);
    setForm(accountToForm(ac));
    setMsg('');
  };

  const startNew = () => {
    setSelectedId(null);
    setIsNew(true);
    setForm({ ...EMPTY_ACCOUNT_FORM, type: 'asset' });
    setMsg('');
  };

  const initDefault = async (replace = false) => {
    if (!currentStore?.storeId) return;
    const merge = !replace && accounts.length > 0;
    const msg = replace
      ? `등록된 계정과목 ${accounts.length}건을 모두 삭제하고, 영림원 표준 계정과목을 새로 등록합니다. 계속할까요?`
      : merge
        ? '영림원 표준 계정과목 중 누락된 항목만 추가합니다. 기존 계정은 유지됩니다. 계속할까요?'
        : '영림원 표준 계정과목을 등록합니다. 계속할까요?';
    if (!confirm(msg)) return;
    setIniting(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/accounting/init', {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId: currentStore.storeId, merge, replace }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '초기화 실패');
      await load();
      if (data.replaced) {
        setMsg(`기존 ${data.deleted}건 삭제 후 표준 계정 ${data.count}건을 등록했습니다.`);
      } else if (data.skipped) {
        setMsg(data.message);
      } else if (data.merged) {
        setMsg(`표준 계정 ${data.count}건이 추가되었습니다. (전체 ${data.total}건)`);
      } else {
        setMsg(`${data.count}건 계정과목이 등록되었습니다.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '초기화 실패');
    } finally {
      setIniting(false);
    }
  };

  const save = async () => {
    if (!currentStore?.storeId) return;
    if (!form.code.trim() || !form.name.trim()) {
      setError('계정코드와 계정과목명은 필수입니다.');
      return;
    }
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const headers = await getAuthJsonHeaders();
      const payload = { storeId: currentStore.storeId, ...form };

      if (isNew) {
        const res = await fetch('/api/accounting/accounts', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '등록 실패');
        await load();
        setSelectedId(data.id);
        setIsNew(false);
        setMsg('계정과목이 등록되었습니다.');
      } else if (selectedId) {
        const res = await fetch('/api/accounting/accounts', {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ ...payload, id: selectedId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '저장 실패');
        await load();
        setMsg('저장되었습니다.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!currentStore?.storeId || !selectedId || isNew) return;
    if (!confirm(`「${form.code} ${form.name}」을(를) 삭제(또는 미사용)하시겠습니까?`)) return;
    setSaving(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(
        `/api/accounting/accounts?storeId=${encodeURIComponent(currentStore.storeId)}&id=${encodeURIComponent(selectedId)}`,
        { method: 'DELETE', headers },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '삭제 실패');
      setSelectedId(null);
      setIsNew(false);
      setForm(EMPTY_ACCOUNT_FORM);
      await load();
      setMsg(data.softDeleted ? '미사용 처리되었습니다.' : '삭제되었습니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setSaving(false);
    }
  };

  const toggleType = (type: AccountType) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const parentOptions = accounts.filter(
    a => a.type === form.type && a.code !== form.code && a.isActive !== false,
  );

  const setField = <K extends keyof AccountFormState>(key: K, value: AccountFormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const inputCls = 'w-full bg-slate-800/80 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 disabled:opacity-60';
  const labelCls = 'text-[10px] text-slate-500 block mb-0.5';

  return (
    <AccountingShell
      actions={(
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={load} className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 inline-flex items-center gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> 조회
          </button>
          <button type="button" onClick={startNew} className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 inline-flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> 신규
          </button>
          <button type="button" onClick={save} disabled={saving || (!isNew && !selectedId)} className="text-xs px-2.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-600 text-white inline-flex items-center gap-1 disabled:opacity-40">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            저장
          </button>
          <button type="button" onClick={remove} disabled={!selectedId || isNew || saving} className="text-xs px-2.5 py-1.5 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-950/40 inline-flex items-center gap-1 disabled:opacity-40">
            <Trash2 className="w-3.5 h-3.5" /> 삭제
          </button>
          <button type="button" onClick={() => initDefault(false)} disabled={initing} className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 inline-flex items-center gap-1">
            {initing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {accounts.length > 0 ? '누락 추가' : '표준과목'}
          </button>
          {accounts.length > 0 && (
            <button type="button" onClick={() => initDefault(true)} disabled={initing} className="text-xs px-2.5 py-1.5 rounded-lg border border-amber-500/40 text-amber-200 hover:bg-amber-950/40 inline-flex items-center gap-1">
              {initing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              표준 재등록
            </button>
          )}
        </div>
      )}
    >
      {(error || msg) && (
        <p className={`text-xs mb-3 px-3 py-2 rounded-lg border ${error ? 'text-red-300 bg-red-950/30 border-red-500/20' : 'text-teal-300 bg-teal-950/20 border-teal-500/20'}`}>
          {error || msg}
        </p>
      )}

      <div className="flex flex-col lg:flex-row gap-0 border border-slate-800 rounded-xl overflow-hidden min-h-[520px] bg-slate-950/40">
        {/* 좌측: 계정과목 트리 (영림원) */}
        <div className="lg:w-[280px] shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col">
          <div className="p-2 border-b border-slate-800">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="코드·명칭 검색"
                className="w-full pl-8 pr-2 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-lg text-slate-200"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5 text-xs">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-teal-400" /></div>
            ) : accounts.length === 0 ? (
              <p className="text-slate-500 text-center py-6 px-2 leading-relaxed">
                등록된 계정이 없습니다.
                <br />
                「표준과목」 또는 「신규」로 등록하세요.
              </p>
            ) : (
              tree.map(group => (
                <div key={group.type} className="mb-1">
                  <button
                    type="button"
                    onClick={() => toggleType(group.type)}
                    className="w-full flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-slate-800/80 text-slate-300 font-semibold"
                  >
                    {expandedTypes.has(group.type)
                      ? <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                      : <ChevronRight className="w-3.5 h-3.5 text-slate-500" />}
                    {group.label}
                    <span className="ml-auto text-[10px] text-slate-600">{group.accounts.length}</span>
                  </button>
                  {expandedTypes.has(group.type) && (
                    <ul className="ml-2 border-l border-slate-800/80 pl-1">
                      {group.accounts.map(ac => {
                        const active = selectedId === ac.id && !isNew;
                        return (
                          <li key={ac.id}>
                            <button
                              type="button"
                              onClick={() => selectAccount(ac)}
                              className={`w-full text-left px-2 py-1 rounded-md truncate ${
                                active
                                  ? 'bg-teal-900/50 text-teal-200'
                                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                              } ${ac.isActive === false ? 'opacity-50 line-through' : ''}`}
                            >
                              <span className="font-mono text-teal-400/80 mr-1">{ac.code}</span>
                              {ac.name}
                            </button>
                          </li>
                        );
                      })}
                      {group.accounts.length === 0 && (
                        <li className="px-2 py-1 text-[10px] text-slate-600">—</li>
                      )}
                    </ul>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* 우측: 계정과목 상세 (영림원 등록 폼) */}
        <div className="flex-1 p-4 overflow-y-auto">
          {!isNew && !selected ? (
            <div className="h-full flex items-center justify-center text-sm text-slate-500">
              좌측에서 계정을 선택하거나 「신규」를 누르세요.
            </div>
          ) : (
            <div className="max-w-2xl">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">
                {isNew ? '신규 계정과목' : '계정과목 상세'}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>계정코드 (내부)</label>
                  <input
                    className={inputCls}
                    value={form.code}
                    onChange={e => setField('code', e.target.value.replace(/\D/g, '').slice(0, 6))}
                    disabled={!isNew}
                    placeholder="101"
                  />
                </div>
                <div>
                  <label className={labelCls}>외부코드</label>
                  <input
                    className={inputCls}
                    value={form.externalCode}
                    onChange={e => setField('externalCode', e.target.value.slice(0, 20))}
                    placeholder="전표·외부연동용"
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>계정과목명</label>
                  <input
                    className={inputCls}
                    value={form.name}
                    onChange={e => setField('name', e.target.value)}
                    placeholder="예: 보통예금"
                  />
                </div>
                <div>
                  <label className={labelCls}>계정구분</label>
                  <select
                    className={inputCls}
                    value={form.type}
                    onChange={e => setField('type', e.target.value as AccountType)}
                    disabled={!isNew}
                  >
                    {ACCOUNT_TYPE_ORDER.map(t => (
                      <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>상위계정</label>
                  <select
                    className={inputCls}
                    value={form.parentCode}
                    onChange={e => setField('parentCode', e.target.value)}
                  >
                    <option value="">— 없음 —</option>
                    {parentOptions.map(p => (
                      <option key={p.code} value={p.code}>{p.code} {p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-800">
                <p className="text-[10px] font-semibold text-slate-500 mb-2">전표·관리 설정</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input type="checkbox" checked={form.allowEntry} onChange={e => setField('allowEntry', e.target.checked)} />
                    전표기표
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input type="checkbox" checked={form.perItemOffset} onChange={e => setField('perItemOffset', e.target.checked)} />
                    건별반제 (채권·채무)
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input type="checkbox" checked={form.usePartner} onChange={e => setField('usePartner', e.target.checked)} />
                    거래처관리항목
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input type="checkbox" checked={form.isFundAccount} onChange={e => setField('isFundAccount', e.target.checked)} />
                    자금·예적금 계정
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input type="checkbox" checked={form.isActive} onChange={e => setField('isActive', e.target.checked)} />
                    사용
                  </label>
                </div>
              </div>

              <div className="mt-4">
                <label className={labelCls}>비고</label>
                <textarea
                  className={`${inputCls} resize-none`}
                  value={form.memo}
                  onChange={e => setField('memo', e.target.value)}
                  rows={2}
                />
              </div>

              {selected && !isNew && (
                <p className="mt-3 text-[10px] text-slate-600 font-mono">문서 ID: {selected.id}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </AccountingShell>
  );
}

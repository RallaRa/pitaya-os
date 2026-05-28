'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/context/StoreContext';
import { useAuth } from '@/context/AuthContext';
import {
  Users, UserPlus, Search, Loader2, Save, Trash2, X,
  Link2, Link2Off, ChevronDown, Plus, Minus, Eye, EyeOff,
  AlertCircle, CheckCircle2, Settings,
} from 'lucide-react';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';

/* ─────────────────── 타입 ─────────────────── */
interface Department { id: string; name: string; }

interface StoreAccount {
  uid: string; name: string; email: string; groupId: string; photoURL?: string;
}

interface EmpSummary {
  docId: string; empNo: string; name: string; department: string;
  position: string; status: string; hireDate: string;
  linkedUid: string; isAdminAccount: boolean; photoUrl: string;
}

type Allowance  = { name: string; amount: number };
type EducationRow = { level: string; school: string; major: string; graduateYear: string };
type CertRow    = { name: string; acquiredDate: string };
type PromoRow   = { date: string; type: string; fromDept: string; toDept: string; fromPosition: string; toPosition: string; reason: string };
type AttachRow  = { name: string; url: string; description: string; uploadedAt: string };

interface Employee {
  empNo: string;
  name: string; nameEn: string; gender: string; birthDate: string;
  ssn: string;         // plaintext (only when entering new value)
  ssnMasked: string;   // display mask
  nationality: string; photoUrl: string;
  phone: string;
  emergencyContact: { name: string; relation: string; phone: string };
  personalEmail: string; companyEmail: string;
  address: { zipCode: string; address1: string; address2: string };
  residenceAddress: { sameAsAddress: boolean; zipCode: string; address1: string; address2: string };
  // 인사
  department: string; position: string; jobTitle: string; employmentType: string;
  hireDate: string; probationEndDate: string; status: string;
  resignDate: string; resignReason: string; duties: string;
  // 급여
  salary: {
    type: string; baseSalary: number; mealAllowance: number; transportAllowance: number;
    otherAllowances: Allowance[]; totalMonthly: number; payDay: number;
    bankName: string;
    accountNo: string;        // plaintext input (new value)
    accountNoMasked: string;  // display
  };
  salaryContracts: { fileName: string; fileUrl: string; uploadedAt: string }[];
  // 근무
  workType: string;
  workHours: { start: string; end: string };
  daysOff: string[];
  annualLeaveBase: string; totalAnnualLeave: number; usedAnnualLeave: number;
  // 학력/자격
  education: EducationRow[]; certifications: CertRow[];
  hygieneCertDate: string; hygieneCertExpiry: string; otherEducation: string;
  // 사회보험
  insurance: {
    nationalPension:    { enrolled: boolean; number: string };
    healthInsurance:    { enrolled: boolean; number: string };
    employmentInsurance:{ enrolled: boolean; number: string };
    industrialAccident: { enrolled: boolean };
  };
  // 발령이력
  promotionHistory: PromoRow[];
  // 첨부
  attachments: AttachRow[];
  adminMemo: string; notes: string;
  isAdminAccount: boolean;
  linkedUid: string; linkedEmail: string;
  storeId: string;
}

const EMPTY_EMP: Employee = {
  empNo: '', name: '', nameEn: '', gender: '', birthDate: '',
  ssn: '', ssnMasked: '', nationality: '대한민국', photoUrl: '',
  phone: '', emergencyContact: { name: '', relation: '', phone: '' },
  personalEmail: '', companyEmail: '',
  address: { zipCode: '', address1: '', address2: '' },
  residenceAddress: { sameAsAddress: true, zipCode: '', address1: '', address2: '' },
  department: '', position: '사원', jobTitle: '', employmentType: '정규직',
  hireDate: '', probationEndDate: '', status: '재직',
  resignDate: '', resignReason: '', duties: '',
  salary: {
    type: 'monthly', baseSalary: 0, mealAllowance: 0, transportAllowance: 0,
    otherAllowances: [], totalMonthly: 0, payDay: 25,
    bankName: '', accountNo: '', accountNoMasked: '',
  },
  salaryContracts: [],
  workType: '주5일', workHours: { start: '09:00', end: '18:00' },
  daysOff: ['토', '일'], annualLeaveBase: '', totalAnnualLeave: 15, usedAnnualLeave: 0,
  education: [], certifications: [],
  hygieneCertDate: '', hygieneCertExpiry: '', otherEducation: '',
  insurance: {
    nationalPension:    { enrolled: false, number: '' },
    healthInsurance:    { enrolled: false, number: '' },
    employmentInsurance:{ enrolled: false, number: '' },
    industrialAccident: { enrolled: false },
  },
  promotionHistory: [], attachments: [],
  adminMemo: '', notes: '', isAdminAccount: false,
  linkedUid: '', linkedEmail: '', storeId: '',
};

const POSITIONS  = ['사원', '주임', '대리', '과장', '차장', '부장', '이사', '대표'];
const EMP_TYPES  = ['정규직', '계약직', '파트타임', '일용직', '인턴'];
const STATUSES   = ['재직', '수습', '휴직', '퇴직'];
const WORK_TYPES = ['주5일', '주6일', '격주', '자유'];
const DAYS       = ['월', '화', '수', '목', '금', '토', '일'];
const SALARY_TYPES = ['월급', '시급', '일급'];
const EDU_LEVELS = ['고졸', '전문대졸', '대졸', '대학원졸', '기타'];
const BANKS = ['국민은행', '신한은행', '우리은행', '하나은행', '기업은행', '농협은행', '카카오뱅크', '토스뱅크', '케이뱅크', '새마을금고', '기타'];
const PROMO_TYPES = ['승진', '전보', '직책변경', '기타'];

const TABS = ['기본정보', '인사정보', '급여정보', '근무정보', '학력/자격', '사회보험', '발령이력', '첨부파일'];

/* ─────────────────── 유틸 ─────────────────── */
function Input({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs text-slate-400">{label}</label>}
      <input
        {...props}
        className={`bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 disabled:opacity-50 ${props.className || ''}`}
      />
    </div>
  );
}

function Select({ label, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs text-slate-400">{label}</label>}
      <select
        {...props}
        className={`bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500 disabled:opacity-50 ${props.className || ''}`}
      >
        {children}
      </select>
    </div>
  );
}

function TextArea({ label, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs text-slate-400">{label}</label>}
      <textarea
        {...props}
        className={`bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 resize-none disabled:opacity-50 ${props.className || ''}`}
      />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4 mb-2 border-t border-slate-800 pt-3 first:border-t-0 first:mt-0 first:pt-0">{children}</p>;
}

/* ─────────────────── 메인 ─────────────────── */
export default function EmployeesPage() {
  const { currentStore } = useStore();
  const { user }         = useAuth();
  const storeId          = currentStore?.storeId || '';
  const myRole           = currentStore?.role || 'staff';
  const isMaster         = ['master', 'superuser'].includes(myRole);

  const [departments,   setDepartments]   = useState<Department[]>([]);
  const [accounts,      setAccounts]      = useState<StoreAccount[]>([]);
  const [empList,       setEmpList]       = useState<EmpSummary[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState('');
  const [statusFilter,  setStatusFilter]  = useState('');
  const [deptFilter,    setDeptFilter]    = useState('');

  const [selectedAccount, setSelectedAccount] = useState<StoreAccount | null>(null);
  const [form,         setForm]          = useState<Employee>({ ...EMPTY_EMP });
  const [activeTab,    setActiveTab]     = useState(0);
  const [isNew,        setIsNew]         = useState(false);
  const [saving,       setSaving]        = useState(false);
  const [deleting,     setDeleting]      = useState(false);
  const [error,        setError]         = useState('');
  const [success,      setSuccess]       = useState('');
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [decryptLoading, setDecryptLoading] = useState('');

  /* ── 데이터 로드 ── */
  const loadAll = useCallback(async () => {
    if (!storeId) { setLoading(false); return; }
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const [deptsRes, accRes, empRes] = await Promise.all([
        fetch(`/api/hr/departments?storeId=${storeId}`, { headers }),
        fetch(`/api/users?storeId=${storeId}`, { headers }),
        fetch(`/api/hr/employees?storeId=${storeId}`, { headers }),
      ]);
      const [deptsData, accData, empData] = await Promise.all([
        deptsRes.json(), accRes.json(), empRes.json(),
      ]);
      setDepartments(deptsData.departments || []);
      setAccounts(accData.users || []);
      setEmpList(empData.employees || []);
    } catch {
      setError('데이터를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* ── 계정 클릭 → 우측 패널 로드 ── */
  const handleAccountClick = async (acc: StoreAccount) => {
    setSelectedAccount(acc);
    setError('');
    setSuccess('');
    setActiveTab(0);

    const linked = empList.find(e => e.linkedUid === acc.uid);
    if (linked) {
      // 연결된 사원 로드
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/hr/employees?storeId=${storeId}&empNo=${linked.empNo}`, { headers });
        const data = await res.json();
        if (data.employee) {
          const emp = data.employee;
          setForm({
            ...EMPTY_EMP,
            ...emp,
            ssn: '',
            ssnMasked: emp.ssnMasked || (emp.ssnEncrypted ? '●●●●●●-●●●●●●●' : ''),
            salary: {
              ...EMPTY_EMP.salary,
              ...(emp.salary || {}),
              accountNo: '',
              accountNoMasked: emp.accountNoMasked || (emp.salary?.accountNoEncrypted ? '●●●●●●●●' : ''),
            },
          });
          setIsNew(false);
        }
      } catch {
        setError('사원정보를 불러오지 못했습니다');
      }
    } else {
      // 신규 등록 폼
      setForm({
        ...EMPTY_EMP,
        linkedUid:   acc.uid,
        linkedEmail: acc.email,
        companyEmail: acc.email,
        name: acc.name || '',
        storeId,
      });
      setIsNew(true);
    }
  };

  /* ── 필드 업데이트 헬퍼 ── */
  const set = (path: string, value: unknown) => {
    setForm(prev => {
      const next = { ...prev } as Record<string, any>;
      const keys = path.split('.');
      let cur = next;
      for (let i = 0; i < keys.length - 1; i++) {
        cur[keys[i]] = { ...cur[keys[i]] };
        cur = cur[keys[i]];
      }
      cur[keys[keys.length - 1]] = value;
      return next as Employee;
    });
  };

  /* ── 급여 총액 자동계산 ── */
  const recalcTotal = (s: Employee['salary']): number => {
    const others = s.otherAllowances.reduce((sum, a) => sum + (a.amount || 0), 0);
    return s.baseSalary + s.mealAllowance + s.transportAllowance + others;
  };

  const setSalaryField = (field: keyof Employee['salary'], value: unknown) => {
    setForm(prev => {
      const newSalary = { ...prev.salary, [field]: value };
      newSalary.totalMonthly = recalcTotal(newSalary);
      return { ...prev, salary: newSalary };
    });
  };

  /* ── 저장 ── */
  const handleSave = async () => {
    if (!form.name.trim()) { setError('성명은 필수입니다'); return; }
    if (!form.hireDate)    { setError('입사일은 필수입니다'); return; }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const headers = await getAuthJsonHeaders();
      const payload = { ...form, storeId };
      const res = await fetch('/api/hr/employees', {
        method: isNew ? 'POST' : 'PUT',
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
      if (isNew && data.empNo) setForm(prev => ({ ...prev, empNo: data.empNo }));
      setIsNew(false);
      setSuccess('저장되었습니다');
      await loadAll();
    } catch (e: any) {
      setError(e.message || '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  /* ── 삭제 ── */
  const handleDelete = async () => {
    if (!form.empNo || !confirm(`사원 "${form.name}"을 삭제하시겠습니까?`)) return;
    setDeleting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/hr/employees?storeId=${storeId}&empNo=${form.empNo}`, { method: 'DELETE', headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '삭제 실패');
      setSelectedAccount(null);
      setForm({ ...EMPTY_EMP });
      await loadAll();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  /* ── 복호화 ── */
  const handleDecrypt = async (field: 'ssn' | 'accountNo') => {
    if (!form.empNo) return;
    setDecryptLoading(field);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/hr/employees/decrypt', {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId, empNo: form.empNo, field }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (field === 'ssn') setForm(prev => ({ ...prev, ssnMasked: data.decrypted }));
      else setForm(prev => ({ ...prev, salary: { ...prev.salary, accountNoMasked: data.decrypted } }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDecryptLoading('');
    }
  };

  /* ── 연차 자동 계산 (입사일 기준) ── */
  useEffect(() => {
    if (!form.hireDate) return;
    const months = Math.floor((new Date().getTime() - new Date(form.hireDate).getTime()) / (1000 * 60 * 60 * 24 * 30));
    const years  = Math.floor(months / 12);
    const leave  = years === 0 ? Math.min(months, 11) : Math.min(15 + (years - 1), 25);
    setForm(prev => ({ ...prev, totalAnnualLeave: leave }));
  }, [form.hireDate]);

  /* ── 위생교육 만료일 자동계산 ── */
  useEffect(() => {
    if (!form.hygieneCertDate) return;
    const d = new Date(form.hygieneCertDate);
    d.setFullYear(d.getFullYear() + 1);
    setForm(prev => ({ ...prev, hygieneCertExpiry: d.toISOString().slice(0, 10) }));
  }, [form.hygieneCertDate]);

  /* ── 거주지 = 등록주소 동기화 ── */
  useEffect(() => {
    if (form.residenceAddress.sameAsAddress) {
      setForm(prev => ({
        ...prev,
        residenceAddress: {
          ...prev.residenceAddress,
          zipCode:  prev.address.zipCode,
          address1: prev.address.address1,
          address2: prev.address.address2,
        },
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.address, form.residenceAddress.sameAsAddress]);

  /* ── 필터링된 계정 목록 ── */
  const filteredAccounts = accounts.filter(acc => {
    const q = search.toLowerCase();
    if (q && !acc.name?.toLowerCase().includes(q) && !acc.email?.toLowerCase().includes(q)) return false;
    const emp = empList.find(e => e.linkedUid === acc.uid);
    if (statusFilter && emp?.status !== statusFilter) return false;
    if (deptFilter   && emp?.department !== deptFilter) return false;
    return true;
  });

  /* ── 연결 상태 배지 ── */
  const linkBadge = (acc: StoreAccount) => {
    const isMasterAcc = acc.groupId === 'master';
    const emp = empList.find(e => e.linkedUid === acc.uid);
    if (isMasterAcc) return <span className="text-[10px] bg-yellow-900/40 text-yellow-400 px-1.5 py-0.5 rounded-full">🔧 관리계정</span>;
    if (emp)         return <span className="text-[10px] bg-teal-900/40 text-teal-400 px-1.5 py-0.5 rounded-full">✅ 연결됨</span>;
    return              <span className="text-[10px] bg-orange-900/40 text-orange-400 px-1.5 py-0.5 rounded-full">⚠️ 미연결</span>;
  };

  /* ── 탭 렌더 ── */
  const renderTab = () => {
    switch (activeTab) {
      case 0: return <TabBasic form={form} set={set} isMaster={isMaster} isNew={isNew} handleDecrypt={handleDecrypt} decryptLoading={decryptLoading} />;
      case 1: return <TabHR form={form} set={set} departments={departments} />;
      case 2: return isMaster
        ? <TabSalary form={form} set={set} setSalaryField={setSalaryField} isMaster={isMaster} handleDecrypt={handleDecrypt} decryptLoading={decryptLoading} />
        : <div className="flex items-center justify-center h-32 text-slate-500 text-sm"><AlertCircle className="w-5 h-5 mr-2 text-slate-600" />master/superuser만 조회 가능합니다</div>;
      case 3: return <TabWork form={form} set={set} />;
      case 4: return <TabEducation form={form} set={set} />;
      case 5: return <TabInsurance form={form} set={set} />;
      case 6: return <TabPromotion form={form} set={set} departments={departments} />;
      case 7: return <TabAttachments form={form} set={set} />;
      default: return null;
    }
  };

  if (!storeId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
        <Users className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">매장을 먼저 선택해주세요.</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-120px)] min-h-0">
      {/* ─── 좌측 패널 ─── */}
      <div className="w-72 shrink-0 flex flex-col border-r border-slate-800 bg-slate-950">
        <div className="p-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2 mb-2.5">
            <Users className="w-4 h-4 text-teal-400" />
            <h2 className="text-sm font-bold text-teal-400">사원정보</h2>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="이름 / 이메일 검색"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
            />
          </div>
          <div className="flex gap-1.5">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-300 focus:outline-none"
            >
              <option value="">전체 재직상태</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-300 focus:outline-none"
            >
              <option value="">전체 부서</option>
              {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 text-teal-400 animate-spin" />
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-600">
              <Users className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">멤버가 없습니다</p>
            </div>
          ) : filteredAccounts.map(acc => {
            const isSelected = selectedAccount?.uid === acc.uid;
            const emp = empList.find(e => e.linkedUid === acc.uid);
            return (
              <button
                key={acc.uid}
                onClick={() => handleAccountClick(acc)}
                className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors border-b border-slate-800/50
                  ${isSelected ? 'bg-teal-900/20 border-l-2 border-l-teal-500' : 'hover:bg-slate-800/50'}`}
              >
                <div className="w-8 h-8 rounded-full bg-slate-700 shrink-0 flex items-center justify-center text-xs font-bold text-slate-300 overflow-hidden">
                  {acc.photoURL
                    ? <img src={acc.photoURL} alt="" className="w-full h-full object-cover" />
                    : (acc.name?.[0] || acc.email?.[0] || '?').toUpperCase()
                  }
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-white text-xs font-medium truncate">{acc.name || acc.email}</span>
                  </div>
                  <p className="text-slate-500 text-[10px] truncate">{acc.email}</p>
                  <div className="mt-1 flex items-center gap-1 flex-wrap">
                    {linkBadge(acc)}
                    {emp?.department && (
                      <span className="text-[10px] text-slate-500">{emp.department}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── 우측 패널 ─── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!selectedAccount ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600">
            <Users className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm">좌측에서 계정을 선택하세요</p>
            <p className="text-xs mt-1 text-slate-700">계정 클릭 시 사원정보 등록/조회</p>
          </div>
        ) : (
          <>
            {/* 상단 헤더 */}
            <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-300 overflow-hidden">
                  {selectedAccount.photoURL
                    ? <img src={selectedAccount.photoURL} alt="" className="w-full h-full object-cover" />
                    : (selectedAccount.name?.[0] || '?').toUpperCase()
                  }
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">
                    {form.name || selectedAccount.name || selectedAccount.email}
                    {form.empNo && <span className="ml-2 text-xs text-slate-500 font-normal">#{form.empNo}</span>}
                  </p>
                  <p className="text-slate-500 text-xs">{selectedAccount.email}</p>
                </div>
                {isNew
                  ? <span className="text-[10px] bg-blue-900/40 text-blue-400 px-2 py-0.5 rounded-full">신규</span>
                  : <span className="text-[10px] bg-teal-900/40 text-teal-400 px-2 py-0.5 rounded-full">수정</span>
                }
              </div>
              <div className="flex items-center gap-2">
                {!isNew && isMaster && (
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:text-red-300 bg-red-900/20 hover:bg-red-900/40 rounded-lg transition-colors"
                  >
                    {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    삭제
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-black rounded-lg transition-colors"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  저장
                </button>
              </div>
            </div>

            {/* 알림 */}
            {(error || success) && (
              <div className={`mx-5 mt-3 px-4 py-2.5 rounded-xl text-sm flex items-center justify-between
                ${error ? 'bg-red-900/30 border border-red-500/30 text-red-400' : 'bg-teal-900/30 border border-teal-500/30 text-teal-400'}`}>
                <span className="flex items-center gap-2">
                  {error ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  {error || success}
                </span>
                <button onClick={() => { setError(''); setSuccess(''); }}><X className="w-4 h-4" /></button>
              </div>
            )}

            {/* 탭 */}
            <div className="shrink-0 flex items-center gap-0.5 px-5 pt-3 border-b border-slate-800 overflow-x-auto">
              {TABS.map((tab, i) => (
                <button
                  key={i}
                  onClick={() => setActiveTab(i)}
                  className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors
                    ${activeTab === i
                      ? 'bg-slate-800 text-teal-400 border-b-2 border-teal-500'
                      : 'text-slate-500 hover:text-slate-300'
                    }`}
                >
                  {tab}
                  {i === 2 && !isMaster && <span className="ml-1 text-[9px] text-slate-600">🔒</span>}
                </button>
              ))}
            </div>

            {/* 탭 콘텐츠 */}
            <div className="flex-1 overflow-y-auto p-5">
              {renderTab()}
            </div>
          </>
        )}
      </div>

      {/* 링크 모달 */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5">
            <p className="text-white font-semibold mb-4">계정 연결</p>
            <p className="text-slate-400 text-sm mb-4">
              저장 시 현재 선택된 계정({selectedAccount?.email})과 자동으로 연결됩니다.
            </p>
            <button onClick={() => setShowLinkModal(false)} className="w-full py-2 bg-teal-600 text-black font-semibold rounded-xl text-sm">확인</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════ 탭 컴포넌트 ══════════════════ */

function TabBasic({ form, set, isMaster, isNew, handleDecrypt, decryptLoading }: {
  form: Employee; set: (p: string, v: unknown) => void;
  isMaster: boolean; isNew: boolean; handleDecrypt: (f: 'ssn' | 'accountNo') => void; decryptLoading: string;
}) {
  const [showSsn, setShowSsn] = useState(false);
  return (
    <div className="space-y-3">
      <SectionTitle>기본 인적사항</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Input label="성명 *" value={form.name} onChange={e => set('name', e.target.value)} placeholder="홍길동" />
        <Input label="영문명" value={form.nameEn} onChange={e => set('nameEn', e.target.value)} placeholder="GIL-DONG HONG" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Select label="성별" value={form.gender} onChange={e => set('gender', e.target.value)}>
          <option value="">선택</option>
          <option value="남">남</option>
          <option value="여">여</option>
        </Select>
        <Input label="생년월일" type="date" value={form.birthDate} onChange={e => set('birthDate', e.target.value)} />
        <Input label="국적" value={form.nationality} onChange={e => set('nationality', e.target.value)} />
      </div>

      {/* 주민등록번호 */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">주민등록번호 (AES-256 암호화 저장)</label>
        <div className="flex gap-2">
          <input
            type={showSsn ? 'text' : 'password'}
            value={showSsn && form.ssnMasked ? form.ssnMasked : form.ssn}
            onChange={e => set('ssn', e.target.value)}
            placeholder={form.ssnMasked ? form.ssnMasked : '000000-0000000'}
            className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
          <button
            type="button"
            onClick={() => setShowSsn(v => !v)}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-400"
          >
            {showSsn ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          {!isNew && isMaster && form.empNo && (
            <button
              onClick={() => handleDecrypt('ssn')}
              disabled={decryptLoading === 'ssn'}
              className="px-3 py-2 bg-amber-900/30 hover:bg-amber-900/50 text-amber-400 text-xs rounded-lg"
            >
              {decryptLoading === 'ssn' ? <Loader2 className="w-4 h-4 animate-spin" /> : '복호화'}
            </button>
          )}
        </div>
        <p className="text-[10px] text-slate-600">새로 입력 시에만 암호화 저장됩니다. 빈칸이면 기존 값 유지.</p>
      </div>

      <SectionTitle>연락처</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Input label="휴대폰" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="010-0000-0000" />
        <Input label="개인 이메일" value={form.personalEmail} onChange={e => set('personalEmail', e.target.value)} type="email" />
      </div>
      <Input label="사내 이메일" value={form.companyEmail} onChange={e => set('companyEmail', e.target.value)} type="email" />

      <div className="bg-slate-800/50 rounded-xl p-3 space-y-2">
        <p className="text-xs text-slate-500">긴급연락처</p>
        <div className="grid grid-cols-3 gap-2">
          <Input placeholder="이름" value={form.emergencyContact.name} onChange={e => set('emergencyContact.name', e.target.value)} />
          <Input placeholder="관계 (예: 배우자)" value={form.emergencyContact.relation} onChange={e => set('emergencyContact.relation', e.target.value)} />
          <Input placeholder="연락처" value={form.emergencyContact.phone} onChange={e => set('emergencyContact.phone', e.target.value)} />
        </div>
      </div>

      <SectionTitle>주소</SectionTitle>
      <div className="space-y-2">
        <p className="text-[11px] text-slate-500">등록주소</p>
        <div className="grid grid-cols-3 gap-2">
          <Input placeholder="우편번호" value={form.address.zipCode} onChange={e => set('address.zipCode', e.target.value)} />
          <Input placeholder="주소" className="col-span-2" value={form.address.address1} onChange={e => set('address.address1', e.target.value)} />
        </div>
        <Input placeholder="상세주소" value={form.address.address2} onChange={e => set('address.address2', e.target.value)} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-[11px] text-slate-500">실거주지</p>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={form.residenceAddress.sameAsAddress}
              onChange={e => set('residenceAddress.sameAsAddress', e.target.checked)}
              className="w-3 h-3 accent-teal-500"
            />
            등록주소와 동일
          </label>
        </div>
        {!form.residenceAddress.sameAsAddress && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="우편번호" value={form.residenceAddress.zipCode} onChange={e => set('residenceAddress.zipCode', e.target.value)} />
              <Input placeholder="주소" className="col-span-2" value={form.residenceAddress.address1} onChange={e => set('residenceAddress.address1', e.target.value)} />
            </div>
            <Input placeholder="상세주소" value={form.residenceAddress.address2} onChange={e => set('residenceAddress.address2', e.target.value)} />
          </>
        )}
      </div>

      <SectionTitle>메모</SectionTitle>
      <TextArea label="특이사항 (본인 열람 가능)" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
      <TextArea label="관리자 메모 (본인 비표시)" rows={2} value={form.adminMemo} onChange={e => set('adminMemo', e.target.value)} />

      <SectionTitle>계정 설정</SectionTitle>
      <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
        <input
          type="checkbox"
          checked={form.isAdminAccount}
          onChange={e => set('isAdminAccount', e.target.checked)}
          className="w-4 h-4 accent-yellow-500"
        />
        관리계정으로 설정 (사원정보 미연결 경고 없음)
      </label>
      {form.linkedEmail && (
        <p className="text-xs text-teal-400">연결된 계정: {form.linkedEmail}</p>
      )}
    </div>
  );
}

function TabHR({ form, set, departments }: { form: Employee; set: (p: string, v: unknown) => void; departments: Department[] }) {
  return (
    <div className="space-y-3">
      <SectionTitle>소속 / 직급</SectionTitle>
      <div className="grid grid-cols-3 gap-3">
        <Select label="부서" value={form.department} onChange={e => set('department', e.target.value)}>
          <option value="">미배정</option>
          {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
        </Select>
        <Select label="직급" value={form.position} onChange={e => set('position', e.target.value)}>
          {['', ...['사원', '주임', '대리', '과장', '차장', '부장', '이사', '대표']].map(p => <option key={p} value={p}>{p || '선택'}</option>)}
        </Select>
        <Input label="직책" value={form.jobTitle} onChange={e => set('jobTitle', e.target.value)} placeholder="예: 점장" />
      </div>
      <Select label="고용형태" value={form.employmentType} onChange={e => set('employmentType', e.target.value)}>
        {EMP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </Select>

      <SectionTitle>재직 정보</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Input label="입사일 *" type="date" value={form.hireDate} onChange={e => set('hireDate', e.target.value)} />
        <Input label="수습 종료일" type="date" value={form.probationEndDate} onChange={e => set('probationEndDate', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Select label="재직상태 *" value={form.status} onChange={e => set('status', e.target.value)}>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        {form.status === '퇴직' && (
          <Input label="퇴직일" type="date" value={form.resignDate} onChange={e => set('resignDate', e.target.value)} />
        )}
      </div>
      {form.status === '퇴직' && (
        <TextArea label="퇴직사유" rows={2} value={form.resignReason} onChange={e => set('resignReason', e.target.value)} />
      )}
      <TextArea label="담당업무" rows={2} value={form.duties} onChange={e => set('duties', e.target.value)} placeholder="주요 담당 업무를 입력하세요" />
    </div>
  );
}

function TabSalary({ form, set, setSalaryField, isMaster, handleDecrypt, decryptLoading }: {
  form: Employee; set: (p: string, v: unknown) => void;
  setSalaryField: (f: keyof Employee['salary'], v: unknown) => void;
  isMaster: boolean; handleDecrypt: (f: 'ssn' | 'accountNo') => void; decryptLoading: string;
}) {
  const s = form.salary;
  const addOther = () => setSalaryField('otherAllowances', [...s.otherAllowances, { name: '', amount: 0 }]);
  const removeOther = (i: number) => setSalaryField('otherAllowances', s.otherAllowances.filter((_, idx) => idx !== i));
  const setOther = (i: number, field: 'name' | 'amount', val: string | number) => {
    const next = s.otherAllowances.map((a, idx) => idx === i ? { ...a, [field]: val } : a);
    setSalaryField('otherAllowances', next);
  };

  return (
    <div className="space-y-3">
      <SectionTitle>급여 유형 / 기본급</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Select label="급여유형" value={s.type} onChange={e => setSalaryField('type', e.target.value)}>
          {SALARY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </Select>
        <Input label="기본급 (원)" type="number" value={s.baseSalary || ''} onChange={e => setSalaryField('baseSalary', Number(e.target.value))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="식대 (원)" type="number" value={s.mealAllowance || ''} onChange={e => setSalaryField('mealAllowance', Number(e.target.value))} />
        <Input label="교통비 (원)" type="number" value={s.transportAllowance || ''} onChange={e => setSalaryField('transportAllowance', Number(e.target.value))} />
      </div>

      {/* 기타 수당 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">기타 수당</p>
          <button onClick={addOther} className="flex items-center gap-1 text-[11px] text-teal-400 hover:text-teal-300">
            <Plus className="w-3 h-3" /> 추가
          </button>
        </div>
        {s.otherAllowances.map((a, i) => (
          <div key={i} className="flex gap-2">
            <input
              placeholder="수당명"
              value={a.name}
              onChange={e => setOther(i, 'name', e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-teal-500"
            />
            <input
              type="number"
              placeholder="금액"
              value={a.amount || ''}
              onChange={e => setOther(i, 'amount', Number(e.target.value))}
              className="w-32 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-teal-500"
            />
            <button onClick={() => removeOther(i)} className="p-1.5 text-slate-500 hover:text-red-400">
              <Minus className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* 총액 */}
      <div className="bg-teal-900/20 border border-teal-500/30 rounded-xl p-3 flex items-center justify-between">
        <span className="text-sm text-teal-300">총 월 지급액</span>
        <span className="text-lg font-bold text-teal-400">{s.totalMonthly.toLocaleString()}원</span>
      </div>

      <SectionTitle>지급 계좌</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Select label="은행" value={s.bankName} onChange={e => setSalaryField('bankName', e.target.value)}>
          <option value="">선택</option>
          {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
        </Select>
        <Input label="급여지급일 (매월 N일)" type="number" min={1} max={31} value={s.payDay || ''} onChange={e => setSalaryField('payDay', Number(e.target.value))} />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">계좌번호 (AES-256 암호화 저장)</label>
        <div className="flex gap-2">
          <input
            placeholder={s.accountNoMasked || '계좌번호 입력'}
            value={s.accountNo}
            onChange={e => setSalaryField('accountNo', e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
          {isMaster && form.empNo && (
            <button
              onClick={() => handleDecrypt('accountNo')}
              disabled={decryptLoading === 'accountNo'}
              className="px-3 py-2 bg-amber-900/30 hover:bg-amber-900/50 text-amber-400 text-xs rounded-lg"
            >
              {decryptLoading === 'accountNo' ? <Loader2 className="w-4 h-4 animate-spin" /> : '복호화'}
            </button>
          )}
        </div>
        {s.accountNoMasked && s.accountNoMasked !== '계좌번호 입력' && (
          <p className="text-xs text-teal-400">저장된 계좌: {s.accountNoMasked}</p>
        )}
        <p className="text-[10px] text-slate-600">새로 입력 시에만 암호화 저장. 빈칸이면 기존 값 유지.</p>
      </div>
    </div>
  );
}

function TabWork({ form, set }: { form: Employee; set: (p: string, v: unknown) => void }) {
  const toggleDay = (day: string) => {
    const cur = form.daysOff;
    set('daysOff', cur.includes(day) ? cur.filter(d => d !== day) : [...cur, day]);
  };
  const residual = form.totalAnnualLeave - form.usedAnnualLeave;

  return (
    <div className="space-y-3">
      <SectionTitle>근무형태 / 시간</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Select label="근무형태" value={form.workType} onChange={e => set('workType', e.target.value)}>
          {WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </Select>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">근무시간</label>
          <div className="flex items-center gap-2">
            <input type="time" value={form.workHours.start} onChange={e => set('workHours.start', e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500" />
            <span className="text-slate-500 text-sm">~</span>
            <input type="time" value={form.workHours.end} onChange={e => set('workHours.end', e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">주휴일</label>
        <div className="flex gap-1.5">
          {DAYS.map(d => (
            <button
              key={d}
              onClick={() => toggleDay(d)}
              className={`w-9 h-9 rounded-lg text-xs font-medium transition-colors
                ${form.daysOff.includes(d)
                  ? 'bg-teal-600 text-black'
                  : 'bg-slate-800 border border-slate-600 text-slate-400 hover:border-teal-500'}`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <SectionTitle>연차</SectionTitle>
      <Input label="연차부여기준일" type="date" value={form.annualLeaveBase || form.hireDate} onChange={e => set('annualLeaveBase', e.target.value)} />
      <div className="grid grid-cols-3 gap-3">
        <Input label="총 연차 (일)" type="number" value={form.totalAnnualLeave} onChange={e => set('totalAnnualLeave', Number(e.target.value))} />
        <Input label="사용 연차 (일)" type="number" value={form.usedAnnualLeave} onChange={e => set('usedAnnualLeave', Number(e.target.value))} />
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">잔여 연차</label>
          <div className={`bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm font-semibold
            ${residual > 5 ? 'text-teal-400' : residual > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
            {residual}일
          </div>
        </div>
      </div>
    </div>
  );
}

function TabEducation({ form, set }: { form: Employee; set: (p: string, v: unknown) => void }) {
  const addEdu = () => set('education', [...form.education, { level: '대졸', school: '', major: '', graduateYear: '' }]);
  const removeEdu = (i: number) => set('education', form.education.filter((_, idx) => idx !== i));
  const setEdu = (i: number, field: keyof EducationRow, val: string) =>
    set('education', form.education.map((e, idx) => idx === i ? { ...e, [field]: val } : e));

  const addCert = () => set('certifications', [...form.certifications, { name: '', acquiredDate: '' }]);
  const removeCert = (i: number) => set('certifications', form.certifications.filter((_, idx) => idx !== i));
  const setCert = (i: number, field: keyof CertRow, val: string) =>
    set('certifications', form.certifications.map((c, idx) => idx === i ? { ...c, [field]: val } : c));

  return (
    <div className="space-y-3">
      <SectionTitle>학력</SectionTitle>
      <div className="space-y-2">
        {form.education.map((e, i) => (
          <div key={i} className="grid grid-cols-[120px_1fr_1fr_80px_32px] gap-2 items-end">
            <Select value={e.level} onChange={ev => setEdu(i, 'level', ev.target.value)}>
              {EDU_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </Select>
            <Input placeholder="학교명" value={e.school} onChange={ev => setEdu(i, 'school', ev.target.value)} />
            <Input placeholder="전공" value={e.major} onChange={ev => setEdu(i, 'major', ev.target.value)} />
            <Input placeholder="졸업년도" value={e.graduateYear} onChange={ev => setEdu(i, 'graduateYear', ev.target.value)} />
            <button onClick={() => removeEdu(i)} className="p-1.5 text-slate-500 hover:text-red-400">
              <Minus className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button onClick={addEdu} className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 mt-1">
          <Plus className="w-3.5 h-3.5" /> 학력 추가
        </button>
      </div>

      <SectionTitle>자격증</SectionTitle>
      <div className="space-y-2">
        {form.certifications.map((c, i) => (
          <div key={i} className="flex gap-2 items-end">
            <Input placeholder="자격증명" value={c.name} onChange={e => setCert(i, 'name', e.target.value)} className="flex-1" />
            <Input placeholder="취득일" type="date" value={c.acquiredDate} onChange={e => setCert(i, 'acquiredDate', e.target.value)} className="w-40" />
            <button onClick={() => removeCert(i)} className="p-2 text-slate-500 hover:text-red-400 mb-0.5">
              <Minus className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button onClick={addCert} className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 mt-1">
          <Plus className="w-3.5 h-3.5" /> 자격증 추가
        </button>
      </div>

      <SectionTitle>식품위생교육</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Input label="이수일" type="date" value={form.hygieneCertDate} onChange={e => set('hygieneCertDate', e.target.value)} />
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400">만료일 (자동계산)</label>
          <div className={`bg-slate-800 border rounded-lg px-3 py-2 text-sm
            ${form.hygieneCertExpiry && new Date(form.hygieneCertExpiry) < new Date()
              ? 'border-red-500/50 text-red-400'
              : 'border-slate-600 text-slate-300'}`}>
            {form.hygieneCertExpiry || '-'}
            {form.hygieneCertExpiry && new Date(form.hygieneCertExpiry) < new Date() && (
              <span className="ml-2 text-[10px] text-red-400">만료</span>
            )}
          </div>
        </div>
      </div>

      <TextArea label="기타 교육이력" rows={2} value={form.otherEducation} onChange={e => set('otherEducation', e.target.value)} />
    </div>
  );
}

function TabInsurance({ form, set }: { form: Employee; set: (p: string, v: unknown) => void }) {
  const ins = form.insurance;
  const Row = ({ label, field, hasNumber = true }: { label: string; field: string; hasNumber?: boolean }) => {
    const val = (ins as Record<string, any>)[field] || {};
    return (
      <div className="flex items-center gap-3 py-2 border-b border-slate-800">
        <span className="text-sm text-slate-300 w-32 shrink-0">{label}</span>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={val.enrolled || false}
            onChange={e => set(`insurance.${field}.enrolled`, e.target.checked)}
            className="w-4 h-4 accent-teal-500"
          />
          <span className="text-xs text-slate-400">가입</span>
        </label>
        {hasNumber && val.enrolled && (
          <input
            placeholder="가입번호"
            value={val.number || ''}
            onChange={e => set(`insurance.${field}.number`, e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-teal-500"
          />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-1">
      <SectionTitle>4대보험 가입 현황</SectionTitle>
      <Row label="국민연금"    field="nationalPension" />
      <Row label="건강보험"    field="healthInsurance" />
      <Row label="고용보험"    field="employmentInsurance" />
      <Row label="산재보험"    field="industrialAccident" hasNumber={false} />
    </div>
  );
}

function TabPromotion({ form, set, departments }: { form: Employee; set: (p: string, v: unknown) => void; departments: Department[] }) {
  const addRow = () => set('promotionHistory', [
    ...form.promotionHistory,
    { date: '', type: '승진', fromDept: '', toDept: '', fromPosition: '', toPosition: '', reason: '' },
  ]);
  const removeRow = (i: number) => set('promotionHistory', form.promotionHistory.filter((_, idx) => idx !== i));
  const setRow = (i: number, field: keyof PromoRow, val: string) =>
    set('promotionHistory', form.promotionHistory.map((r, idx) => idx === i ? { ...r, [field]: val } : r));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle>발령 이력</SectionTitle>
        <button onClick={addRow} className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300">
          <Plus className="w-3.5 h-3.5" /> 추가
        </button>
      </div>

      {form.promotionHistory.length === 0 ? (
        <p className="text-slate-600 text-sm text-center py-8">발령 이력이 없습니다</p>
      ) : form.promotionHistory.map((row, i) => (
        <div key={i} className="bg-slate-800/50 rounded-xl p-3 space-y-2.5">
          <div className="grid grid-cols-[120px_120px_1fr_32px] gap-2 items-end">
            <Input label="발령일" type="date" value={row.date} onChange={e => setRow(i, 'date', e.target.value)} />
            <Select label="발령유형" value={row.type} onChange={e => setRow(i, 'type', e.target.value)}>
              {PROMO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
            <TextArea label="사유" rows={1} value={row.reason} onChange={e => setRow(i, 'reason', e.target.value)} />
            <button onClick={() => removeRow(i)} className="p-1.5 text-slate-500 hover:text-red-400 mb-0.5">
              <Minus className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Select label="이전 부서" value={row.fromDept} onChange={e => setRow(i, 'fromDept', e.target.value)}>
              <option value="">-</option>
              {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </Select>
            <Select label="현 부서" value={row.toDept} onChange={e => setRow(i, 'toDept', e.target.value)}>
              <option value="">-</option>
              {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </Select>
            <Select label="이전 직급" value={row.fromPosition} onChange={e => setRow(i, 'fromPosition', e.target.value)}>
              <option value="">-</option>
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </Select>
            <Select label="현 직급" value={row.toPosition} onChange={e => setRow(i, 'toPosition', e.target.value)}>
              <option value="">-</option>
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </Select>
          </div>
        </div>
      ))}
    </div>
  );
}

function TabAttachments({ form, set }: { form: Employee; set: (p: string, v: unknown) => void }) {
  const addRow = () => set('attachments', [
    ...form.attachments,
    { name: '', url: '', description: '', uploadedAt: new Date().toISOString().slice(0, 10) },
  ]);
  const removeRow = (i: number) => set('attachments', form.attachments.filter((_, idx) => idx !== i));
  const setRow = (i: number, field: keyof AttachRow, val: string) =>
    set('attachments', form.attachments.map((a, idx) => idx === i ? { ...a, [field]: val } : a));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionTitle>첨부파일</SectionTitle>
        <button onClick={addRow} className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300">
          <Plus className="w-3.5 h-3.5" /> 추가
        </button>
      </div>

      <div className="bg-amber-900/10 border border-amber-500/20 rounded-xl px-4 py-2.5 text-xs text-amber-400">
        Firebase Storage 업로드: 파일 URL을 직접 입력하거나, Firebase Storage에 업로드 후 URL을 붙여넣으세요.
      </div>

      {form.attachments.length === 0 ? (
        <p className="text-slate-600 text-sm text-center py-8">첨부파일이 없습니다</p>
      ) : form.attachments.map((att, i) => (
        <div key={i} className="bg-slate-800/50 rounded-xl p-3 space-y-2">
          <div className="flex items-end gap-2">
            <Input label="파일명" value={att.name} onChange={e => setRow(i, 'name', e.target.value)} placeholder="예: 재직증명서.pdf" className="flex-1" />
            <button onClick={() => removeRow(i)} className="p-2 text-slate-500 hover:text-red-400 mb-0.5">
              <Minus className="w-4 h-4" />
            </button>
          </div>
          <Input label="파일 URL" value={att.url} onChange={e => setRow(i, 'url', e.target.value)} placeholder="https://firebasestorage.googleapis.com/..." />
          <div className="grid grid-cols-2 gap-2">
            <Input label="설명" value={att.description} onChange={e => setRow(i, 'description', e.target.value)} placeholder="파일 설명" />
            <Input label="업로드일" type="date" value={att.uploadedAt} onChange={e => setRow(i, 'uploadedAt', e.target.value)} />
          </div>
          {att.url && (
            <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-400 hover:underline">파일 열기 →</a>
          )}
        </div>
      ))}
    </div>
  );
}

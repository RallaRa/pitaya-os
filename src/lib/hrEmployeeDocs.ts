export const HR_DOC_TYPES = [
  {
    id: 'employment_contract',
    label: '근로계약서',
    icon: '📄',
    desc: '성명·입사일·부서·직급·급여·근무시간 자동 추출',
  },
  {
    id: 'health_certificate',
    label: '보건증',
    icon: '🏥',
    desc: '식품위생교육·보건증 이수·만료일 자동 추출',
  },
  {
    id: 'bank_account',
    label: '통장사본',
    icon: '🏦',
    desc: '은행명·계좌번호·예금주 자동 추출',
  },
] as const;

export type HrDocTypeId = (typeof HR_DOC_TYPES)[number]['id'];

export interface HrEmployeeDocument {
  docType: HrDocTypeId;
  fileName: string;
  fileUrl: string;
  filePath: string;
  mimeType: string;
  uploadedAt: string;
  extractedData?: Record<string, unknown> | null;
}

/** AI 추출 결과 → 사원 폼 필드 반영 */
export function applyHrDocExtracted(
  docType: HrDocTypeId,
  extracted: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (docType === 'employment_contract') {
    if (extracted.name) patch.name = String(extracted.name);
    if (extracted.nameEn) patch.nameEn = String(extracted.nameEn);
    if (extracted.birthDate) patch.birthDate = String(extracted.birthDate);
    if (extracted.gender) patch.gender = String(extracted.gender);
    if (extracted.phone) patch.phone = String(extracted.phone);
    if (extracted.personalEmail) patch.personalEmail = String(extracted.personalEmail);
    if (extracted.hireDate) patch.hireDate = String(extracted.hireDate);
    if (extracted.probationEndDate) patch.probationEndDate = String(extracted.probationEndDate);
    if (extracted.department) patch.department = String(extracted.department);
    if (extracted.position) patch.position = String(extracted.position);
    if (extracted.jobTitle) patch.jobTitle = String(extracted.jobTitle);
    if (extracted.employmentType) patch.employmentType = String(extracted.employmentType);
    if (extracted.duties) patch.duties = String(extracted.duties);
    if (extracted.address) {
      patch.address = { address1: String(extracted.address), zipCode: '', address2: '' };
    }
    const salaryPatch: Record<string, unknown> = {};
    if (extracted.baseSalary != null) salaryPatch.baseSalary = Number(extracted.baseSalary) || 0;
    if (extracted.mealAllowance != null) salaryPatch.mealAllowance = Number(extracted.mealAllowance) || 0;
    if (extracted.transportAllowance != null) salaryPatch.transportAllowance = Number(extracted.transportAllowance) || 0;
    if (extracted.payDay != null) salaryPatch.payDay = Number(extracted.payDay) || 25;
    if (Object.keys(salaryPatch).length) patch.salary = salaryPatch;
    if (extracted.workStart || extracted.workEnd) {
      patch.workHours = {
        start: extracted.workStart ? String(extracted.workStart) : '09:00',
        end: extracted.workEnd ? String(extracted.workEnd) : '18:00',
      };
    }
  }

  if (docType === 'health_certificate') {
    const issue = extracted.issueDate || extracted.hygieneCertDate || extracted.trainingDate;
    const expiry = extracted.expiryDate || extracted.hygieneCertExpiry;
    if (issue) patch.hygieneCertDate = String(issue).slice(0, 10);
    if (expiry) patch.hygieneCertExpiry = String(expiry).slice(0, 10);
    if (extracted.name && !patch.name) patch.name = String(extracted.name);
    if (extracted.certName) {
      patch.certifications = [{ name: String(extracted.certName), acquiredDate: issue ? String(issue).slice(0, 10) : '' }];
    }
  }

  if (docType === 'bank_account') {
    const salaryPatch: Record<string, unknown> = {};
    if (extracted.bankName) salaryPatch.bankName = String(extracted.bankName);
    if (extracted.accountNumber) salaryPatch.accountNo = String(extracted.accountNumber);
    if (Object.keys(salaryPatch).length) patch.salary = salaryPatch;
    if (extracted.accountHolder && !patch.name) patch.name = String(extracted.accountHolder);
  }

  return patch;
}

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

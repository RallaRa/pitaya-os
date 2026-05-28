import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { isAdminOrAbove } from '@/lib/auth/permissions';
import { encrypt, maskPhone } from '@/lib/encryption';

async function checkAdmin(req: Request) {
  const user = await verifyToken(req);
  if (!user) return null;
  const userDoc = await adminDb.collection('users').doc(user.uid).get();
  const data = userDoc.data();
  if (!isAdminOrAbove(data?.groupId || 'staff', data?.email)) return null;
  return { uid: user.uid, email: user.email, groupId: data?.groupId || 'staff' };
}

function maskSSN(ssn: string): string {
  if (!ssn) return '';
  const digits = ssn.replace(/\D/g, '');
  if (digits.length >= 13) return `${digits.slice(0, 6)}-${'*'.repeat(7)}`;
  if (digits.length >= 6) return `${digits.slice(0, 6)}-*******`;
  return ssn.slice(0, 3) + '****';
}

function maskAccountNo(account: string): string {
  if (!account) return '';
  const d = account.replace(/\D/g, '');
  if (d.length >= 8) return `${'*'.repeat(d.length - 4)}${d.slice(-4)}`;
  return '****';
}

async function generateEmpNo(storeId: string, hireDate: string): Promise<string> {
  const year = hireDate ? hireDate.slice(2, 4) : new Date().getFullYear().toString().slice(2);
  const prefix = year;
  const snap = await adminDb.collection('hr_employees')
    .where('storeId', '==', storeId)
    .orderBy('empNo', 'desc')
    .limit(100)
    .get();
  const existing = snap.docs
    .map(d => d.data().empNo as string)
    .filter(e => e && e.startsWith(prefix));
  if (existing.length === 0) return `${prefix}001`;
  const maxSeq = Math.max(...existing.map(e => parseInt(e.slice(prefix.length), 10) || 0));
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

// GET /api/hr/employees?storeId=X&empNo=X
export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const empNo   = searchParams.get('empNo')   || '';

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  if (empNo) {
    const docId = `${storeId}_${empNo}`;
    const snap  = await adminDb.collection('hr_employees').doc(docId).get();
    if (!snap.exists) return NextResponse.json({ error: '사원을 찾을 수 없습니다' }, { status: 404 });
    const data  = snap.data()!;
    return NextResponse.json({
      employee: {
        ...data,
        ssnMasked:       data.ssnEncrypted       ? maskSSN('000000-0000000')       : '',
        accountNoMasked: data.salary?.accountNoEncrypted ? maskAccountNo('00000000000') : '',
        ssnEncrypted:    undefined,
        salary:          data.salary ? { ...data.salary, accountNoEncrypted: undefined } : data.salary,
      },
    });
  }

  const snap = await adminDb.collection('hr_employees')
    .where('storeId', '==', storeId)
    .orderBy('name')
    .get();

  const employees = snap.docs.map(d => {
    const data = d.data();
    return {
      docId:     d.id,
      empNo:     data.empNo,
      name:      data.name,
      department: data.department,
      position:  data.position,
      status:    data.status,
      hireDate:  data.hireDate,
      linkedUid: data.linkedUid || '',
      isAdminAccount: data.isAdminAccount || false,
      photoUrl:  data.photoUrl || '',
    };
  });

  return NextResponse.json({ employees });
}

// POST /api/hr/employees  — create
export async function POST(req: Request) {
  const admin = await checkAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { storeId } = body;
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  if (!body.name)     return NextResponse.json({ error: '성명은 필수입니다' }, { status: 400 });
  if (!body.hireDate) return NextResponse.json({ error: '입사일은 필수입니다' }, { status: 400 });

  // empNo: use provided or auto-generate
  let empNo = (body.empNo || '').trim();
  if (!empNo) {
    empNo = await generateEmpNo(storeId, body.hireDate);
  } else {
    const existingDoc = await adminDb.collection('hr_employees').doc(`${storeId}_${empNo}`).get();
    if (existingDoc.exists) return NextResponse.json({ error: '사원번호가 이미 존재합니다' }, { status: 409 });
  }

  const docId = `${storeId}_${empNo}`;
  const now   = new Date().toISOString();

  // Encrypt sensitive fields
  const ssnEncrypted       = body.ssn        ? encrypt(body.ssn)       : '';
  const accountNoEncrypted = body.salary?.accountNo ? encrypt(body.salary.accountNo) : '';

  const salary = body.salary ? {
    type:              body.salary.type              || 'monthly',
    baseSalary:        Number(body.salary.baseSalary)        || 0,
    mealAllowance:     Number(body.salary.mealAllowance)     || 0,
    transportAllowance: Number(body.salary.transportAllowance) || 0,
    otherAllowances:   body.salary.otherAllowances   || [],
    totalMonthly:      Number(body.salary.totalMonthly)      || 0,
    payDay:            Number(body.salary.payDay)            || 25,
    bankName:          body.salary.bankName          || '',
    accountNoEncrypted,
  } : { type: 'monthly', baseSalary: 0, mealAllowance: 0, transportAllowance: 0, otherAllowances: [], totalMonthly: 0, payDay: 25, bankName: '', accountNoEncrypted: '' };

  const docData: Record<string, any> = {
    empNo,
    name:             body.name,
    nameEn:           body.nameEn            || '',
    gender:           body.gender            || '',
    birthDate:        body.birthDate         || '',
    ssnEncrypted,
    nationality:      body.nationality       || '대한민국',
    photoUrl:         body.photoUrl          || '',
    phone:            body.phone             || '',
    emergencyContact: body.emergencyContact  || { name: '', relation: '', phone: '' },
    personalEmail:    body.personalEmail     || '',
    companyEmail:     body.companyEmail      || '',
    address:          body.address           || { zipCode: '', address1: '', address2: '' },
    residenceAddress: body.residenceAddress  || { sameAsAddress: true, zipCode: '', address1: '', address2: '' },
    department:       body.department        || '',
    position:         body.position          || '사원',
    jobTitle:         body.jobTitle          || '',
    employmentType:   body.employmentType    || '정규직',
    hireDate:         body.hireDate,
    probationEndDate: body.probationEndDate  || '',
    status:           body.status            || '재직',
    resignDate:       body.resignDate        || '',
    resignReason:     body.resignReason      || '',
    duties:           body.duties            || '',
    salary,
    salaryContracts:  body.salaryContracts   || [],
    workType:         body.workType          || '주5일',
    workHours:        body.workHours         || { start: '09:00', end: '18:00' },
    daysOff:          body.daysOff           || ['토', '일'],
    annualLeaveBase:  body.annualLeaveBase   || body.hireDate,
    totalAnnualLeave: Number(body.totalAnnualLeave) || 15,
    usedAnnualLeave:  Number(body.usedAnnualLeave)  || 0,
    education:        body.education         || [],
    certifications:   body.certifications    || [],
    hygieneCertDate:  body.hygieneCertDate   || '',
    hygieneCertExpiry: body.hygieneCertExpiry || '',
    otherEducation:   body.otherEducation    || '',
    insurance:        body.insurance         || {
      nationalPension:    { enrolled: false, number: '' },
      healthInsurance:    { enrolled: false, number: '' },
      employmentInsurance:{ enrolled: false, number: '' },
      industrialAccident: { enrolled: false },
    },
    promotionHistory: body.promotionHistory  || [],
    attachments:      body.attachments       || [],
    adminMemo:        body.adminMemo         || '',
    notes:            body.notes             || '',
    isAdminAccount:   body.isAdminAccount    || false,
    linkedUid:        body.linkedUid         || '',
    linkedEmail:      body.linkedEmail       || '',
    storeId,
    createdAt:        now,
    updatedAt:        now,
    createdBy:        admin.uid,
  };

  await adminDb.collection('hr_employees').doc(docId).set(docData);
  return NextResponse.json({ ok: true, empNo });
}

// PUT /api/hr/employees  — update
export async function PUT(req: Request) {
  const admin = await checkAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { storeId, empNo } = body;
  if (!storeId || !empNo) return NextResponse.json({ error: 'storeId, empNo required' }, { status: 400 });

  const docId  = `${storeId}_${empNo}`;
  const docRef = adminDb.collection('hr_employees').doc(docId);
  const snap   = await docRef.get();
  if (!snap.exists) return NextResponse.json({ error: '사원을 찾을 수 없습니다' }, { status: 404 });

  const existing = snap.data()!;

  // Encrypt only when new plaintext provided
  const ssnEncrypted = body.ssn
    ? encrypt(body.ssn)
    : (existing.ssnEncrypted || '');

  const accountNoEncrypted = body.salary?.accountNo
    ? encrypt(body.salary.accountNo)
    : (existing.salary?.accountNoEncrypted || '');

  const salary = body.salary ? {
    type:              body.salary.type              ?? existing.salary?.type              ?? 'monthly',
    baseSalary:        Number(body.salary.baseSalary)        || 0,
    mealAllowance:     Number(body.salary.mealAllowance)     || 0,
    transportAllowance: Number(body.salary.transportAllowance) || 0,
    otherAllowances:   body.salary.otherAllowances   ?? [],
    totalMonthly:      Number(body.salary.totalMonthly)      || 0,
    payDay:            Number(body.salary.payDay)            || 25,
    bankName:          body.salary.bankName          ?? '',
    accountNoEncrypted,
  } : existing.salary;

  const updates: Record<string, any> = {
    name:             body.name             ?? existing.name,
    nameEn:           body.nameEn           ?? existing.nameEn           ?? '',
    gender:           body.gender           ?? existing.gender           ?? '',
    birthDate:        body.birthDate        ?? existing.birthDate        ?? '',
    ssnEncrypted,
    nationality:      body.nationality      ?? existing.nationality      ?? '',
    photoUrl:         body.photoUrl         ?? existing.photoUrl         ?? '',
    phone:            body.phone            ?? existing.phone            ?? '',
    emergencyContact: body.emergencyContact ?? existing.emergencyContact ?? {},
    personalEmail:    body.personalEmail    ?? existing.personalEmail    ?? '',
    companyEmail:     body.companyEmail     ?? existing.companyEmail     ?? '',
    address:          body.address          ?? existing.address          ?? {},
    residenceAddress: body.residenceAddress ?? existing.residenceAddress ?? {},
    department:       body.department       ?? existing.department       ?? '',
    position:         body.position         ?? existing.position         ?? '',
    jobTitle:         body.jobTitle         ?? existing.jobTitle         ?? '',
    employmentType:   body.employmentType   ?? existing.employmentType   ?? '',
    hireDate:         body.hireDate         ?? existing.hireDate         ?? '',
    probationEndDate: body.probationEndDate ?? existing.probationEndDate ?? '',
    status:           body.status           ?? existing.status           ?? '재직',
    resignDate:       body.resignDate       ?? existing.resignDate       ?? '',
    resignReason:     body.resignReason     ?? existing.resignReason     ?? '',
    duties:           body.duties           ?? existing.duties           ?? '',
    salary,
    salaryContracts:  body.salaryContracts  ?? existing.salaryContracts  ?? [],
    workType:         body.workType         ?? existing.workType         ?? '',
    workHours:        body.workHours        ?? existing.workHours        ?? {},
    daysOff:          body.daysOff          ?? existing.daysOff          ?? [],
    annualLeaveBase:  body.annualLeaveBase  ?? existing.annualLeaveBase  ?? '',
    totalAnnualLeave: body.totalAnnualLeave !== undefined ? Number(body.totalAnnualLeave) : (existing.totalAnnualLeave ?? 15),
    usedAnnualLeave:  body.usedAnnualLeave  !== undefined ? Number(body.usedAnnualLeave)  : (existing.usedAnnualLeave  ?? 0),
    education:        body.education        ?? existing.education        ?? [],
    certifications:   body.certifications   ?? existing.certifications   ?? [],
    hygieneCertDate:  body.hygieneCertDate  ?? existing.hygieneCertDate  ?? '',
    hygieneCertExpiry: body.hygieneCertExpiry ?? existing.hygieneCertExpiry ?? '',
    otherEducation:   body.otherEducation   ?? existing.otherEducation   ?? '',
    insurance:        body.insurance        ?? existing.insurance        ?? {},
    promotionHistory: body.promotionHistory ?? existing.promotionHistory ?? [],
    attachments:      body.attachments      ?? existing.attachments      ?? [],
    adminMemo:        body.adminMemo        ?? existing.adminMemo        ?? '',
    notes:            body.notes            ?? existing.notes            ?? '',
    isAdminAccount:   body.isAdminAccount   ?? existing.isAdminAccount   ?? false,
    linkedUid:        body.linkedUid        ?? existing.linkedUid        ?? '',
    linkedEmail:      body.linkedEmail      ?? existing.linkedEmail      ?? '',
    updatedAt:        new Date().toISOString(),
  };

  await docRef.update(updates);
  return NextResponse.json({ ok: true });
}

// DELETE /api/hr/employees?storeId=X&empNo=X
export async function DELETE(req: Request) {
  const admin = await checkAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const empNo   = searchParams.get('empNo')   || '';
  if (!storeId || !empNo) return NextResponse.json({ error: 'storeId, empNo required' }, { status: 400 });

  const docId = `${storeId}_${empNo}`;
  const snap  = await adminDb.collection('hr_employees').doc(docId).get();
  if (!snap.exists) return NextResponse.json({ error: '사원을 찾을 수 없습니다' }, { status: 404 });

  await adminDb.collection('hr_employees').doc(docId).delete();
  return NextResponse.json({ ok: true });
}

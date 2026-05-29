import { NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import { v4 as uuidv4 } from 'uuid';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId 필요' }, { status: 400 });

  try {
    const snap = await adminDb.collection('store_documents')
      .where('storeId', '==', storeId)
      .orderBy('uploadedAt', 'desc')
      .get();

    const documents = snap.docs.map(d => {
      const data = d.data();
      return {
        docId: d.id,
        ...data,
        uploadedAt: data.uploadedAt?.toDate?.()?.toISOString() ?? null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
      };
    });

    return NextResponse.json({ documents });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { storeId, docType, docName, fileName, fileContent, mimeType, issueDate, expiryDate, notes } = body;

    if (!storeId || !docType || !fileContent || !fileName) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
    }

    const base64 = fileContent.includes(',') ? fileContent.split(',')[1] : fileContent;
    const buffer = Buffer.from(base64, 'base64');

    if (buffer.length > 15 * 1024 * 1024) {
      return NextResponse.json({ error: '파일 크기는 15MB 이하여야 합니다.' }, { status: 400 });
    }

    const token = uuidv4();
    const ext = fileName.split('.').pop()?.toLowerCase() || 'bin';
    const safeName = `${Date.now()}_${token.slice(0, 8)}.${ext}`;
    const filePath = `store_docs/${storeId}/${docType}/${safeName}`;

    const bucket = adminStorage.bucket();
    const storageFile = bucket.file(filePath);
    await storageFile.save(buffer, {
      metadata: {
        contentType: mimeType || 'application/octet-stream',
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    const bucketName = bucket.name;
    const fileUrl =
      `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;

    const docRef = await adminDb.collection('store_documents').add({
      storeId,
      docType,
      docName: docName || '',
      fileName,
      fileUrl,
      filePath,
      mimeType: mimeType || '',
      issueDate: issueDate || null,
      expiryDate: expiryDate || null,
      notes: notes || '',
      extractedData: null,
      uploadedAt: FieldValue.serverTimestamp(),
      uploadedBy: authUser.uid,
    });

    return NextResponse.json({ success: true, docId: docRef.id, fileUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { docId, ...rest } = body;
    if (!docId) return NextResponse.json({ error: 'docId 필요' }, { status: 400 });

    const allowedKeys = ['issueDate', 'expiryDate', 'notes', 'docName', 'extractedData'];
    const updates: any = { updatedAt: FieldValue.serverTimestamp() };
    for (const key of allowedKeys) {
      if (key in rest) updates[key] = rest[key];
    }

    await adminDb.collection('store_documents').doc(docId).update(updates);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const docId = searchParams.get('docId');
    if (!docId) return NextResponse.json({ error: 'docId 필요' }, { status: 400 });

    const snap = await adminDb.collection('store_documents').doc(docId).get();
    if (!snap.exists) return NextResponse.json({ error: '문서 없음' }, { status: 404 });

    const { filePath } = snap.data() as any;
    if (filePath) {
      try { await adminStorage.bucket().file(filePath).delete(); } catch {}
    }

    await adminDb.collection('store_documents').doc(docId).delete();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

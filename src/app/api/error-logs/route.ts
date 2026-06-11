import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import type { PitayaErrorType } from '@/components/error-boundary/types';

const VALID_TYPES = new Set<PitayaErrorType>([
  'NetworkError',
  'AuthError',
  'NotFoundError',
  'UnknownError',
]);

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const type = body.type as PitayaErrorType;
    const message = typeof body.message === 'string' ? body.message.slice(0, 2000) : 'Unknown error';
    const stack = typeof body.stack === 'string' ? body.stack.slice(0, 8000) : undefined;
    const page = typeof body.page === 'string' ? body.page.slice(0, 500) : '';
    const userId = typeof body.userId === 'string' ? body.userId : authUser.uid;

    if (!VALID_TYPES.has(type)) {
      return NextResponse.json({ error: 'Invalid error type' }, { status: 400 });
    }

    const ref = await adminDb.collection('error_logs').add({
      type,
      message,
      stack: stack ?? null,
      page,
      userId,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ logId: ref.id });
  } catch (e) {
    console.error('[error-logs]', e);
    return NextResponse.json({ error: 'Failed to save error log' }, { status: 500 });
  }
}

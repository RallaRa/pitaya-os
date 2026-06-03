import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import { isPlatformSuperuser } from '@/lib/superuserCheck';

async function requireAdmin(authUser: { uid: string; email?: string }) {
  const isSU = await isPlatformSuperuser(authUser.uid, authUser.email);
  if (!isSU) return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  return null;
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const snap = await adminDb.collection('scraper_sources').get();
    const sources = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
    return NextResponse.json({ sources });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = await requireAdmin(authUser);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { id, name, url, enabled, encoding, categories, selectors } = body;
    if (!id || !name || !url) {
      return NextResponse.json({ error: 'id, name, url 필수' }, { status: 400 });
    }

    await adminDb.collection('scraper_sources').doc(id).set({
      name,
      url,
      enabled: enabled !== false,
      encoding: encoding || 'utf-8',
      categories: categories || [],
      selectors: selectors || { item: '.goods-item', name: '.name', price: '.price' },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = await requireAdmin(authUser);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { id, enabled, bondaeroAccessToken, bondaeroRefreshToken, ...rest } = body;
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

    const patch: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (typeof enabled === 'boolean') patch.enabled = enabled;
    if (typeof bondaeroAccessToken === 'string') {
      patch.bondaeroAccessToken = bondaeroAccessToken.trim();
    }
    if (typeof bondaeroRefreshToken === 'string') {
      patch.bondaeroRefreshToken = bondaeroRefreshToken.trim();
    }
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) patch[key] = value;
    }

    await adminDb.collection('scraper_sources').doc(id).set(patch, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = await requireAdmin(authUser);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

    await adminDb.collection('scraper_sources').doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import { isWithinStore } from '@/lib/kakao/location';
import {
  attendanceDistanceM,
  isWithinAttendanceRange,
  resolveAttendanceGeo,
} from '@/lib/hr/attendanceGeo';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import { sendKakaoNotifySafe, sendKakaoNotifyToStore } from '@/lib/kakao/sendNotify';

function todayStr() {
  return getKSTTodayYMD();
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const uid = searchParams.get('uid') || authUser.uid;
  const date = searchParams.get('date') || todayStr();

  try {
    let q = adminDb.collection('hr_attendance')
      .where('uid', '==', uid)
      .where('date', '==', date);
    if (storeId) q = q.where('storeId', '==', storeId);

    const snap = await q.limit(10).get();
    const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ records });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '조회 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const {
      storeId,
      type,
      lat,
      lng,
      employeeId,
    } = body;

    const userId = employeeId || authUser.uid;
    if (userId !== authUser.uid) {
      return NextResponse.json({ error: '본인 출퇴근만 처리할 수 있습니다.' }, { status: 403 });
    }

    if (!storeId || lat == null || lng == null) {
      return NextResponse.json({ error: 'storeId, lat, lng 필수' }, { status: 400 });
    }

    const attendType = type === 'in' ? 'check_in' : type === 'out' ? 'check_out' : type;
    if (!['check_in', 'check_out'].includes(attendType)) {
      return NextResponse.json({ error: 'type은 check_in/check_out 또는 in/out' }, { status: 400 });
    }

    const storeDoc = await adminDb.collection('stores').doc(storeId).get();
    const storeData = storeDoc.exists ? storeDoc.data() : null;

    const userLat = Number(lat);
    const userLng = Number(lng);
    const geo = resolveAttendanceGeo(storeData);
    const inRange = isWithinAttendanceRange(userLat, userLng, storeData)
      || isWithinStore(userLat, userLng);

    if (!inRange) {
      const dist = attendanceDistanceM(userLat, userLng, storeData);
      return NextResponse.json(
        { error: `매장 ${geo.radiusM}m 밖입니다 (${dist}m). 매장 근처에서만 출퇴근할 수 있습니다.` },
        { status: 400 },
      );
    }

    const date = todayStr();
    const existing = await adminDb.collection('hr_attendance')
      .where('uid', '==', userId)
      .where('storeId', '==', storeId)
      .where('date', '==', date)
      .limit(1)
      .get();

    const now = FieldValue.serverTimestamp();
    const payload = { lat: Number(lat), lng: Number(lng), recordedAt: now };
    const userDoc = await adminDb.collection('users').doc(userId).get();
    const userName = userDoc.data()?.name || userDoc.data()?.nickname || '직원';

    if (existing.empty) {
      if (attendType === 'check_out') {
        return NextResponse.json({ error: '출근 기록이 없습니다.' }, { status: 400 });
      }
      const ref = await adminDb.collection('hr_attendance').add({
        uid: userId,
        storeId,
        date,
        checkIn: payload,
        checkOut: null,
        createdAt: now,
        updatedAt: now,
      });

      await sendKakaoNotifyToStore(storeId, {
        title: '🕐 출근',
        message: `${userName}님이 출근했습니다.`,
        link: `${process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app'}/dashboard/hr/attendance`,
      });
      await sendKakaoNotifySafe({
        userId,
        title: '🕐 출근 완료',
        message: `${date} 출근이 기록되었습니다.`,
      });

      return NextResponse.json({ id: ref.id, type: attendType });
    }

    const doc = existing.docs[0];
    const data = doc.data();

    if (attendType === 'check_in') {
      if (data.checkIn) {
        return NextResponse.json({ error: '이미 출근 처리되었습니다.' }, { status: 409 });
      }
      await doc.ref.update({ checkIn: payload, updatedAt: now });
      return NextResponse.json({ id: doc.id, type: attendType });
    }

    if (data.checkOut) {
      return NextResponse.json({ error: '이미 퇴근 처리되었습니다.' }, { status: 409 });
    }
    await doc.ref.update({ checkOut: payload, updatedAt: now });

    await sendKakaoNotifyToStore(storeId, {
      title: '🕐 퇴근',
      message: `${userName}님이 퇴근했습니다.`,
      link: `${process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app'}/dashboard/hr/attendance`,
    });
    await sendKakaoNotifySafe({
      userId,
      title: '🕐 퇴근 완료',
      message: `${date} 퇴근이 기록되었습니다.`,
    });

    return NextResponse.json({ id: doc.id, type: attendType });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '출퇴근 처리 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

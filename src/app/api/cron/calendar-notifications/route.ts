import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET || '';
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now       = new Date();
  const todayStr  = toDateStr(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  let sent = 0;

  try {
    // 이벤트 알림 처리
    const evSnap = await adminDb.collection('calendar_events')
      .where('startDate', '>=', todayStr)
      .limit(500).get();

    for (const doc of evSnap.docs) {
      const ev = doc.data();
      if (!ev.reminders?.length) continue;

      for (const reminder of ev.reminders) {
        const reminderMinutes = Number(reminder.minutes || 0);
        const eventStartMinutes = ev.startTime
          ? parseInt(ev.startTime.split(':')[0]) * 60 + parseInt(ev.startTime.split(':')[1])
          : 9 * 60;

        const notifyAtMinutes = eventStartMinutes - reminderMinutes;
        const eventDate = ev.startDate;

        if (eventDate === todayStr && Math.abs(nowMinutes - notifyAtMinutes) <= 1) {
          // 알림 발송 (NotificationHub 연동)
          if (ev.createdBy) {
            const notifRef = adminDb.collection('notifications').doc(ev.createdBy)
              .collection('items');
            await notifRef.add({
              type:      'calendar_reminder',
              title:     `일정 알림: ${ev.title}`,
              body:      `${reminderMinutes}분 후 일정이 시작됩니다`,
              eventId:   doc.id,
              read:      false,
              createdAt: FieldValue.serverTimestamp(),
            });
            sent++;
          }
        }
      }
    }

    // 할 일 마감일 오전 9시 알림
    if (nowMinutes >= 9 * 60 && nowMinutes < 9 * 60 + 2) {
      const todoSnap = await adminDb.collection('calendar_todos')
        .where('dueDate', '==', todayStr)
        .where('completed', '==', false)
        .limit(200).get();

      for (const doc of todoSnap.docs) {
        const todo = doc.data();
        if (!todo.createdBy) continue;

        const notifRef = adminDb.collection('notifications').doc(todo.createdBy)
          .collection('items');
        await notifRef.add({
          type:    'todo_due',
          title:   `오늘 마감: ${todo.title}`,
          body:    '마감일이 오늘입니다',
          todoId:  doc.id,
          read:    false,
          createdAt: FieldValue.serverTimestamp(),
        });
        sent++;
      }
    }

    return NextResponse.json({ ok: true, sent, processedAt: now.toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, message: 'calendar-notifications cron endpoint' });
}

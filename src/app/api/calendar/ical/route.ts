import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';

// iCal 내보내기
export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId  = searchParams.get('userId');
  const storeId = searchParams.get('storeId');

  try {
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Pitaya OS//HR Calendar//KO',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Pitaya OS 인사 달력',
      'X-WR-TIMEZONE:Asia/Seoul',
    ];

    // 연차
    if (userId) {
      const leaveSnap = await adminDb.collection('hr_leave_requests')
        .where('userId', '==', userId)
        .where('status', '==', 'approved')
        .get();

      leaveSnap.docs.forEach(doc => {
        const d = doc.data();
        const typeLabel = { annual: '연차', half_am: '반차(오전)', half_pm: '반차(오후)' }[d.type as string] || d.type;
        lines.push(
          'BEGIN:VEVENT',
          `UID:leave_${doc.id}@pitaya-os`,
          `DTSTART;VALUE=DATE:${d.startDate?.replace(/-/g, '')}`,
          `DTEND;VALUE=DATE:${d.endDate?.replace(/-/g, '')}`,
          `SUMMARY:${typeLabel}`,
          `DESCRIPTION:${d.reason || ''}`,
          'CATEGORIES:연차',
          'END:VEVENT',
        );
      });

      const dayoffSnap = await adminDb.collection('hr_dayoff_requests')
        .where('userId', '==', userId)
        .where('status', '==', 'approved')
        .get();

      dayoffSnap.docs.forEach(doc => {
        const d = doc.data();
        const typeLabel = { regular: '정기휴무', substitute: '대체휴무', unpaid: '무급휴무' }[d.type as string] || d.type;
        (d.dates || []).forEach((date: string) => {
          lines.push(
            'BEGIN:VEVENT',
            `UID:dayoff_${doc.id}_${date}@pitaya-os`,
            `DTSTART;VALUE=DATE:${date.replace(/-/g, '')}`,
            `DTEND;VALUE=DATE:${date.replace(/-/g, '')}`,
            `SUMMARY:${typeLabel}`,
            `DESCRIPTION:${d.reason || ''}`,
            'CATEGORIES:휴무',
            'END:VEVENT',
          );
        });
      });
    }

    // 업무 일정
    if (storeId) {
      const eventsSnap = await adminDb.collection('hr_calendar_events')
        .where('storeId', '==', storeId)
        .get();

      eventsSnap.docs.forEach(doc => {
        const d = doc.data();
        lines.push(
          'BEGIN:VEVENT',
          `UID:event_${doc.id}@pitaya-os`,
          `DTSTART;VALUE=DATE:${d.startDate?.replace(/-/g, '')}`,
          `DTEND;VALUE=DATE:${(d.endDate || d.startDate)?.replace(/-/g, '')}`,
          `SUMMARY:${d.title}`,
          `DESCRIPTION:${d.description || ''}`,
          'END:VEVENT',
        );
      });
    }

    lines.push('END:VCALENDAR');

    return new Response(lines.join('\r\n'), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="pitaya-calendar.ics"',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// iCal 가져오기 (.ics 파싱)
export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file     = formData.get('file') as File | null;
    const userId   = formData.get('userId') as string;
    const storeId  = formData.get('storeId') as string;

    if (!file) return NextResponse.json({ error: '파일 없음' }, { status: 400 });

    const text   = await file.text();
    const events = parseICS(text);

    return NextResponse.json({
      events: events.map(e => ({
        ...e,
        userId:  userId || '',
        storeId: storeId || '',
        source:  'ical',
      })),
      count: events.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function parseICS(text: string): any[] {
  const events: any[] = [];
  const blocks = text.split('BEGIN:VEVENT');

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const get   = (key: string): string => {
      const m = block.match(new RegExp(`^${key}[^:]*:(.+)`, 'm'));
      return m ? m[1].trim().replace(/\\n/g, '\n').replace(/\\,/g, ',') : '';
    };

    const dtstart = get('DTSTART');
    const dtend   = get('DTEND');

    const toDate = (s: string) => {
      if (!s) return '';
      // YYYYMMDD or YYYYMMDDTHHmmssZ
      return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
    };

    const startDate = toDate(dtstart.replace(/T.*/, ''));
    if (!startDate) continue;

    events.push({
      id:          `ical_${get('UID') || i}`,
      title:       get('SUMMARY') || '(가져온 일정)',
      startDate,
      endDate:     toDate(dtend.replace(/T.*/, '')) || startDate,
      description: get('DESCRIPTION'),
      type:        'task',
      source:      'ical',
      color:       'bg-slate-500',
    });
  }

  return events;
}

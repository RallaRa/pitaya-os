import { NextResponse } from 'next/server';
import { requireStockSuperuser, stockAccessDeniedResponse } from '@/lib/stock/superuserAuth';
import { getJournalStats, listJournalEntries } from '@/lib/stock/journal.server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);

  const [entries, stats] = await Promise.all([
    listJournalEntries(auth.user.uid),
    getJournalStats(auth.user.uid),
  ]);

  return NextResponse.json({ ok: true, entries, stats });
}

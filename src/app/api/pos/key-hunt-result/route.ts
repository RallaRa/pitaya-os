import { NextResponse } from 'next/server';

let lastResult: { text: string; at: string; host?: string } | null = null;

function checkAuth(req: Request): boolean {
  const apiKey =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    req.headers.get('x-api-key') ||
    '';
  return !!process.env.POS_BRIDGE_KEY && apiKey === process.env.POS_BRIDGE_KEY;
}

/** POST /api/pos/key-hunt-result — POS key hunt 로그 업로드 */
export async function POST(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const text = await req.text();
  if (!text.trim()) {
    return NextResponse.json({ error: 'Empty body' }, { status: 400 });
  }

  lastResult = {
    text,
    at: new Date().toISOString(),
    host: req.headers.get('x-pos-host') || undefined,
  };

  return NextResponse.json({
    ok: true,
    bytes: text.length,
    at: lastResult.at,
    hint: 'Mac: npm run fetch-key-hunt',
  });
}

/** GET /api/pos/key-hunt-result — 맥에서 결과 다운로드 */
export async function GET(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!lastResult) {
    return NextResponse.json({ error: 'No result uploaded yet' }, { status: 404 });
  }

  return new NextResponse(lastResult.text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Uploaded-At': lastResult.at,
      'Cache-Control': 'no-store',
    },
  });
}

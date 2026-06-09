import { requireSuperuser } from '@/lib/devAuth';
import { streamAuthHeader, streamRunUrl } from '@/lib/cursor/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ agentId: string; runId: string }> },
) {
  const auth = await requireSuperuser(req);
  if (auth.error) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { agentId, runId } = await params;
  const lastEventId = req.headers.get('last-event-id') || undefined;

  try {
    const upstream = await fetch(streamRunUrl(agentId, runId), {
      headers: {
        Authorization: streamAuthHeader(),
        Accept: 'text/event-stream',
        ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
      },
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text();
      return new Response(JSON.stringify({ error: text || upstream.statusText }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '스트림 연결 실패';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

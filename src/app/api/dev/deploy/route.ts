import { NextResponse } from 'next/server';
import { requireSuperuser } from '@/lib/devAuth';

const PROJECT_ID = process.env.VERCEL_PROJECT_ID || 'prj_sovM7cPLxCAgDMN7nUgWX5el25Pa';
const TEAM_ID = process.env.VERCEL_TEAM_ID || 'team_LcadBOFFtPqgXQmoCNyKPHQk';

async function vercelFetch(path: string, init?: RequestInit) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN 미설정');

  const res = await fetch(`https://api.vercel.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  return res;
}

export async function GET(req: Request) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!process.env.VERCEL_TOKEN) {
    return NextResponse.json({ deployments: [], error: 'VERCEL_TOKEN 미설정' });
  }

  try {
    const qs = TEAM_ID ? `?teamId=${TEAM_ID}&limit=5` : '?limit=5';
    const res = await vercelFetch(`/v6/deployments${qs}&projectId=${PROJECT_ID}`);
    const data = await res.json();

    const deployments = (data.deployments || []).map((d: any) => ({
      id: d.uid,
      url: d.url ? `https://${d.url}` : null,
      state: d.state,
      createdAt: d.createdAt,
      readyState: d.readyState,
      target: d.target,
    }));

    return NextResponse.json({ deployments });
  } catch (e: any) {
    return NextResponse.json({ deployments: [], error: e.message });
  }
}

export async function POST(req: Request) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json().catch(() => ({}));
    const message = body.message || 'feat: dev-console deploy';

    if (!process.env.VERCEL_TOKEN) {
      return NextResponse.json({ error: 'VERCEL_TOKEN 미설정' }, { status: 503 });
    }

    const teamParam = TEAM_ID ? `?teamId=${TEAM_ID}` : '';

    const res = await vercelFetch(`/v13/deployments${teamParam}`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'pitaya-osv1',
        project: PROJECT_ID,
        target: 'production',
        gitSource: {
          type: 'github',
          repoId: process.env.VERCEL_GIT_REPO_ID || '',
          ref: 'main',
          org: 'RallaRa',
          repo: 'pitaya-os',
        },
        meta: { deployMessage: message },
      }),
    });

    if (!res.ok) {
      const listRes = await vercelFetch(`/v6/deployments${teamParam}&projectId=${PROJECT_ID}&limit=1`);
      const listData = await listRes.json();
      const latest = listData.deployments?.[0];

      if (latest?.uid) {
        const redeploy = await vercelFetch(`/v13/deployments${teamParam}`, {
          method: 'POST',
          body: JSON.stringify({
            name: 'pitaya-osv1',
            deploymentId: latest.uid,
            target: 'production',
          }),
        });
        if (redeploy.ok) {
          const d = await redeploy.json();
          return NextResponse.json({
            ok: true,
            deployment: { id: d.id, url: d.url, state: d.readyState || 'BUILDING' },
            message: '최신 커밋 재배포 트리거됨',
          });
        }
      }

      const errText = await res.text();
      return NextResponse.json({ error: `Vercel 배포 실패: ${errText}` }, { status: 502 });
    }

    const deployment = await res.json();
    return NextResponse.json({
      ok: true,
      deployment: {
        id: deployment.id,
        url: deployment.url,
        state: deployment.readyState || 'BUILDING',
      },
      message: 'Vercel production 배포 시작',
    });
  } catch (e: any) {
    console.error('[dev/deploy]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

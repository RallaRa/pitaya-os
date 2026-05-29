import { NextResponse } from 'next/server';
import { requireSuperuser } from '@/lib/devAuth';
import { extractCodeBlocks } from '@/lib/devContext';

const REPO = 'RallaRa/pitaya-os';
const DEFAULT_BRANCH = 'main';

async function githubFetch(path: string, init?: RequestInit) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN 미설정');

  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  return res;
}

/** GitHub repository_dispatch — Actions 워크플로 트리거 */
async function dispatchDeploy(message: string, files?: { path: string; content: string }[]) {
  const res = await githubFetch(`/repos/${REPO}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({
      event_type: 'dev-console-commit',
      client_payload: { message, files: files || [], timestamp: Date.now() },
    }),
  });
  if (res.status === 204) return { method: 'dispatch', ok: true };
  const err = await res.text();
  throw new Error(`GitHub dispatch 실패: ${err}`);
}

/** 단일 파일 GitHub Contents API 커밋 */
async function commitFile(path: string, content: string, message: string) {
  const getRes = await githubFetch(`/repos/${REPO}/contents/${path}?ref=${DEFAULT_BRANCH}`);
  let sha: string | undefined;
  if (getRes.ok) {
    const existing = await getRes.json();
    sha = existing.sha;
  }

  const putRes = await githubFetch(`/repos/${REPO}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: Buffer.from(content, 'utf-8').toString('base64'),
      branch: DEFAULT_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!putRes.ok) {
    const err = await putRes.text();
    throw new Error(`GitHub commit 실패: ${err}`);
  }
  return putRes.json();
}

export async function POST(req: Request) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { message, code, filePath, aiResponse } = await req.json();
    const commitMessage = message || 'feat: dev-console AI commit';

    if (!process.env.GITHUB_TOKEN) {
      return NextResponse.json({
        error: 'GITHUB_TOKEN 미설정 — Vercel 환경변수에 추가 필요',
        hint: 'GitHub Settings → Developer settings → Personal access tokens',
      }, { status: 503 });
    }

    let blocks = code ? [{ lang: 'typescript', code }] : [];
    if (aiResponse) blocks = extractCodeBlocks(aiResponse);
    if (!blocks.length && !filePath) {
      return NextResponse.json({ error: '커밋할 코드 블록이 없습니다' }, { status: 400 });
    }

    const results = [];

    if (blocks.length === 1 && filePath) {
      const result = await commitFile(filePath, blocks[0].code, commitMessage);
      results.push({ path: filePath, sha: result.commit?.sha });
    } else if (blocks.length >= 1) {
      for (let i = 0; i < Math.min(blocks.length, 3); i++) {
        const path = filePath || `src/dev-generated/patch-${Date.now()}-${i}.ts`;
        const result = await commitFile(path, blocks[i].code, `${commitMessage} (${i + 1})`);
        results.push({ path, sha: result.commit?.sha });
      }
    }

    try {
      await dispatchDeploy(commitMessage, blocks.map((b, i) => ({
        path: filePath || `src/dev-generated/patch-${i}.ts`,
        content: b.code,
      })));
    } catch {
      /* dispatch optional if no workflow */
    }

    return NextResponse.json({
      ok: true,
      commits: results,
      message: `${results.length}개 파일 커밋됨. Vercel 자동 배포 트리거됨.`,
    });
  } catch (e: any) {
    console.error('[dev/commit]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (!process.env.GITHUB_TOKEN) {
    return NextResponse.json({ commits: [], error: 'GITHUB_TOKEN 미설정' });
  }

  try {
    const res = await githubFetch(`/repos/${REPO}/commits?per_page=5`);
    const commits = await res.json();
    return NextResponse.json({
      commits: (Array.isArray(commits) ? commits : []).map((c: any) => ({
        sha: c.sha?.slice(0, 7),
        message: c.commit?.message,
        date: c.commit?.author?.date,
        url: c.html_url,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ commits: [], error: e.message });
  }
}

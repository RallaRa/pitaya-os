import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { verifyToken } from '@/lib/authVerify';
import { isPlatformSuperuser } from '@/lib/superuserCheck';

export const maxDuration = 120;

async function requireAdmin(authUser: { uid: string; email?: string }) {
  const isSU = await isPlatformSuperuser(authUser.uid, authUser.email);
  if (!isSU) return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  return null;
}

function runScraperScript(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const scraperDir = path.join(process.cwd(), 'scraper');
    const child = spawn(process.execPath, args, {
      cwd: scraperDir,
      env: {
        ...process.env,
        FIREBASE_SERVICE_ACCOUNT_KEY: process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '',
      },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

/** POST /api/scraper/run — 전체 또는 단일 소스 스크래핑 실행 */
export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = await requireAdmin(authUser);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    const sourceId = typeof body.sourceId === 'string' ? body.sourceId : '';
    const args = ['dynamic-scraper.js'];
    if (sourceId) args.push(`--source=${sourceId}`);

    const { code, stdout, stderr } = await runScraperScript(args);
    if (code !== 0) {
      return NextResponse.json({
        error: stderr.trim() || stdout.trim() || '스크래퍼 실행 실패',
      }, { status: 500 });
    }

    const match = stdout.match(/합계:\s*(\d+)개,\s*미정의:\s*(\d+)개/);
    return NextResponse.json({
      success: true,
      itemCount: match ? Number(match[1]) : null,
      pendingCount: match ? Number(match[2]) : null,
      log: stdout.split('\n').filter(Boolean).slice(-12),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** GET /api/scraper/run?sourceId=meatclub — 품목 미리보기 (저장 없음) */
export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const denied = await requireAdmin(authUser);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const sourceId = searchParams.get('sourceId');
    if (!sourceId) {
      return NextResponse.json({ error: 'sourceId 필수' }, { status: 400 });
    }

    const { code, stdout, stderr } = await runScraperScript([
      'dynamic-scraper.js',
      `--source=${sourceId}`,
      '--dry-run',
    ]);

    if (code !== 0) {
      return NextResponse.json({
        error: stderr.trim() || stdout.trim() || '미리보기 실패',
      }, { status: 500 });
    }

    const jsonLine = [...stdout.split('\n')].reverse().find(l => l.trim().startsWith('{') && l.includes('itemCount'));
    if (jsonLine) {
      return NextResponse.json(JSON.parse(jsonLine));
    }

    const itemMatch = stdout.match(/\[.+?\]\s+(\d+)개/);
    return NextResponse.json({
      sourceId,
      itemCount: itemMatch ? Number(itemMatch[1]) : 0,
      log: stdout.split('\n').filter(Boolean).slice(-8),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

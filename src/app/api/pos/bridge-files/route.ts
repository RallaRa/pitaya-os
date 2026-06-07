import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

type Pkg = 'bridge' | 'scraper';

const PACKAGES: Record<Pkg, { dir: string; files: Set<string> }> = {
  bridge: {
    dir: 'pos_bridge',
    files: new Set([
      'bridge.js',
      'package.json',
      'sync-customers.bat',
      'update-from-server.ps1',
      'update-from-server.bat',
      'find-ukey2-key.ps1',
      'FIND-KEY.bat',
      'dll-strings.ps1',
      'export-en-ukey2.bat',
      'remote-from-pitaya.ps1',
      'upload-key-hunt.ps1',
      'bootstrap-key-hunt.ps1',
      'find-ukey2-phase2.ps1',
      'find-ukey2-phase3.ps1',
      'bootstrap-key-hunt-phase3.ps1',
      'find-ukey2-phase4.ps1',
      'find-ukey2-phase5.ps1',
      'bootstrap-key-hunt-phase5.ps1',
      'find-ukey2-phase6.ps1',
      'bootstrap-key-hunt-phase6.ps1',
      'find-ukey2-phase7.ps1',
      'bootstrap-key-hunt-phase7.ps1',
      'find-ukey2-phase8.ps1',
      'bootstrap-key-hunt-phase8.ps1',
      'find-ukey2-phase9.ps1',
      'bootstrap-key-hunt-phase9.ps1',
      'find-pos-member-export.ps1',
      'upload-member-probe.ps1',
      'bootstrap-member-probe.ps1',
      'RUN-MEMBER-PROBE.bat',
      'RUN-MEMBER-PROBE-SAFE.bat',
      'download-member-probe.ps1',
      'check-member-probe-status.ps1',
      'run-realtime.bat',
      'run-realtime-hidden.vbs',
      'install-realtime-task.bat',
      'probe-goods-info.js',
      'RUN-PROBE-GOODS.bat',
      'probe-goods-table.js',
      'RUN-PROBE-GOODS-TABLE.bat',
      'probe-scale-code-match.js',
      'RUN-PHONE-PROBE.ps1',
      'probe-pos-member-screen.ps1',
      'pos-member-watcher.js',
      'run-member-watcher.bat',
      'run-member-watcher-loop.bat',
      'run-member-watcher-hidden.vbs',
      'install-member-watcher.ps1',
      'install-member-watcher.bat',
      'probe-member-sales-range.js',
    ]),
  },
  scraper: {
    dir: 'scraper',
    files: new Set([
      'package.json',
      'package-lock.json',
      'dynamic-scraper.js',
      'site-adapters.js',
      'preview-source.js',
      'init-sources.js',
      'firestore-upload.js',
      'normalizer.js',
      'cleanup.js',
      'node18-polyfill.js',
      'run-scraper.bat',
      'aliases/dictionary.json',
    ]),
  },
};

function checkAuth(req: Request): boolean {
  const apiKey =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    req.headers.get('x-api-key') ||
    '';
  return !!process.env.POS_BRIDGE_KEY && apiKey === process.env.POS_BRIDGE_KEY;
}

function resolveFilePath(pkg: Pkg, file: string): string | null {
  const cfg = PACKAGES[pkg];
  if (!cfg.files.has(file)) return null;
  const full = path.join(process.cwd(), cfg.dir, file);
  const normalized = path.normalize(full);
  const base = path.normalize(path.join(process.cwd(), cfg.dir));
  if (!normalized.startsWith(base)) return null;
  return normalized;
}

/** GET /api/pos/bridge-files?file=bridge.js&pkg=bridge|scraper */
export async function GET(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const pkg = (searchParams.get('pkg') || 'bridge') as Pkg;
  const manifest = searchParams.get('manifest');

  if (!PACKAGES[pkg]) {
    return NextResponse.json({ error: 'Invalid pkg', allowed: Object.keys(PACKAGES) }, { status: 400 });
  }

  if (manifest === '1') {
    const files = [...PACKAGES[pkg].files].map(name => {
      const p = resolveFilePath(pkg, name);
      const stat = p && fs.existsSync(p) ? fs.statSync(p) : null;
      return { name, size: stat?.size ?? 0, updatedAt: stat?.mtime.toISOString() ?? null };
    });
    return NextResponse.json({ pkg, files, api: '/api/pos/bridge-files?pkg=&file=' });
  }

  const file = searchParams.get('file') || '';
  const filePath = resolveFilePath(pkg, file);
  if (!filePath) {
    return NextResponse.json(
      { error: 'Invalid file', allowed: [...PACKAGES[pkg].files] },
      { status: 400 },
    );
  }
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found on server' }, { status: 404 });
  }

  const body = fs.readFileSync(filePath);
  const basename = path.basename(file);
  const type =
    basename.endsWith('.json') ? 'application/json; charset=utf-8' :
    basename.endsWith('.bat') ? 'application/octet-stream' :
    'text/plain; charset=utf-8';

  return new NextResponse(body, {
    headers: {
      'Content-Type': type,
      'Content-Disposition': `attachment; filename="${basename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

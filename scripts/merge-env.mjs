#!/usr/bin/env node
/**
 * .env 병합 — 기존 값 보호
 * - 기존 키는 절대 삭제하지 않음
 * - incoming 값이 비어 있으면 기존 값 유지
 * - incoming에 새 키(비어있지 않은 값) → 추가
 * - incoming에 비어있지 않은 새 값 → 갱신
 */
import fs from 'fs';
import path from 'path';

function parseEnv(content) {
  const map = new Map();
  const lines = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      lines.push({ type: 'raw', line });
      continue;
    }
    const idx = line.indexOf('=');
    if (idx === -1) {
      lines.push({ type: 'raw', line });
      continue;
    }
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1);
    map.set(key, val);
    lines.push({ type: 'kv', key });
  }
  return { map, lines };
}

function isEmptyValue(val) {
  const t = String(val ?? '').trim();
  if (!t) return true;
  if (t === '""' || t === "''") return true;
  return false;
}

function mergeMaps(base, incoming) {
  const out = new Map(base);
  for (const [key, val] of incoming) {
    if (isEmptyValue(val)) continue;
    out.set(key, val);
  }
  return out;
}

function serialize(map, baseOrder = []) {
  const seen = new Set();
  const rows = [];

  for (const key of baseOrder) {
    if (!map.has(key)) continue;
    rows.push(`${key}=${map.get(key)}`);
    seen.add(key);
  }
  for (const [key, val] of map) {
    if (seen.has(key)) continue;
    rows.push(`${key}=${val}`);
  }
  return rows.join('\n') + '\n';
}

function main() {
  const [targetPath, sourcePath] = process.argv.slice(2);
  if (!targetPath || !sourcePath) {
    console.error('Usage: node merge-env.mjs <target> <source>');
    process.exit(1);
  }

  const targetAbs = path.resolve(targetPath);
  const sourceAbs = path.resolve(sourcePath);

  const baseContent = fs.existsSync(targetAbs) ? fs.readFileSync(targetAbs, 'utf8') : '';
  const sourceContent = fs.existsSync(sourceAbs) ? fs.readFileSync(sourceAbs, 'utf8') : '';

  const base = parseEnv(baseContent);
  const source = parseEnv(sourceContent);
  const merged = mergeMaps(base.map, source.map);

  const order = [...base.map.keys(), ...source.map.keys()];
  const out = serialize(merged, order);

  fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
  fs.writeFileSync(targetAbs, out, 'utf8');

  let added = 0;
  let updated = 0;
  for (const [key, val] of source.map) {
    if (isEmptyValue(val)) continue;
    if (!base.map.has(key)) added++;
    else if (base.map.get(key) !== val) updated++;
  }

  console.log(`[merge-env] ${path.basename(targetAbs)} ← ${path.basename(sourceAbs)} (+${added} added, ~${updated} updated, keys kept: ${merged.size})`);
}

main();

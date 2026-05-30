const PROVIDER_NAMES: Record<string, string> = {
  gemini: 'Gemini',
  claude: 'Claude',
  gpt: 'GPT-4o',
  groq: 'Groq',
};

const PROVIDER_EMOJI: Record<string, string> = {
  gemini: '🟢',
  claude: '🟣',
  gpt: '👔',
  groq: '🟠',
};

export function providerDisplayName(provider: string): string {
  return PROVIDER_NAMES[provider] || provider;
}

export function formatAiTag(provider: string, model: string, attempt = 1): string {
  const emoji = PROVIDER_EMOJI[provider] || '🤖';
  const name = providerDisplayName(provider);
  const attemptSuffix = attempt > 1 ? ` · ${attempt}차` : '';
  const shortModel = model.replace('gemini-', '').replace('claude-', '').replace('gpt-', '');
  return `${emoji} ${name} (${shortModel})${attemptSuffix}`;
}

export interface EnsembleAiResult {
  ai: string;
  modelKey?: string;
  success: boolean;
  invoiceCount?: number;
  exclusionReason?: string;
}

export interface FileAnalysisMeta {
  fileName: string;
  provider: string;
  model: string;
  attempt: number;
  invoiceCount: number;
  success: boolean;
  firstProvider?: string;
  /** 앙상블 OCR — AI별 성공/제외 사유 */
  ensemble?: EnsembleAiResult[];
  confidence?: number;
  exclusions?: string[];
  conflicts?: Array<{ field: string; values: Array<{ ai: string; value: unknown }> }>;
}

export function formatFileResultLine(meta: FileAnalysisMeta): string {
  if (meta.ensemble?.length) {
    return formatEnsembleFileLine(meta);
  }
  const tag = formatAiTag(meta.provider, meta.model, meta.attempt);
  const status = meta.success ? `${meta.invoiceCount}건 추출` : '추출 실패';
  let line = `• ${meta.fileName} — ${tag} · ${status}`;
  if (meta.attempt > 1 && meta.firstProvider && meta.firstProvider !== meta.provider) {
    line += ` (1차: ${providerDisplayName(meta.firstProvider)})`;
  }
  return line;
}

export function formatEnsembleFileLine(meta: FileAnalysisMeta): string {
  const parts: string[] = [`• ${meta.fileName} — 🎯 앙상블`];
  if (meta.confidence != null) parts[0] += ` (${meta.confidence}%)`;

  for (const ind of meta.ensemble || []) {
    if (ind.success) {
      parts.push(`  ✅ ${ind.ai}: ${ind.invoiceCount ?? 0}건`);
    } else if (ind.exclusionReason) {
      parts.push(`  ⛔ ${ind.exclusionReason}`);
    }
  }

  if (meta.conflicts?.length) {
    parts.push(`  ⚠️ 불일치 ${meta.conflicts.length}건 (다수결 적용)`);
  }
  parts.push(`  → ${meta.success ? `${meta.invoiceCount}건 합산` : '합산 실패'}`);
  return parts.join('\n');
}

export function formatEnsembleReplyBlock(metas: FileAnalysisMeta[]): string {
  const lines = metas.filter(m => m.ensemble?.length).map(formatEnsembleFileLine);
  return lines.length ? `\n\n🏷️ **AI 앙상블 분석**\n${lines.join('\n')}` : '';
}

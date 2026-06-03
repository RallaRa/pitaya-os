import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { adminDb } from '@/lib/firebase/admin';
import {
  AI_MODELS,
  classifyAiExclusion,
  selectModels,
  type AiModelKey,
} from '@/lib/aiRouter';
import { stripJsonMarkdown } from '@/lib/aiProviderFallback';
import { ENSEMBLE_OCR_PROMPT } from '@/lib/purchaseOcrRules';
import { postProcessInvoice } from '@/lib/purchasePostProcess';
import { trackTokens, trackUsage } from '@/lib/trackUsage';

export interface EnsembleConflict {
  field: string;
  values: Array<{ ai: string; value: unknown }>;
}

export interface EnsembleIndividual {
  ai: string;
  modelKey: AiModelKey;
  provider: string;
  success: boolean;
  exclusionReason?: string;
  invoiceCount: number;
  invoices: Record<string, unknown>[];
}

export interface EnsembleOcrResult {
  merged: Record<string, unknown>[];
  individual: EnsembleIndividual[];
  confidence: number;
  exclusions: string[];
  conflicts: EnsembleConflict[];
  aiTag: string;
}

const CLAUDE_MODEL = 'claude-sonnet-4-6';
const GPT_MODEL = 'gpt-4o';
const GEMINI_MODEL = 'gemini-2.0-flash';

export const OCR_PROMPT = ENSEMBLE_OCR_PROMPT;

function parseOcrJson(text: string): Record<string, unknown>[] {
  const cleaned = stripJsonMarkdown(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const arr = cleaned.match(/\[[\s\S]*\]/);
    const obj = cleaned.match(/\{[\s\S]*\}/);
    parsed = arr ? JSON.parse(arr[0]) : obj ? JSON.parse(obj[0]) : null;
  }
  if (!parsed) throw new Error('JSON 파싱 실패');
  if (Array.isArray(parsed)) return parsed.filter(Boolean) as Record<string, unknown>[];
  if (typeof parsed === 'object' && parsed !== null) {
    const p = parsed as Record<string, unknown>;
    if (Array.isArray(p.invoices)) return p.invoices as Record<string, unknown>[];
    return [p];
  }
  throw new Error('JSON 파싱 실패');
}

async function loadCorrectionHint(storeId: string, supplierName?: string): Promise<string> {
  if (!storeId) return '';
  try {
    let q = adminDb.collection('ocr_corrections')
      .where('storeId', '==', storeId)
      .orderBy('createdAt', 'desc')
      .limit(5);
    if (supplierName) {
      q = adminDb.collection('ocr_corrections')
        .where('storeId', '==', storeId)
        .where('supplierName', '==', supplierName)
        .orderBy('createdAt', 'desc')
        .limit(5);
    }
    const snap = await q.get().catch(async () => {
      const fallback = await adminDb.collection('ocr_corrections')
        .where('storeId', '==', storeId)
        .limit(5)
        .get();
      return fallback;
    });
    if (snap.empty) return '';

    const nameMaps: string[] = [];
    snap.docs.forEach(doc => {
      const data = doc.data();
      const origItems = Array.isArray(data.originalResult?.items) ? data.originalResult.items : [];
      const corrItems = Array.isArray(data.correctedResult?.items) ? data.correctedResult.items : [];
      const len = Math.min(origItems.length, corrItems.length);
      for (let i = 0; i < len; i++) {
        const from = String(origItems[i]?.name || '').trim();
        const to = String(corrItems[i]?.name || '').trim();
        if (from && to && from !== to) nameMaps.push(`"${from}"→"${to}"`);
      }
    });

    const unique = [...new Set(nameMaps)].slice(0, 12);
    if (unique.length) {
      return `\n\n[이전 수정 품목명 참고]\n${unique.join(', ')}`;
    }

    const ex = snap.docs[0].data().correctedResult;
    const name = snap.docs[0].data().supplierName || supplierName || '거래처';
    return `\n\n[참고 — ${name} 이전 수정 패턴]\n${JSON.stringify(ex).slice(0, 800)}`;
  } catch {
    return '';
  }
}

async function ocrWithClaude(base64: string, mimeType: string, extraPrompt: string) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const isPdf = mimeType === 'application/pdf';
  const contentBlock = isPdf
    ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
    : {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: (mimeType || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: base64,
        },
      };

  const res = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [contentBlock, { type: 'text' as const, text: OCR_PROMPT + extraPrompt }],
    }],
  });
  const text = res.content[0].type === 'text' ? res.content[0].text : '';
  trackTokens('claude', res.usage.input_tokens, res.usage.output_tokens).catch(() => {});
  return parseOcrJson(text);
}

async function ocrWithGpt4o(base64: string, mimeType: string, extraPrompt: string) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await client.chat.completions.create({
    model: GPT_MODEL,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: OCR_PROMPT + extraPrompt + '\n\nJSON { "invoices": [...] } 형식 가능.' },
        { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${base64}` } },
      ],
    }],
  });
  const text = res.choices[0]?.message?.content || '';
  trackTokens('gpt', res.usage?.prompt_tokens ?? 0, res.usage?.completion_tokens ?? 0).catch(() => {});
  return parseOcrJson(text);
}

async function ocrWithGemini(base64: string, mimeType: string, extraPrompt: string) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const genAI = new GoogleGenerativeAI(key!);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const res = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: mimeType || 'image/jpeg', data: base64 } },
        { text: OCR_PROMPT + extraPrompt },
      ],
    }],
    generationConfig: { responseMimeType: 'application/json' },
  });
  const text = res.response.text();
  const usage = res.response.usageMetadata;
  trackUsage('gemini', (usage?.promptTokenCount ?? 0) + (usage?.candidatesTokenCount ?? 0)).catch(() => {});
  return parseOcrJson(text);
}

const OCR_RUNNERS: Partial<Record<AiModelKey, (b: string, m: string, e: string) => Promise<Record<string, unknown>[]>>> = {
  claude: ocrWithClaude,
  gpt4o: ocrWithGpt4o,
  gemini: ocrWithGemini,
};

function mergeSingleInvoice(group: Record<string, unknown>[], aiLabels: string[]): Record<string, unknown> {
  if (group.length === 0) return {};
  if (group.length === 1) return { ...group[0] };

  const merged: Record<string, unknown> = { ...group[0] };
  const conflicts: EnsembleConflict[] = [];
  const numericFields = ['totalAmount', 'supplyAmount', 'taxAmount'];
  const textFields = ['supplierName', 'paymentMethod', 'invoiceNumber', 'purchaseDate'];

  for (const field of numericFields) {
    const values = group.map(r => Number(r[field] || 0)).filter(v => v > 0).sort((a, b) => a - b);
    if (values.length > 0) merged[field] = values[Math.floor(values.length / 2)];
    const unique = [...new Set(group.map(r => String(r[field] ?? '')))].filter(v => v && v !== '0');
    if (unique.length > 1) {
      conflicts.push({
        field,
        values: group.map((r, i) => ({ ai: aiLabels[i] || `AI-${i + 1}`, value: r[field] })),
      });
    }
  }

  for (const field of textFields) {
    const freq: Record<string, number> = {};
    for (const r of group) {
      const v = String(r[field] || '').trim();
      if (v) freq[v] = (freq[v] || 0) + 1;
    }
    const best = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    if (best) merged[field] = best[0];
    const unique = [...new Set(group.map(r => String(r[field] ?? '').trim()))].filter(Boolean);
    if (unique.length > 1) {
      conflicts.push({
        field,
        values: group.map((r, i) => ({ ai: aiLabels[i] || `AI-${i + 1}`, value: r[field] })),
      });
    }
  }

  const itemLists = group.map(r => (Array.isArray(r.items) ? r.items : []) as Record<string, unknown>[]);
  merged.items = itemLists.reduce((best, cur) => (cur.length > best.length ? cur : best), itemLists[0] || []);
  if (conflicts.length) merged._conflicts = conflicts;
  return merged;
}

export function mergeInvoiceResults(
  entries: Array<{ invoices: Record<string, unknown>[]; ai: string }>,
): { merged: Record<string, unknown>[]; conflicts: EnsembleConflict[] } {
  const flat = entries.flatMap(e => e.invoices.map(inv => ({ inv, ai: e.ai })));
  if (flat.length === 0) return { merged: [], conflicts: [] };

  const byKey = new Map<string, { inv: Record<string, unknown>; ai: string }[]>();
  for (const { inv, ai } of flat) {
    const key = `${String(inv.supplierName || '미확인')}|${String(inv.purchaseDate || '')}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push({ inv, ai });
  }

  const merged: Record<string, unknown>[] = [];
  const allConflicts: EnsembleConflict[] = [];

  for (const rows of byKey.values()) {
    const m = mergeSingleInvoice(rows.map(r => r.inv), rows.map(r => r.ai));
    if (Array.isArray(m._conflicts)) {
      allConflicts.push(...(m._conflicts as EnsembleConflict[]));
      delete m._conflicts;
    }
    merged.push(postProcessInvoice(m));
  }

  return { merged, conflicts: allConflicts };
}

export async function ensembleOcr(
  base64: string,
  mimeType: string,
  options?: { storeId?: string; userPrompt?: string; supplierName?: string },
): Promise<EnsembleOcrResult> {
  const models = selectModels('ocr');
  const correctionHint = options?.storeId
    ? await loadCorrectionHint(options.storeId, options.supplierName)
    : '';
  const extraPrompt = [
    options?.userPrompt,
    correctionHint,
  ].filter(Boolean).join('\n');

  const settled = await Promise.allSettled(
    models.map(async (key) => {
      const run = OCR_RUNNERS[key];
      if (!run) throw new Error('OCR 미지원');
      if (!AI_MODELS[key].available()) throw new Error('API 키 미설정');
      return run(base64, mimeType, extraPrompt);
    }),
  );

  const individual: EnsembleIndividual[] = settled.map((result, idx) => {
    const modelKey = models[idx];
    const ai = AI_MODELS[modelKey].name;
    if (result.status === 'fulfilled') {
      return {
        ai,
        modelKey,
        provider: AI_MODELS[modelKey].providerId,
        success: result.value.length > 0,
        invoiceCount: result.value.length,
        invoices: result.value,
        exclusionReason: result.value.length === 0 ? `${ai}: 추출 결과 없음 — 합산 제외` : undefined,
      };
    }
    return {
      ai,
      modelKey,
      provider: AI_MODELS[modelKey].providerId,
      success: false,
      invoiceCount: 0,
      invoices: [],
      exclusionReason: classifyAiExclusion(result.reason, modelKey),
    };
  });

  const exclusions = individual.filter(i => !i.success).map(i => i.exclusionReason!).filter(Boolean);

  const successEntries = individual
    .filter(i => i.success)
    .map(i => ({ invoices: i.invoices, ai: i.ai }));

  const { merged, conflicts } = mergeInvoiceResults(successEntries);

  const successCount = individual.filter(i => i.success).length;
  const confidence = models.length > 0 ? Math.round((successCount / models.length) * 100) : 0;

  const tagParts = individual.filter(i => i.success).map(i => i.ai.split(' ')[0]).join('+');

  return {
    merged,
    individual,
    confidence,
    exclusions,
    conflicts,
    aiTag: tagParts ? `🎯 ${tagParts} (${confidence}%)` : '❌ 앙상블 실패',
  };
}

export function formatEnsembleSummary(result: EnsembleOcrResult): string {
  const lines: string[] = ['🏷️ **AI 앙상블**'];
  for (const ind of result.individual) {
    if (ind.success) lines.push(`✅ ${ind.ai}: ${ind.invoiceCount}건`);
    else lines.push(`⛔ ${ind.exclusionReason}`);
  }
  if (result.conflicts.length) {
    lines.push('\n⚠️ **불일치 (다수결 적용)**');
    for (const c of result.conflicts.slice(0, 5)) {
      lines.push(`• ${c.field}: ${c.values.map(v => `${v.ai}=${v.value}`).join(' / ')}`);
    }
  }
  lines.push(`\n신뢰도 ${result.confidence}%`);
  return lines.join('\n');
}

export { loadCorrectionHint };

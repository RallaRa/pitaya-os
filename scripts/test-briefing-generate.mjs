/**
 * 오늘 브리핑 AI JSON 생성 스모크 테스트
 * Usage: node scripts/test-briefing-generate.mjs
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const { generateTextWithFallback, stripJsonMarkdown } = await import('../src/lib/aiProviderFallback.ts');

const prompt = `정육점 테스트 **AI 오늘 브리핑**. JSON만:
{"summary":"40자이내","opinion":"150자이내","highlights":[{"tag":"상권","text":"테스트"}],"actions":["할일1","할일2","할일3"]}`;

try {
  const ai = await generateTextWithFallback({ prompt, json: true, useCase: 'insight' });
  const parsed = JSON.parse(stripJsonMarkdown(ai.text));
  console.log('OK provider:', ai.provider);
  console.log('keys:', Object.keys(parsed));
  console.log('summary:', parsed.summary?.slice(0, 50));
  console.log('actions:', parsed.actions?.length);
} catch (e) {
  console.error('FAIL:', e.message || e);
  process.exit(1);
}

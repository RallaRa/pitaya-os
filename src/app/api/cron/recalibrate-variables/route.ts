import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { generateTextWithFallback, hasAnyAiProvider, stripJsonMarkdown } from '@/lib/aiProviderFallback';

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const varsSnap = await adminDb.collection('weather_impact_variables').get();
    let recalibrated = 0;

    for (const doc of varsSnap.docs) {
      const data = doc.data();
      const variables = data.variables || [];
      let changed = false;

      const calibrateNeeded = variables.filter((v:any) => v.sampleCount >= 50 && v.active);
      if (calibrateNeeded.length === 0) continue;

      if (hasAnyAiProvider()) {
        try {
          for (const variable of calibrateNeeded) {
            const prompt = `날씨 변수 "${variable.name}" (sampleCount: ${variable.sampleCount})에 대한 품목별 영향도를 재계산해주세요. 현재 영향도: ${JSON.stringify(variable.itemEffects)}. 정육점 상황에서 이 날씨 조건이 각 품목 판매에 미치는 영향을 -100 ~ +100 범위로 JSON으로 반환하세요. 예: {"한우등심": 15, "삼겹살": -10}`;
            try {
              const { text } = await generateTextWithFallback({ prompt, json: true, useCase: 'prediction' });
              const newEffects = JSON.parse(stripJsonMarkdown(text));
              variable.itemEffects = newEffects;
              variable.lastUpdated = new Date().toISOString();
              variable.calibratedAt = new Date().toISOString();
              changed = true;
            } catch { /* skip variable */ }
          }
        } catch { /* ignore batch */ }
      }

      if (changed) {
        await doc.ref.update({ variables, updatedAt: FieldValue.serverTimestamp() });
        recalibrated++;
      }
    }

    return NextResponse.json({ ok: true, recalibrated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

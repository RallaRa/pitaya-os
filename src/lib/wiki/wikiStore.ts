import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import { GLOBAL_WIKI_SEEDS } from './seedDocs';
import type { WikiDoc, WikiDocIndexItem } from './types';
import { appendStoreBusinessContext } from '@/lib/storeBusinessContext';

const COL = 'wiki_docs';

function docFromSnap(id: string, data: DocumentData): WikiDoc {
  const updatedAt = data.updatedAt?.toDate?.()
    ? data.updatedAt.toDate().toISOString()
    : data.updatedAt;
  return {
    id,
    slug: data.slug,
    title: data.title,
    content: data.content || '',
    category: data.category || '기타',
    relatedModule: data.relatedModule,
    relatedPath: data.relatedPath,
    status: data.status || 'published',
    storeId: data.storeId || 'global',
    order: data.order ?? 0,
    updatedAt,
  };
}

/** 신규 시드 문서만 추가 (기존 편집본은 덮어쓰지 않음) */
export async function ensureGlobalWikiSeeds(): Promise<void> {
  const globalSnap = await adminDb.collection(COL)
    .where('storeId', '==', 'global')
    .get();

  const existingSlugs = new Set(
    globalSnap.docs.map(d => String(d.data().slug || '')),
  );

  const toInsert = globalSnap.empty
    ? GLOBAL_WIKI_SEEDS
    : GLOBAL_WIKI_SEEDS.filter(s => !existingSlugs.has(s.slug));

  if (toInsert.length === 0) return;

  const batch = adminDb.batch();
  for (const seed of toInsert) {
    const ref = adminDb.collection(COL).doc(`global_${seed.slug}`);
    batch.set(ref, {
      ...seed,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function listWikiDocs(storeId: string): Promise<WikiDoc[]> {
  await ensureGlobalWikiSeeds();

  const [globalSnap, storeSnap] = await Promise.all([
    adminDb.collection(COL)
      .where('storeId', '==', 'global')
      .where('status', '==', 'published')
      .get(),
    storeId
      ? adminDb.collection(COL)
          .where('storeId', '==', storeId)
          .where('status', '==', 'published')
          .get()
      : Promise.resolve(null),
  ]);

  const bySlug = new Map<string, WikiDoc>();
  for (const d of globalSnap.docs) {
    const doc = docFromSnap(d.id, d.data());
    bySlug.set(doc.slug, doc);
  }
  if (storeSnap) {
    for (const d of storeSnap.docs) {
      const doc = docFromSnap(d.id, d.data());
      bySlug.set(doc.slug, doc);
    }
  }

  return [...bySlug.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'ko'));
}

export async function getWikiDocBySlug(
  storeId: string,
  slug: string,
): Promise<WikiDoc | null> {
  const docs = await listWikiDocs(storeId);
  return docs.find(d => d.slug === slug) ?? null;
}

export function wikiIndexFromDocs(docs: WikiDoc[]): WikiDocIndexItem[] {
  return docs.map(d => ({
    slug: d.slug,
    title: d.title,
    category: d.category,
    relatedPath: d.relatedPath,
  }));
}

export function buildWikiAiAppendix(index: WikiDocIndexItem[]): string {
  if (index.length === 0) return appendStoreBusinessContext('');
  const lines = index.map(d => `- [[${d.slug}|${d.title}]] (${d.category})`).join('\n');
  return appendStoreBusinessContext(`

## AI 매장 메뉴얼 (위키 모드)
당신은 Pitaya OS **매장 메뉴얼** 안내 AI입니다. 답변 시 아래 등록된 문서를 참고하고, 관련 내용이 있으면 반드시 위키 링크 형식 **[[slug|표시제목]]** 을 본문에 1~3개 포함하세요.
- slug는 영문 식별자, 표시제목은 한글 제목
- 예: [[morning-report|오전 마감 보고서]]
- 세스코·캡스·외부 방역/보안 인증 업체는 언급하지 마세요. 위생은 **자체 위생 점검일지** 기준으로 안내하세요.

### 등록 문서 목록
${lines}
`);
}

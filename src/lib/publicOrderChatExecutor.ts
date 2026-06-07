import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  generatePublicToken,
  serializeLine,
  findExistingLineMatch,
  isPhotoPrimaryLineInput,
  wantsExplicitNewPublicOrderLine,
} from '@/lib/publicOrders';
import { sanitizePhotoUrl } from '@/lib/sanitizePhotoUrl';

export interface PublicOrderLineInput {
  name: string;
  description?: string;
  origin?: string;
  normalPrice?: number;
  discountPrice?: number;
  unit?: string;
  /** 가격 표시 단위 — unit(주문단위)와 다를 수 있음 */
  priceUnitLabel?: string;
  totalQty?: number;
  photoUrl?: string;
}

export interface PublicOrderAiAction {
  type:
    | 'create_session'
    | 'update_session'
    | 'add_lines'
    | 'update_line'
    | 'remove_line'
    | 'select_session';
  sessionId?: string;
  sessionTitle?: string;
  title?: string;
  description?: string;
  orderDeadline?: string | null;
  status?: 'draft' | 'open' | 'closed';
  lines?: PublicOrderLineInput[];
  lineName?: string;
  lineUpdates?: Partial<PublicOrderLineInput>;
}

export interface ExecuteResult {
  ok: boolean;
  message: string;
  sessionId?: string;
  publicUrl?: string;
  errors?: string[];
}

export interface ExecutePublicOrderOptions {
  /** 사용자 원문 — 신규 품목 명시 여부 판단 */
  userMessage?: string;
}

function buildLinePatch(
  existing: FirebaseFirestore.DocumentData,
  incoming: PublicOrderLineInput,
  opts?: { keepExistingName?: boolean; photoPrimary?: boolean },
): Record<string, unknown> {
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

  const photoUrl = sanitizePhotoUrl(incoming.photoUrl);
  if (photoUrl) patch.photoUrl = photoUrl;

  if (opts?.photoPrimary) {
    if (incoming.description?.trim()) patch.description = incoming.description.trim();
    if (incoming.origin?.trim()) patch.origin = incoming.origin.trim();
    return patch;
  }

  if (incoming.description?.trim()) patch.description = incoming.description.trim();
  if (incoming.origin?.trim()) patch.origin = incoming.origin.trim();

  const normalPrice = Number(incoming.normalPrice) || 0;
  const discountPrice = Number(incoming.discountPrice) || 0;
  if (normalPrice > 0) patch.normalPrice = normalPrice;
  if (discountPrice > 0) {
    patch.discountPrice = discountPrice;
  } else if (normalPrice > 0) {
    patch.discountPrice = normalPrice;
  }

  if (incoming.unit?.trim()) patch.unit = incoming.unit.trim();
  if (incoming.priceUnitLabel != null) patch.priceUnitLabel = String(incoming.priceUnitLabel).trim();

  const totalQty = Number(incoming.totalQty);
  if (totalQty > 0) {
    patch.totalQty = Math.max(
      Math.floor(totalQty),
      Number(existing.orderedQty) || 0,
    );
  }

  if (!opts?.keepExistingName && incoming.name?.trim()) {
    patch.name = incoming.name.trim();
  }

  return patch;
}

function findExistingLineDoc(
  snap: FirebaseFirestore.QuerySnapshot,
  lineName: string,
  incoming?: Partial<PublicOrderLineInput>,
  opts?: { allowNewLines?: boolean },
) {
  const activeDocs = snap.docs.filter(d => d.data().isActive !== false);
  const candidates = activeDocs.map(d => ({
    id: d.id,
    name: String(d.data().name || ''),
    photoUrl: String(d.data().photoUrl || ''),
    doc: d,
  }));

  const photoPrimary = incoming ? isPhotoPrimaryLineInput(incoming) : false;
  const match = findExistingLineMatch(lineName, candidates, {
    allowNewLines: opts?.allowNewLines,
    hasExistingLines: candidates.length > 0,
    photoPrimary,
  });

  if (match) {
    return candidates.find(c => c.id === match.id)?.doc ?? null;
  }

  const targetName = lineName.trim();
  return activeDocs.find(d => {
    const n = String(d.data().name || '');
    return n === targetName || n.includes(targetName) || targetName.includes(n);
  }) ?? null;
}

async function resolveSessionId(
  storeId: string,
  sessionId?: string,
  sessionTitle?: string,
): Promise<string | null> {
  if (sessionId) {
    const doc = await adminDb.collection('public_order_sessions').doc(sessionId).get();
    if (doc.exists && doc.data()?.storeId === storeId) return sessionId;
  }
  if (sessionTitle?.trim()) {
    const snap = await adminDb.collection('public_order_sessions')
      .where('storeId', '==', storeId)
      .get();
    const title = sessionTitle.trim();
    const match = snap.docs.find(d => String(d.data().title || '').includes(title));
    if (match) return match.id;
  }
  return sessionId || null;
}

export async function executePublicOrderActions(
  storeId: string,
  actions: PublicOrderAiAction[],
  defaultSessionId?: string,
  options?: ExecutePublicOrderOptions,
): Promise<{ results: ExecuteResult[]; activeSessionId?: string; publicUrl?: string }> {
  const results: ExecuteResult[] = [];
  let activeSessionId = defaultSessionId;
  const allowNewLines = wantsExplicitNewPublicOrderLine(options?.userMessage || '');

  for (const action of actions) {
    try {
      switch (action.type) {
        case 'create_session': {
          const title = String(action.title || '공개 주문').trim();
          const ref = await adminDb.collection('public_order_sessions').add({
            storeId,
            title,
            description: String(action.description || '').trim(),
            status: action.status && ['draft', 'open', 'closed'].includes(action.status)
              ? action.status
              : 'draft',
            publicToken: generatePublicToken(),
            orderDeadline: action.orderDeadline || null,
            visitorCount: 0,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          activeSessionId = ref.id;
          results.push({
            ok: true,
            message: `회차 「${title}」 생성`,
            sessionId: ref.id,
          });
          break;
        }

        case 'select_session': {
          const sid = await resolveSessionId(storeId, action.sessionId, action.sessionTitle || action.title);
          if (!sid) {
            results.push({ ok: false, message: '선택할 회차를 찾지 못했습니다' });
            break;
          }
          activeSessionId = sid;
          results.push({ ok: true, message: '회차 선택', sessionId: sid });
          break;
        }

        case 'update_session': {
          const sid = await resolveSessionId(
            storeId,
            action.sessionId || activeSessionId,
            action.sessionTitle || action.title,
          );
          if (!sid) {
            results.push({ ok: false, message: '수정할 회차를 찾지 못했습니다' });
            break;
          }
          const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
          if (action.title != null) updates.title = String(action.title).trim();
          if (action.description != null) updates.description = String(action.description).trim();
          if (action.orderDeadline !== undefined) updates.orderDeadline = action.orderDeadline || null;
          if (action.status && ['draft', 'open', 'closed'].includes(action.status)) {
            updates.status = action.status;
          }
          await adminDb.collection('public_order_sessions').doc(sid).update(updates);
          activeSessionId = sid;
          const statusKo = action.status === 'open' ? '접수 시작' : action.status === 'closed' ? '마감' : '설정 저장';
          results.push({ ok: true, message: `회차 ${statusKo}`, sessionId: sid });
          break;
        }

        case 'add_lines': {
          const sid = await resolveSessionId(
            storeId,
            action.sessionId || activeSessionId,
            action.sessionTitle,
          );
          if (!sid) {
            results.push({ ok: false, message: '품목을 추가할 회차가 없습니다. 먼저 회차를 만들어 주세요.' });
            break;
          }
          const sessionDoc = await adminDb.collection('public_order_sessions').doc(sid).get();
          if (!sessionDoc.exists) {
            results.push({ ok: false, message: '회차를 찾을 수 없습니다' });
            break;
          }
          const lines = action.lines || [];
          if (lines.length === 0) {
            results.push({ ok: false, message: '추가할 품목이 없습니다' });
            break;
          }
          const existingSnap = await adminDb.collection('public_order_lines')
            .where('sessionId', '==', sid)
            .get();
          let sortOrder = existingSnap.docs.filter(d => d.data().isActive !== false).length;
          const added: string[] = [];
          const updated: string[] = [];
          const skipped: string[] = [];
          const activeExisting = existingSnap.docs.filter(d => d.data().isActive !== false);
          const hasExisting = activeExisting.length > 0;

          for (const line of lines) {
            const name = String(line.name || '').trim();
            if (!name) continue;

            const existingDoc = findExistingLineDoc(existingSnap, name, line, { allowNewLines });
            if (existingDoc) {
              const photoPrimary = isPhotoPrimaryLineInput(line);
              const patch = buildLinePatch(existingDoc.data()!, line, {
                keepExistingName: true,
                photoPrimary,
              });
              if (Object.keys(patch).length > 1) {
                await existingDoc.ref.update(patch);
              }
              updated.push(String(existingDoc.data()?.name || name));
              continue;
            }

            if (!allowNewLines && hasExisting) {
              skipped.push(name);
              continue;
            }

            const normalPrice = Number(line.normalPrice) || 0;
            const discountPrice = Number(line.discountPrice) || normalPrice;
            await adminDb.collection('public_order_lines').add({
              sessionId: sid,
              storeId: sessionDoc.data()!.storeId,
              sortOrder: sortOrder++,
              name,
              description: String(line.description || '').trim(),
              origin: String(line.origin || '').trim(),
              photoUrl: sanitizePhotoUrl(line.photoUrl),
              normalPrice,
              discountPrice,
              unit: String(line.unit || 'kg').trim(),
              priceUnitLabel: String(line.priceUnitLabel || '').trim(),
              totalQty: Math.max(1, Math.floor(Number(line.totalQty) || 10)),
              orderedQty: 0,
              isActive: true,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
            added.push(name);
          }
          activeSessionId = sid;
          const parts: string[] = [];
          if (updated.length) parts.push(`기존 품목 ${updated.length}개 반영 (${updated.join(', ')})`);
          if (added.length) parts.push(`신규 ${added.length}개 추가 (${added.join(', ')})`);
          if (skipped.length) {
            parts.push(
              `매칭 안 됨 ${skipped.length}개 (${skipped.join(', ')}) — 새 품목이면 「새 품목으로 추가」라고 말씀해 주세요`,
            );
          }
          results.push({
            ok: updated.length > 0 || added.length > 0 || skipped.length === 0,
            message: parts.length ? parts.join(' · ') : '변경된 품목이 없습니다',
            sessionId: sid,
          });
          break;
        }

        case 'update_line': {
          const sid = await resolveSessionId(storeId, action.sessionId || activeSessionId, action.sessionTitle);
          if (!sid || !action.lineName) {
            results.push({ ok: false, message: '수정할 품목/회차를 찾지 못했습니다' });
            break;
          }
          const snap = await adminDb.collection('public_order_lines')
            .where('sessionId', '==', sid)
            .get();
          const targetName = action.lineName.trim();
          const doc = findExistingLineDoc(snap, targetName, action.lineUpdates, { allowNewLines });
          if (!doc) {
            results.push({ ok: false, message: `품목 「${targetName}」을 찾지 못했습니다` });
            break;
          }
          const u = action.lineUpdates || {};
          const patch = buildLinePatch(doc.data()!, {
            name: u.name || targetName,
            description: u.description,
            origin: u.origin,
            normalPrice: u.normalPrice,
            discountPrice: u.discountPrice,
            unit: u.unit,
            priceUnitLabel: u.priceUnitLabel,
            totalQty: u.totalQty,
            photoUrl: u.photoUrl,
          });
          await doc.ref.update(patch);
          activeSessionId = sid;
          results.push({ ok: true, message: `품목 「${String(doc.data()?.name || targetName)}」 수정`, sessionId: sid });
          break;
        }

        case 'remove_line': {
          const sid = await resolveSessionId(storeId, action.sessionId || activeSessionId, action.sessionTitle);
          if (!sid || !action.lineName) {
            results.push({ ok: false, message: '삭제할 품목/회차를 찾지 못했습니다' });
            break;
          }
          const snap = await adminDb.collection('public_order_lines')
            .where('sessionId', '==', sid)
            .get();
          const targetName = action.lineName.trim();
          const doc = snap.docs.find(d => String(d.data().name || '').includes(targetName));
          if (!doc) {
            results.push({ ok: false, message: `품목 「${targetName}」을 찾지 못했습니다` });
            break;
          }
          const orderedQty = Number(doc.data().orderedQty) || 0;
          if (orderedQty > 0) {
            await doc.ref.update({ isActive: false, updatedAt: FieldValue.serverTimestamp() });
          } else {
            await doc.ref.delete();
          }
          activeSessionId = sid;
          results.push({ ok: true, message: `품목 「${targetName}」 삭제(비활성)`, sessionId: sid });
          break;
        }

        default:
          break;
      }
    } catch (e: unknown) {
      results.push({
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  let publicUrl: string | undefined;
  if (activeSessionId) {
    const doc = await adminDb.collection('public_order_sessions').doc(activeSessionId).get();
    const token = doc.data()?.publicToken;
    if (token) publicUrl = `/order/${token}`;
  }

  return { results, activeSessionId, publicUrl };
}

export async function loadPublicOrderChatContext(storeId: string, sessionId?: string) {
  const snap = await adminDb.collection('public_order_sessions')
    .where('storeId', '==', storeId)
    .get();

  const sessions = snap.docs
    .map(d => {
      const data = d.data();
      return {
        id: d.id,
        title: data.title,
        status: data.status,
        orderDeadline: data.orderDeadline || null,
        publicToken: data.publicToken,
        _sort: data.createdAt?.toMillis?.() ?? 0,
      };
    })
    .sort((a, b) => b._sort - a._sort)
    .slice(0, 20)
    .map(({ _sort, ...rest }) => rest);

  let current: {
    session: Record<string, unknown>;
    lines: ReturnType<typeof serializeLine>[];
    entryCount: number;
  } | null = null;

  if (sessionId) {
    const doc = await adminDb.collection('public_order_sessions').doc(sessionId).get();
    if (doc.exists && doc.data()?.storeId === storeId) {
      const data = doc.data()!;
      const linesSnap = await adminDb.collection('public_order_lines')
        .where('sessionId', '==', sessionId)
        .get();
      const lines = linesSnap.docs
        .map(d => serializeLine(d.id, d.data() as Record<string, unknown>))
        .filter(l => l.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const entriesSnap = await adminDb.collection('public_order_entries')
        .where('sessionId', '==', sessionId)
        .get();
      current = {
        session: {
          id: doc.id,
          title: data.title,
          description: data.description || '',
          status: data.status,
          orderDeadline: data.orderDeadline || null,
          publicToken: data.publicToken,
        },
        lines,
        entryCount: entriesSnap.size,
      };
    }
  }

  return { sessions, current };
}

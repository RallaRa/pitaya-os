import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { generatePublicToken, serializeLine } from '@/lib/publicOrders';

export interface PublicOrderLineInput {
  name: string;
  description?: string;
  origin?: string;
  normalPrice?: number;
  discountPrice?: number;
  unit?: string;
  totalQty?: number;
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
): Promise<{ results: ExecuteResult[]; activeSessionId?: string; publicUrl?: string }> {
  const results: ExecuteResult[] = [];
  let activeSessionId = defaultSessionId;

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
          let sortOrder = existingSnap.size;
          const added: string[] = [];
          for (const line of lines) {
            const name = String(line.name || '').trim();
            if (!name) continue;
            const normalPrice = Number(line.normalPrice) || 0;
            const discountPrice = Number(line.discountPrice) || normalPrice;
            await adminDb.collection('public_order_lines').add({
              sessionId: sid,
              storeId: sessionDoc.data()!.storeId,
              sortOrder: sortOrder++,
              name,
              description: String(line.description || '').trim(),
              origin: String(line.origin || '').trim(),
              photoUrl: '',
              normalPrice,
              discountPrice,
              unit: String(line.unit || 'kg').trim(),
              totalQty: Math.max(1, Math.floor(Number(line.totalQty) || 10)),
              orderedQty: 0,
              isActive: true,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
            added.push(name);
          }
          activeSessionId = sid;
          results.push({
            ok: true,
            message: `품목 ${added.length}개 추가: ${added.join(', ')}`,
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
          const doc = snap.docs.find(d => {
            const n = String(d.data().name || '');
            return n === targetName || n.includes(targetName) || targetName.includes(n);
          });
          if (!doc) {
            results.push({ ok: false, message: `품목 「${targetName}」을 찾지 못했습니다` });
            break;
          }
          const u = action.lineUpdates || {};
          const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
          if (u.name) patch.name = String(u.name).trim();
          if (u.description != null) patch.description = String(u.description).trim();
          if (u.origin != null) patch.origin = String(u.origin).trim();
          if (u.normalPrice != null) patch.normalPrice = Number(u.normalPrice) || 0;
          if (u.discountPrice != null) patch.discountPrice = Number(u.discountPrice) || 0;
          if (u.unit) patch.unit = String(u.unit).trim();
          if (u.totalQty != null) patch.totalQty = Math.max(0, Math.floor(Number(u.totalQty) || 0));
          await doc.ref.update(patch);
          activeSessionId = sid;
          results.push({ ok: true, message: `품목 「${targetName}」 수정`, sessionId: sid });
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

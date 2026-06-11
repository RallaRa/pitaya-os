'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import {
  collection, getDocs, onSnapshot, orderBy, query,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import type { DocumentPresence } from '@/lib/messenger/documentTypes';
import { COLLABORATOR_COLORS } from '@/lib/messenger/documentTypes';

interface CollaborativeEditorProps {
  docId: string;
  storeId: string;
  initialContent: string;
  userId: string;
  userName: string;
  onContentChange?: (content: string) => void;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function lineColFromIndex(text: string, index: number): { line: number; col: number } {
  const slice = text.slice(0, Math.max(0, index));
  const lines = slice.split('\n');
  return { line: lines.length, col: (lines[lines.length - 1]?.length ?? 0) + 1 };
}

export default function CollaborativeEditor({
  docId,
  storeId,
  initialContent,
  userId,
  userName,
  onContentChange,
}: CollaborativeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const clientIdRef = useRef(typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `c-${Date.now()}`);
  const syncingRef = useRef(false);
  const appliedIdsRef = useRef<Set<string>>(new Set());

  const userColor = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < userId.length; i += 1) hash = (hash + userId.charCodeAt(i) * 17) % COLLABORATOR_COLORS.length;
    return COLLABORATOR_COLORS[hash];
  }, [userId]);

  const [remotePresence, setRemotePresence] = useState<DocumentPresence[]>([]);
  const [cursorMarkers, setCursorMarkers] = useState<Array<{ uid: string; name: string; color: string; top: number; left: number }>>([]);

  const pushUpdate = useCallback(async (update: Uint8Array) => {
    if (!storeId || !docId) return;
    try {
      const headers = await getAuthJsonHeaders();
      await fetch(`/api/messenger/docs/${docId}/yjs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          clientId: clientIdRef.current,
          update: uint8ToBase64(update),
        }),
      });
    } catch (e) {
      console.error('[CollaborativeEditor] yjs push:', e);
    }
  }, [docId, storeId]);

  const pushPresence = useCallback(async (cursor: number) => {
    if (!storeId || !docId) return;
    try {
      const headers = await getAuthJsonHeaders();
      await fetch(`/api/messenger/docs/${docId}/presence`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId, name: userName, color: userColor, cursor }),
      });
    } catch (e) {
      console.error('[CollaborativeEditor] presence:', e);
    }
  }, [docId, storeId, userColor, userName]);

  const syncTextareaFromY = useCallback((ytext: Y.Text) => {
    const el = textareaRef.current;
    if (!el) return;
    syncingRef.current = true;
    const selStart = el.selectionStart;
    const selEnd = el.selectionEnd;
    el.value = ytext.toString();
    el.selectionStart = selStart;
    el.selectionEnd = selEnd;
    onContentChange?.(el.value);
    syncingRef.current = false;
  }, [onContentChange]);

  const syncYFromTextarea = useCallback((ytext: Y.Text) => {
    const el = textareaRef.current;
    if (!el || syncingRef.current) return;
    const current = ytext.toString();
    const next = el.value;
    if (current === next) return;
    syncingRef.current = true;
    ydocRef.current?.transact(() => {
      ytext.delete(0, current.length);
      if (next.length) ytext.insert(0, next);
    });
    onContentChange?.(next);
    syncingRef.current = false;
  }, [onContentChange]);

  const updateCursorMarkers = useCallback(() => {
    const mirror = mirrorRef.current;
    const textarea = textareaRef.current;
    if (!mirror || !textarea) return;

    const text = textarea.value;
    mirror.textContent = text.slice(0, textarea.selectionEnd) || '\u200b';

    const markers = remotePresence
      .filter(p => p.uid !== userId)
      .map(p => {
        const pos = Math.min(Math.max(0, p.cursor), text.length);
        mirror.textContent = text.slice(0, pos) || '\u200b';
        return {
          uid: p.uid,
          name: p.name,
          color: p.color,
          top: mirror.offsetHeight,
          left: mirror.offsetWidth,
        };
      });

    setCursorMarkers(markers);
    mirror.textContent = '';
  }, [remotePresence, userId]);

  useEffect(() => {
    appliedIdsRef.current.clear();
    let cancelled = false;
    let dispose: (() => void) | null = null;

    void (async () => {
      const ydoc = new Y.Doc();
      ydocRef.current = ydoc;
      const ytext = ydoc.getText('content');

      const q = query(
        collection(db, 'documents', docId, 'yjs_updates'),
        orderBy('createdAt', 'asc'),
      );

      try {
        const initialSnap = await getDocs(q);
        if (cancelled) {
          ydoc.destroy();
          ydocRef.current = null;
          return;
        }

        if (initialSnap.empty) {
          if (initialContent) ytext.insert(0, initialContent);
        } else {
          initialSnap.docs.forEach(d => {
            appliedIdsRef.current.add(d.id);
            try {
              Y.applyUpdate(ydoc, base64ToUint8(String(d.data().update || '')), 'remote');
            } catch (e) {
              console.error('[CollaborativeEditor] replay update:', e);
            }
          });
        }
        syncTextareaFromY(ytext);
      } catch (e) {
        console.error('[CollaborativeEditor] load updates:', e);
        if (!cancelled && initialContent) ytext.insert(0, initialContent);
        if (!cancelled) syncTextareaFromY(ytext);
      }

      if (cancelled) {
        ydoc.destroy();
        ydocRef.current = null;
        return;
      }

      const onYjsUpdate = (update: Uint8Array, origin: unknown) => {
        if (origin === 'remote') return;
        void pushUpdate(update);
      };
      ydoc.on('update', onYjsUpdate);

      const onYTextChange = () => syncTextareaFromY(ytext);
      ytext.observe(onYTextChange);

      const unsubUpdates = onSnapshot(q, snap => {
        snap.docChanges().forEach(change => {
          if (change.type !== 'added') return;
          const id = change.doc.id;
          if (appliedIdsRef.current.has(id)) return;
          appliedIdsRef.current.add(id);
          const data = change.doc.data();
          if (data.clientId === clientIdRef.current) return;
          try {
            Y.applyUpdate(ydoc, base64ToUint8(String(data.update || '')), 'remote');
          } catch (e) {
            console.error('[CollaborativeEditor] apply update:', e);
          }
        });
      });

      const unsubPresence = onSnapshot(
        collection(db, 'documents', docId, 'presence'),
        snap => {
          const now = Date.now();
          const rows: DocumentPresence[] = snap.docs.map(d => ({
            uid: d.id,
            name: String(d.data().name || ''),
            color: String(d.data().color || '#2dd4bf'),
            cursor: Number(d.data().cursor || 0),
            updatedAt: d.data().updatedAt?.toDate?.()?.toISOString?.(),
          })).filter(p => {
            if (p.uid === userId) return false;
            if (!p.updatedAt) return true;
            return now - new Date(p.updatedAt).getTime() < 30_000;
          });
          setRemotePresence(rows);
        },
      );

      void pushPresence(textareaRef.current?.selectionStart ?? 0);
      const presenceTimer = setInterval(() => {
        void pushPresence(textareaRef.current?.selectionStart ?? 0);
      }, 8000);

      dispose = () => {
        ydoc.off('update', onYjsUpdate);
        ytext.unobserve(onYTextChange);
        unsubUpdates();
        unsubPresence();
        clearInterval(presenceTimer);
        ydoc.destroy();
        ydocRef.current = null;
      };
    })();

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [docId, initialContent, pushPresence, pushUpdate, syncTextareaFromY, userId]);

  useEffect(() => {
    updateCursorMarkers();
  }, [remotePresence, updateCursorMarkers]);

  const handleInput = () => {
    const ytext = ydocRef.current?.getText('content');
    if (!ytext) return;
    syncYFromTextarea(ytext);
    const cursor = textareaRef.current?.selectionStart ?? 0;
    void pushPresence(cursor);
    updateCursorMarkers();
  };

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div className="flex flex-wrap gap-2 px-1 pb-2 min-h-[28px]">
        <span
          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border"
          style={{ borderColor: userColor, color: userColor }}
        >
          ● {userName} (나)
        </span>
        {remotePresence.map(p => {
          const text = textareaRef.current?.value || '';
          const { line, col } = lineColFromIndex(text, p.cursor);
          return (
            <span
              key={p.uid}
              className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border"
              style={{ borderColor: p.color, color: p.color }}
            >
              ● {p.name} · {line}:{col}
            </span>
          );
        })}
      </div>

      <div className="relative flex-1 min-h-[320px]">
        <div
          ref={mirrorRef}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 invisible whitespace-pre-wrap break-words text-sm font-mono px-4 py-3"
          style={{ font: 'inherit', lineHeight: '1.625rem' }}
        />
        <textarea
          ref={textareaRef}
          onInput={handleInput}
          onSelect={handleInput}
          onKeyUp={handleInput}
          onClick={handleInput}
          className="absolute inset-0 w-full h-full resize-none bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100 font-mono leading-[1.625rem] focus:outline-none focus:border-teal-500"
          spellCheck={false}
        />
        {cursorMarkers.map(m => (
          <div
            key={m.uid}
            className="pointer-events-none absolute z-10"
            style={{ top: m.top, left: m.left + 16 }}
          >
            <div className="w-0.5 h-5" style={{ backgroundColor: m.color }} />
            <span
              className="absolute -top-5 left-0 text-[10px] px-1 py-0.5 rounded whitespace-nowrap"
              style={{ backgroundColor: m.color, color: '#0f172a' }}
            >
              {m.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

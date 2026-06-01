'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  doc, onSnapshot, collection, query, where, getDocs, getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import SignageContentPlayer, { type SignageContent } from './SignageContentPlayer';

interface Props {
  slug: string;
}

export default function SignageDisplay({ slug }: Props) {
  const [contents, setContents] = useState<SignageContent[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  const loadContents = useCallback(async (sid: string, screenContentIds?: string[]) => {
    try {
      const playlistSnap = await getDoc(doc(db, 'signage_playlist', sid));
      const approvedIds: string[] = playlistSnap.exists()
        ? (playlistSnap.data()?.approvedIds as string[]) || []
        : [];

      let ids = approvedIds;
      if (screenContentIds && screenContentIds.length > 0) {
        ids = screenContentIds.filter(id => approvedIds.includes(id));
        if (ids.length === 0) ids = approvedIds;
      }

      if (ids.length > 0) {
        const items: (SignageContent & { order?: number })[] = [];
        for (const id of ids) {
          const cDoc = await getDoc(doc(db, 'signage_content', id));
          if (cDoc.exists() && cDoc.data().status === 'approved') {
            items.push({ id: cDoc.id, ...cDoc.data() } as SignageContent & { order?: number });
          }
        }
        items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setContents(items);
      } else {
        const q = query(
          collection(db, 'signage_content'),
          where('storeId', '==', sid),
          where('status', '==', 'approved'),
        );
        const snap = await getDocs(q);
        const items = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as SignageContent & { order?: number }))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setContents(items);
      }
      setLoading(false);
    } catch (e) {
      console.error('[SignageDisplay]', e);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let unsubPlaylist: (() => void) | undefined;

    (async () => {
      const screenQ = query(
        collection(db, 'signage_screens'),
        where('slug', '==', slug),
        where('isActive', '==', true),
      );
      const screenSnap = await getDocs(screenQ);
      if (screenSnap.empty) {
        setLoading(false);
        return;
      }

      const screen = screenSnap.docs[0].data();
      const sid = screen.storeId as string;
      setStoreId(sid);
      await loadContents(sid, screen.contentIds as string[] | undefined);

      unsubPlaylist = onSnapshot(doc(db, 'signage_playlist', sid), () => {
        loadContents(sid, screen.contentIds as string[] | undefined);
      });

      const screenRef = screenSnap.docs[0].ref;
      onSnapshot(screenRef, (screenDoc) => {
        if (screenDoc.exists()) {
          const data = screenDoc.data();
          loadContents(sid, data.contentIds as string[] | undefined);
        }
      });
    })();

    return () => {
      if (unsubPlaylist) unsubPlaylist();
    };
  }, [slug, loadContents]);

  useEffect(() => {
    if (contents.length === 0) return;

    const current = contents[currentIndex];
    const duration = ((current as { duration?: number })?.duration || 10) * 1000;

    timerRef.current = setTimeout(() => {
      setCurrentIndex(prev => (prev + 1) % contents.length);
    }, duration);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentIndex, contents]);

  useEffect(() => {
    const enterFullscreen = async () => {
      try {
        if (containerRef.current && document.fullscreenEnabled) {
          await containerRef.current.requestFullscreen();
          setIsFullscreen(true);
        }
      } catch { /* ignore */ }
    };

    const handleClick = () => enterFullscreen();
    document.addEventListener('click', handleClick, { once: true });
    const t = setTimeout(enterFullscreen, 1000);

    return () => {
      document.removeEventListener('click', handleClick);
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    const handleChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-12 h-12 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-lg">사이니지 로딩 중...</p>
        </div>
      </div>
    );
  }

  if (contents.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center text-white opacity-50">
          <p className="text-2xl mb-2">📺</p>
          <p>재생할 콘텐츠가 없습니다</p>
          <p className="text-sm mt-2">Pitaya OS에서 콘텐츠를 승인해주세요</p>
          {storeId && <p className="text-xs mt-4 text-gray-600">/{slug}</p>}
        </div>
      </div>
    );
  }

  const currentContent = contents[currentIndex];
  const duration = (currentContent as { duration?: number })?.duration || 10;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black cursor-none overflow-hidden"
      style={{ width: '100vw', height: '100vh' }}
    >
      <div className="absolute inset-0">
        <SignageContentPlayer content={currentContent} />
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
        <div
          key={currentIndex}
          className="h-full bg-white/50"
          style={{
            animation: `signage-progress ${duration}s linear forwards`,
          }}
        />
      </div>

      <div className="absolute bottom-4 right-4 flex gap-1.5">
        {contents.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === currentIndex ? 'bg-white w-4' : 'bg-white/30 w-1.5'
            }`}
          />
        ))}
      </div>

      {!isFullscreen && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
          <div className="text-white text-center">
            <p className="text-2xl mb-2">📺</p>
            <p className="text-lg">화면을 클릭하면 전체화면으로 실행됩니다</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes signage-progress {
          from { width: 0% }
          to { width: 100% }
        }
      `}</style>
    </div>
  );
}

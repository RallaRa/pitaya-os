'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { formatTimeAgoKST } from '@/lib/dateUtils';

interface Notification {
  id: string;
  targetUid: string;
  senderUid: string;
  senderName: string;
  type: string;
  title?: string;
  message: string;
  link: string;
  isRead: boolean;
  createdAt: any;
}

const TYPE_ICON: Record<string, string> = {
  leave_request:   '📋',
  leave_approved:  '✅',
  leave_rejected:  '❌',
  holiday_alert:   '📅',
  hr_dayoff:       '🏖️',
  sales_hourly_drop: '📉',
  sales_hourly_rise: '📈',
  public_order:      '🛒',
  expiry_reminder:   '📅',
  order_alert:       '📦',
  member_request:  '👤',
  member_approved: '✅',
  member_rejected: '❌',
  phone_call:      '📞',
  system:          '🔔',
  message:         '💬',
};

interface NotificationHubProps {
  label?: string;
  buttonClassName?: string;
}

export default function NotificationHub({ label, buttonClassName }: NotificationHubProps = {}) {
  const { user } = useAuth();
  const router   = useRouter();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen]               = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // onSnapshot 구독
  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, 'notifications'),
      where('targetUid', '==', user.uid),
      orderBy('createdAt', 'desc'),
    );

    const unsub = onSnapshot(q, snapshot => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
      setNotifications(docs.slice(0, 20));
    }, () => {
      // 규칙 에러 등 실패 시 API 폴백
      getAuthHeaders()
        .then(headers => fetch(`/api/notifications?uid=${user.uid}&limit=20`, { headers }))
        .then(r => r.json())
        .then(data => { if (data.notifications) setNotifications(data.notifications); })
        .catch(() => {});
    });

    return () => unsub();
  }, [user?.uid]);

  // 패널 외부 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleClick = useCallback(async (n: Notification) => {
    setIsOpen(false);
    if (!n.isRead) {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({ id: n.id }),
      });
    }
    if (n.link) router.push(n.link);
  }, [router]);

  const handleReadAll = useCallback(async () => {
    if (!user?.uid || unreadCount === 0) return;
    // 옵티미스틱 업데이트
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    await fetch('/api/notifications', {
      method: 'PUT',
      headers: await getAuthJsonHeaders(),
      body: JSON.stringify({ uid: user.uid, action: 'readAll' }),
    }).catch(() => {});
  }, [user?.uid, unreadCount]);

  return (
    <div className="relative">
      {/* 벨 버튼 — label 있으면 인라인(사이드바) 스타일, 없으면 아이콘 전용 */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(prev => !prev)}
        className={buttonClassName ?? (label
          ? 'relative flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-all text-sm cursor-pointer'
          : 'relative p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors'
        )}
        aria-label="알림"
      >
        {label ? (
          /* 사이드바 인라인 모드: 벨 + 미읽음 뱃지를 relative span으로 묶기 */
          <>
            <span className="relative shrink-0">
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </span>
            <span className="flex-1">{label}</span>
          </>
        ) : (
          /* 아이콘 전용 모드 */
          <>
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </>
        )}
      </button>

      {/* 드롭다운 패널 */}
      {isOpen && (
        <div
          ref={panelRef}
          className={`fixed z-[100] w-80 max-w-[calc(100vw-2rem)] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden ${
            label ? 'md:left-[220px] left-4 right-4 w-auto bottom-4 md:bottom-auto md:right-auto md:w-80' : 'right-4 top-14'
          }`}
          style={label && buttonRef.current ? {
            top: buttonRef.current.getBoundingClientRect().top,
          } : undefined}
        >
          {/* 패널 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <span className="font-semibold text-white text-sm">알림</span>
            {unreadCount > 0 && (
              <button
                onClick={handleReadAll}
                className="text-xs text-teal-400 hover:text-teal-300 transition-colors"
              >
                전체 읽음
              </button>
            )}
          </div>

          {/* 알림 목록 */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-slate-500 text-sm">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                새 알림이 없습니다
              </div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-800 hover:bg-slate-800/60 transition-colors ${
                    !n.isRead ? 'bg-slate-800/30' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.isRead && (
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                    )}
                    <span className="shrink-0 text-base">
                      {TYPE_ICON[n.type] ?? '🔔'}
                    </span>
                    <div className="flex-1 min-w-0">
                      {n.title && (
                        <p className="text-xs font-semibold text-teal-400/90 mb-0.5 truncate">{n.title}</p>
                      )}
                      <p className="text-sm text-slate-200 leading-snug line-clamp-2">
                        {n.message}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-slate-500">{formatTimeAgoKST(n.createdAt) || '방금 전'}</span>
                        {n.link && (
                          <span className="text-xs text-teal-400">바로가기 →</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* 하단 */}
          {notifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-slate-800 text-center">
              <span className="text-xs text-slate-500">최근 {notifications.length}개 표시 중</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

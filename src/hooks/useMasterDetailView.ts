'use client';

import { useCallback, useEffect, useState } from 'react';
import { useIsMobileView } from '@/hooks/useIsMobileView';

/** 모바일 마스터-디테일: 목록 ↔ 상세 전환. 데스크톱(lg+)에서는 항상 양쪽 표시. */
export function useMasterDetailView(hasDetail: boolean) {
  const isMobile = useIsMobileView();
  const [mobilePane, setMobilePane] = useState<'list' | 'detail'>('list');

  useEffect(() => {
    if (!isMobile) return;
    setMobilePane(hasDetail ? 'detail' : 'list');
  }, [hasDetail, isMobile]);

  const showList = !isMobile || mobilePane === 'list';
  const showDetail = !isMobile || mobilePane === 'detail';
  const backToList = useCallback(() => setMobilePane('list'), []);

  return { showList, showDetail, backToList };
}

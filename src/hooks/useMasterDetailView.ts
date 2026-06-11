'use client';

import { useCallback, useEffect, useState } from 'react';
import { useIsMobileView } from '@/hooks/useIsMobileView';

/** 모바일 마스터-디테일: 목록 ↔ 상세 전환. 데스크톱(lg+)에서는 항상 양쪽 표시. */
export function useMasterDetailView(hasDetail: boolean) {
  const isMobile = useIsMobileView();
  const [forceList, setForceList] = useState(false);

  useEffect(() => {
    if (hasDetail) setForceList(false);
  }, [hasDetail]);

  const showList = !isMobile || !hasDetail || forceList;
  const showDetail = !isMobile || (hasDetail && !forceList);
  const backToList = useCallback(() => setForceList(true), []);

  return { showList, showDetail, backToList };
}

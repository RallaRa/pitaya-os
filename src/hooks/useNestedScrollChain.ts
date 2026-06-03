'use client';

import { RefObject, useEffect, useCallback, useState } from 'react';

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    const canScrollY = /auto|scroll|overlay/.test(overflowY);
    if (canScrollY && node.scrollHeight > node.clientHeight + 1) return node;
    node = node.parentElement;
  }
  const main = document.querySelector('main');
  if (main && main.scrollHeight > main.clientHeight + 1) return main as HTMLElement;
  return document.documentElement;
}

function scrollParentBy(parent: HTMLElement, delta: number) {
  parent.scrollTop += delta;
}

function shouldChainToParent(scrollEl: HTMLElement, delta: number): boolean {
  const innerScrollable = scrollEl.scrollHeight > scrollEl.clientHeight + 1;
  if (!innerScrollable) return true;
  const atTop = scrollEl.scrollTop <= 0;
  const atBottom = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 1;
  if (delta > 0 && atBottom) return true;
  if (delta < 0 && atTop) return true;
  return false;
}

/**
 * scrollRef: 실제 overflow 영역 (넘침·scrollTop 측정)
 * listenRef: 휠/터치를 받을 영역 (미지정 시 scrollRef)
 * enabled: false면 훅 비활성 (모바일 단일 스크롤 등)
 */
export function useNestedScrollChain(
  scrollRef: RefObject<HTMLElement | null>,
  listenRef?: RefObject<HTMLElement | null>,
  enabled = true,
) {
  const [overflows, setOverflows] = useState(false);

  const measure = useCallback(() => {
    if (!enabled) {
      setOverflows(false);
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    setOverflows(el.scrollHeight > el.clientHeight + 2);
  }, [scrollRef, enabled]);

  useEffect(() => {
    if (!enabled) {
      setOverflows(false);
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef, measure, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const listenEl = (listenRef ?? scrollRef).current;
    const scrollEl = scrollRef.current;
    if (!listenEl || !scrollEl) return;

    listenEl.style.touchAction = 'pan-y';

    const onWheel = (e: WheelEvent) => {
      const parent = findScrollParent(scrollEl);
      if (!parent) return;
      if (!shouldChainToParent(scrollEl, e.deltaY)) return;
      scrollParentBy(parent, e.deltaY);
      e.preventDefault();
    };

    let touchY = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      touchY = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const y = e.touches[0].clientY;
      const delta = touchY - y;
      touchY = y;

      const parent = findScrollParent(scrollEl);
      if (!parent) return;

      if (shouldChainToParent(scrollEl, delta)) {
        scrollParentBy(parent, delta);
        if (e.cancelable) e.preventDefault();
      }
    };

    const onTouchEnd = () => {};

    listenEl.addEventListener('wheel', onWheel, { passive: false });
    listenEl.addEventListener('touchstart', onTouchStart, { passive: true });
    listenEl.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      listenEl.style.touchAction = '';
      listenEl.removeEventListener('wheel', onWheel);
      listenEl.removeEventListener('touchstart', onTouchStart);
      listenEl.removeEventListener('touchmove', onTouchMove);
    };
  }, [scrollRef, listenRef, overflows, enabled]);

  return overflows;
}

/** 메신저 모듈 — Sidebar·서브네비 공통 메뉴 */

export interface MessengerSidebarLink {
  href: string;
  label: string;
  /** true면 pathname === href 만 활성 (채팅 루트) */
  exact?: boolean;
}

export const MESSENGER_SIDEBAR_LINKS: MessengerSidebarLink[] = [
  { href: '/dashboard/messenger', label: '채팅', exact: true },
  { href: '/dashboard/messenger/wiki', label: '위키' },
  { href: '/dashboard/messenger/files', label: '파일' },
  { href: '/dashboard/messenger/calendar', label: '캘린더' },
  { href: '/dashboard/messenger/tasks', label: '칸반' },
  { href: '/dashboard/messenger/docs', label: '문서' },
];

export function isMessengerPath(pathname: string): boolean {
  return pathname === '/dashboard/messenger' || pathname.startsWith('/dashboard/messenger/');
}

export function isMessengerSubLinkActive(pathname: string, link: MessengerSidebarLink): boolean {
  if (link.exact) return pathname === link.href;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '주문하기 | Pitaya',
  description: '공개 주문 페이지',
};

/** 로그인·대시보드 레이아웃 없음 — 손님 전용 최소 UI */
export default function PublicOrderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {children}
    </div>
  );
}

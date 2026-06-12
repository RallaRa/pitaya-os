import type { Metadata } from 'next';
import SuperuserGuard from '@/components/superuser/SuperuserGuard';

export const metadata: Metadata = {
  title: '캡스 CCTV | Pitaya OS',
};

export default function CapsSuperuserLayout({ children }: { children: React.ReactNode }) {
  return (
    <SuperuserGuard>
      <div className="min-h-[calc(100dvh-4rem)] bg-slate-950">{children}</div>
    </SuperuserGuard>
  );
}

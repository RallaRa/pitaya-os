import MessengerSubNav from '@/components/messenger/MessengerSubNav';

export default function MessengerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-[calc(100dvh-4rem)]">
      <MessengerSubNav />
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

'use client';

import DevQueueConsole from '@/components/dev-queue/DevQueueConsole';

export default function DevQueuePage() {
  return (
    <div className="h-[calc(100vh-2rem)] md:h-[calc(100vh-1rem)] min-h-0 flex flex-col overflow-hidden">
      <DevQueueConsole />
    </div>
  );
}

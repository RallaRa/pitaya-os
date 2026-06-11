'use client';

export default function SkeletonWidget({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col h-full min-h-[8rem] bg-slate-900 rounded-2xl border border-slate-800/60 overflow-hidden ${className}`}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800/60">
        <div className="h-3 w-24 bg-slate-800 rounded animate-pulse" />
      </div>
      <div className="flex-1 p-4 space-y-3">
        <div className="h-8 w-2/3 mx-auto bg-slate-800/80 rounded-lg animate-pulse" />
        <div className="h-4 w-full bg-slate-800/60 rounded animate-pulse" />
        <div className="h-4 w-4/5 bg-slate-800/60 rounded animate-pulse" />
        <div className="h-4 w-3/5 bg-slate-800/60 rounded animate-pulse" />
      </div>
    </div>
  );
}

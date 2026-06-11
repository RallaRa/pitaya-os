'use client';

export default function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="p-3 space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-800/40 last:border-0">
          <div className="h-3 flex-1 bg-slate-800/60 rounded animate-pulse" />
          <div className="h-3 w-12 bg-slate-800/40 rounded animate-pulse shrink-0" />
        </div>
      ))}
    </div>
  );
}

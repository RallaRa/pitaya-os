'use client';

export default function SkeletonChart() {
  return (
    <div className="p-4 flex flex-col gap-3 h-full min-h-[8rem] justify-end">
      <div className="flex items-end justify-between gap-2 flex-1 px-1">
        {[40, 65, 50, 80, 55, 70, 45].map((h, i) => (
          <div
            key={i}
            className="flex-1 bg-slate-800/70 rounded-t-md animate-pulse"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="h-3 w-full bg-slate-800/40 rounded animate-pulse" />
    </div>
  );
}

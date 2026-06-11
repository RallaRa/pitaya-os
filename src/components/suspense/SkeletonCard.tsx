'use client';

export default function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-12 bg-slate-800/50 rounded-xl animate-pulse border border-slate-800/40"
          style={{ opacity: 1 - i * 0.12 }}
        />
      ))}
    </div>
  );
}

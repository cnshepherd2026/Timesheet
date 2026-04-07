"use client";

type Props = {
  clientTotals: { name: string; hours: number }[];
  maxHours: number;
};

export default function ActivityBreakdown({ clientTotals, maxHours }: Props) {
  if (clientTotals.length === 0) return null;
  return (
    <div className="bg-card border border-border rounded-2xl p-7">
      <h2 className="font-display text-sm font-bold uppercase tracking-widest text-muted mb-6">Hours by activity</h2>
      <div className="space-y-3">
        {[...clientTotals].sort((a, b) => b.hours - a.hours).map(c => (
          <div key={c.name} className="flex items-center gap-4">
            <div className="w-40 text-xs font-mono text-ink truncate shrink-0">{c.name}</div>
            <div className="flex-1 bg-border/40 rounded-full h-2 overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all duration-700" style={{ width: `${(c.hours / maxHours) * 100}%` }}/>
            </div>
            <div className="text-xs font-mono text-muted w-12 text-right">{c.hours.toFixed(1)}h</div>
          </div>
        ))}
      </div>
    </div>
  );
}

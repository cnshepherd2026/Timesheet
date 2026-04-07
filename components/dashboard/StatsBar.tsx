"use client";
import { Entry } from "@/lib/dateUtils";
import { localDateKey } from "@/lib/dateUtils";

type Props = {
  totalHours: number;
  monthEntriesCount: number;
  calMonthLabel: string;
  entriesCache: Record<string, Entry[]>;
};

export default function StatsBar({ totalHours, monthEntriesCount, calMonthLabel, entriesCache }: Props) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const mondayKey = localDateKey(monday);
  const sundayKey = localDateKey(sunday);

  const thisWeek = Object.values(entriesCache).flat()
    .filter(e => e.date >= mondayKey && e.date <= sundayKey)
    .reduce((s, e) => s + e.hours, 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      <div className="bg-card border border-border rounded-2xl p-5">
        <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">{calMonthLabel} hours</p>
        <p className="font-display text-3xl font-bold">{totalHours.toFixed(1)}</p>
      </div>
      <div className="bg-card border border-border rounded-2xl p-5">
        <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Entries</p>
        <p className="font-display text-3xl font-bold">{monthEntriesCount}</p>
      </div>
      <div className="bg-accent/10 border border-accent/20 rounded-2xl p-5 col-span-2 sm:col-span-1">
        <p className="text-xs font-mono text-accent uppercase tracking-widest mb-1">This week</p>
        <p className="font-display text-3xl font-bold text-accent">{thisWeek.toFixed(1)}h</p>
      </div>
    </div>
  );
}

"use client";
import { Entry, Client, localDateKey, todayKey, targetHours, getCalendarMonth, isBankHoliday } from "@/lib/dateUtils";

type Props = {
  monthEntries: Entry[];
  filtered: Entry[];
  clients: Client[];
  calMonth: { year: number; month: number };
  calMonthLabel: string;
  monthLoading: boolean;
  entriesView: "list" | "month";
  filterClient: string;
  setEntriesView: (v: "list" | "month") => void;
  setFilterClient: (v: string) => void;
  setCalMonth: (fn: (m: { year: number; month: number }) => { year: number; month: number }) => void;
  onEdit: (entry: Entry) => void;
  onDelete: (id: string) => void;
  onExportCSV: () => void;
  onDateClick: (dateStr: string) => void;
};

export default function EntriesSection({
  monthEntries, filtered, clients, calMonth, calMonthLabel, monthLoading,
  entriesView, filterClient, setEntriesView, setFilterClient, setCalMonth,
  onEdit, onDelete, onExportCSV, onDateClick,
}: Props) {
  const gridCols = "grid-cols-[1fr_1fr_1fr_1fr_1fr_32px_32px]";
  const weeks = getCalendarMonth(calMonth.year, calMonth.month);
  const monthTotal = monthEntries.reduce((s, e) => s + e.hours, 0);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-lg font-bold">Entries</h2>
          <div className="flex items-center gap-1">
            <button onClick={() => setCalMonth(m => { const d = new Date(m.year, m.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })}
              className="w-6 h-6 flex items-center justify-center rounded-md border border-border hover:border-ink text-muted hover:text-ink transition-all text-xs">‹</button>
            <span className="text-sm font-mono text-muted px-1">{calMonthLabel}</span>
            {monthLoading && <span className="text-xs font-mono text-muted animate-pulse">loading…</span>}
            <button onClick={() => setCalMonth(m => { const d = new Date(m.year, m.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })}
              className="w-6 h-6 flex items-center justify-center rounded-md border border-border hover:border-ink text-muted hover:text-ink transition-all text-xs">›</button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button onClick={() => setEntriesView("month")}
              className={`text-xs font-mono px-3 py-1.5 transition-colors ${entriesView === "month" ? "bg-ink text-paper" : "bg-paper text-muted hover:text-ink"}`}>
              Month
            </button>
            <button onClick={() => setEntriesView("list")}
              className={`text-xs font-mono px-3 py-1.5 transition-colors ${entriesView === "list" ? "bg-ink text-paper" : "bg-paper text-muted hover:text-ink"}`}>
              List
            </button>
          </div>
          {entriesView === "list" && (
            <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
              className="text-xs font-mono px-3 py-1.5 rounded-lg border border-border bg-paper text-ink focus:outline-none focus:border-ink transition-all">
              <option value="All">All activities</option>
              {clients.map(c => <option key={c.id}>{c.name}</option>)}
            </select>
          )}
          {filtered.length > 0 && (
            <button onClick={onExportCSV}
              className="text-xs font-mono px-3 py-1.5 border border-border rounded-lg hover:border-ink hover:text-ink text-muted transition-all flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5l3 3 3-3M1 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Month view */}
      {entriesView === "month" ? (
        <div className="bg-card border border-border rounded-2xl overflow-hidden w-full min-w-0">
          <div className="overflow-x-auto"><div className="min-w-[720px]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-paper/40">
              <span className="font-display font-bold text-sm">{calMonthLabel}</span>
              <span className="text-xs font-mono font-medium text-ink">{monthTotal.toFixed(1)}h total</span>
            </div>
            <div className={`grid ${gridCols} border-b border-border`}>
              {["Mon","Tue","Wed","Thu","Fri","Sa","Su"].map((d, i) => (
                <div key={d} className={`text-center text-sm font-mono uppercase tracking-wider py-2 ${i >= 5 ? "text-muted/30 text-[10px]" : "text-muted"}`}>{d}</div>
              ))}
            </div>
            <div>
              {weeks.map((week, wi) => (
                <div key={wi} className={`grid ${gridCols} ${wi < weeks.length - 1 ? "border-b border-border/40" : ""}`}>
                  {week.map((date, di) => {
                    const isWeekend = di >= 5;
                    if (!date) return <div key={di} className={`border-r border-border/20 last:border-r-0 bg-paper/10 ${isWeekend ? "" : "min-h-[112px]"}`}/>;
                    const key = localDateKey(date);
                    const dayEntries = monthEntries.filter(e => e.date === key);
                    const dayTotal = dayEntries.reduce((s, e) => s + e.hours, 0);
                    const isToday = key === todayKey();
                    const isBH = isBankHoliday(date);
                    const target = targetHours(date);
                    const isFuture = key > todayKey();
                    const isPastOrToday = !isFuture;
                    const onTarget = target > 0 && dayTotal >= target;
                    let cellBg = "";
                    if (isWeekend) cellBg = "bg-paper/10";
                    else if (isBH) cellBg = "bg-border/10";
                    else if (isFuture) cellBg = "";
                    else if (onTarget) cellBg = "bg-emerald-100 dark:bg-emerald-900/50";
                    else if (isPastOrToday && target > 0) cellBg = "bg-red-100 dark:bg-red-900/50";
                    if (isWeekend) return (
                      <div key={di} className={`border-r border-border/20 last:border-r-0 ${cellBg} flex flex-col items-center justify-start pt-1.5`}>
                        <span className="text-[10px] font-mono text-muted/30">{date.getDate()}</span>
                      </div>
                    );
                    if (isBH) return (
                      <div key={di} className={`min-h-[112px] border-r border-border/20 last:border-r-0 p-1.5 flex flex-col ${cellBg}`}>
                        <div className="text-sm font-mono mb-1 w-6 h-6 flex items-center justify-center rounded-full shrink-0 text-muted/40">
                          {date.getDate()}
                        </div>
                        <span className="text-[10px] font-mono text-muted/40 leading-tight">Bank holiday</span>
                      </div>
                    );
                    return (
                      <div key={di}
                        className={`min-h-[112px] border-r border-border/20 last:border-r-0 p-1.5 flex flex-col ${cellBg} ${isToday ? "ring-inset ring-2 ring-accent/50" : ""}`}>
                        <div onClick={() => onDateClick(key)}
                          className={`text-sm font-mono mb-1 w-6 h-6 flex items-center justify-center rounded-full shrink-0 transition-colors cursor-pointer hover:bg-accent hover:text-white ${isToday ? "bg-accent text-white text-xs font-bold" : "text-muted"}`}>
                          {date.getDate()}
                        </div>
                        <div className="flex-1 space-y-1 min-w-0">
                          {dayEntries.map(entry => (
                            <div key={entry.id}
                              className="text-xs font-mono rounded px-2 py-1.5 leading-tight bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 shadow-sm flex items-center justify-between gap-1 group/entry">
                              <span onClick={(e) => { e.stopPropagation(); onEdit(entry); }} className="truncate cursor-pointer hover:text-accent transition-colors min-w-0">
                                <span className="text-gray-900 dark:text-gray-100">{entry.client}</span>
                                <span className="text-gray-600 dark:text-gray-400 ml-1">{entry.hours}h</span>
                              </span>
                              <button onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
                                className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-colors shrink-0 opacity-0 group-hover/entry:opacity-100 leading-none">✕</button>
                            </div>
                          ))}
                        </div>
                        {target > 0 && !isFuture && (
                          <div className={`text-xs font-mono font-bold text-right mt-0.5 shrink-0 ${onTarget ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-300"}`}>
                            {dayTotal > 0 ? `${dayTotal}h` : <span className="font-normal opacity-50">—</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div></div>
          <div className="flex items-center gap-4 px-5 py-3 border-t border-border/50 bg-paper/30">
            <span className="flex items-center gap-1.5 text-xs font-mono text-muted"><span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-200 inline-block"/>On target</span>
            <span className="flex items-center gap-1.5 text-xs font-mono text-muted"><span className="w-3 h-3 rounded-sm bg-red-100 border border-red-200 inline-block"/>Missing</span>
            <span className="ml-auto text-xs font-mono text-muted">Mon–Thu 8h · Fri 7h</span>
          </div>
        </div>
      ) : (
        /* List view */
        <>
          {filtered.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-12 text-center">
              <div className="text-4xl mb-3">🕐</div>
              <p className="font-display font-semibold text-ink mb-1">No entries yet</p>
              <p className="text-sm text-muted">Log your first hours using the form above.</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-xs font-mono text-muted uppercase tracking-widest px-6 py-4">Date</th>
                      <th className="text-left text-xs font-mono text-muted uppercase tracking-widest px-4 py-4">Activity</th>
                      <th className="text-right text-xs font-mono text-muted uppercase tracking-widest px-6 py-4">Hours</th>
                      <th className="px-4 py-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((entry, i) => (
                      <tr key={entry.id} className={`border-b border-border/50 hover:bg-paper/60 transition-colors ${i === filtered.length - 1 ? "border-b-0" : ""}`}>
                        <td className="px-6 py-4 text-sm font-mono text-muted whitespace-nowrap">
                          {new Date(entry.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-block text-xs font-mono bg-ink/8 text-ink rounded-md px-2 py-1 whitespace-nowrap">{entry.client}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="font-display font-bold text-sm">{entry.hours}h</span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2 justify-end">
                            <button onClick={() => onEdit(entry)} className="text-xs text-muted hover:text-ink font-mono transition-colors">Edit</button>
                            <button onClick={() => onDelete(entry.id)} className="text-xs text-muted hover:text-accent font-mono transition-colors">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

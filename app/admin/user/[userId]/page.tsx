"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter, useParams } from "next/navigation";
import { localDateKey, todayKey, targetHours, getCalendarMonth, Entry, Client } from "@/lib/dateUtils";
import ActivityBreakdown from "@/components/dashboard/ActivityBreakdown";

const SUPER_ADMIN = "chris.shepherd@jympartnership.co.uk";

export default function AdminUserView() {
  const supabase = createClient();
  const router = useRouter();
  const params = useParams();
  const userId = params.userId as string;

  const [entries, setEntries] = useState<Entry[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() };
  });

  const fetchData = useCallback(async () => {
    // Verify admin
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/login"); return; }
    const isSuper = session.user.email === SUPER_ADMIN;
    if (!isSuper) {
      const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", session.user.id).single();
      if (!profile?.is_admin) { router.push("/dashboard"); return; }
    }

    // Get user's display name
    const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", userId).single();
    setDisplayName(profile?.display_name || userId);

    // Get clients
    const { data: clientData } = await supabase.from("clients").select("*").order("sort_order").order("name");
    setClients(clientData || []);

    // Get all entries for this user
    const { data: entryData } = await supabase.from("timesheet_entries").select("*")
      .eq("user_id", userId).order("date", { ascending: false });
    const parsed = (entryData || []).map((e: any) => ({ ...e, hours: parseFloat(e.hours) }));
    setEntries(parsed);
    setLoading(false);
  }, [supabase, userId, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const calMonthPrefix = `${String(calMonth.year)}-${String(calMonth.month + 1).padStart(2, "0")}`;
  const calMonthLabel = new Date(calMonth.year, calMonth.month, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const monthEntries = entries.filter(e => e.date.startsWith(calMonthPrefix));
  const monthTotal = monthEntries.reduce((s, e) => s + e.hours, 0);
  const totalHours = entries.reduce((s, e) => s + e.hours, 0);

  // This week
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const thisWeek = entries.filter(e => e.date >= localDateKey(monday) && e.date <= localDateKey(sunday))
    .reduce((s, e) => s + e.hours, 0);

  const clientTotals = clients
    .map(c => ({ name: c.name, hours: monthEntries.filter(e => e.client === c.name).reduce((s, e) => s + e.hours, 0) }))
    .filter(c => c.hours > 0);
  const maxHours = Math.max(...clientTotals.map(c => c.hours), 1);

  // Calendar grid
  const weeks = getCalendarMonth(calMonth.year, calMonth.month);
  const gridCols = "grid-cols-[1fr_1fr_1fr_1fr_1fr_28px_28px]";
  const hoursByDate: Record<string, number> = {};
  monthEntries.forEach(e => { hoursByDate[e.date] = (hoursByDate[e.date] || 0) + e.hours; });

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="font-mono text-sm text-muted animate-pulse">Loading…</div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/JYM-Logo.jpg" alt="JYM Partnership" className="h-8 w-auto object-contain"/>
            <span className="font-display font-semibold text-sm text-ink hidden sm:block">Timesheet</span>
          </div>
          <button onClick={() => router.push("/admin")} className="text-xs font-mono text-muted hover:text-ink transition-colors">← Back to admin</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Title */}
        <div className="animate-fade-up">
          <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Viewing timesheet for</p>
          <h1 className="font-display text-4xl font-bold text-ink">{displayName}</h1>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-2xl p-5">
            <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">{calMonthLabel} hours</p>
            <p className="font-display text-3xl font-bold">{monthTotal.toFixed(1)}</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-5">
            <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Entries</p>
            <p className="font-display text-3xl font-bold">{monthEntries.length}</p>
          </div>
          <div className="bg-accent/10 border border-accent/20 rounded-2xl p-5 col-span-2 sm:col-span-1">
            <p className="text-xs font-mono text-accent uppercase tracking-widest mb-1">This week</p>
            <p className="font-display text-3xl font-bold text-accent">{thisWeek.toFixed(1)}h</p>
          </div>
        </div>

        {/* Calendar */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-lg font-bold">Entries</h2>
              <div className="flex items-center gap-1">
                <button onClick={() => setCalMonth(m => { const d = new Date(m.year, m.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })}
                  className="w-6 h-6 flex items-center justify-center rounded-md border border-border hover:border-ink text-muted hover:text-ink transition-all text-xs">‹</button>
                <span className="text-sm font-mono text-muted px-1">{calMonthLabel}</span>
                <button onClick={() => setCalMonth(m => { const d = new Date(m.year, m.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }; })}
                  className="w-6 h-6 flex items-center justify-center rounded-md border border-border hover:border-ink text-muted hover:text-ink transition-all text-xs">›</button>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto"><div className="min-w-[560px]">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-paper/40">
                <span className="font-display font-bold text-sm">{calMonthLabel}</span>
                <span className="text-xs font-mono font-medium text-ink">{monthTotal.toFixed(1)}h total</span>
              </div>
              <div className={`grid ${gridCols} border-b border-border`}>
                {["Mon","Tue","Wed","Thu","Fri","Sa","Su"].map((d, i) => (
                  <div key={d} className={`text-center text-xs font-mono uppercase tracking-wider py-2 ${i >= 5 ? "text-muted/30 text-[9px]" : "text-muted"}`}>{d}</div>
                ))}
              </div>
              <div>
                {weeks.map((week, wi) => (
                  <div key={wi} className={`grid ${gridCols} ${wi < weeks.length - 1 ? "border-b border-border/40" : ""}`}>
                    {week.map((date, di) => {
                      const isWeekend = di >= 5;
                      if (!date) return <div key={di} className={`border-r border-border/20 last:border-r-0 bg-paper/10 ${isWeekend ? "" : "min-h-[90px]"}`}/>;
                      const key = localDateKey(date);
                      const dayEntries = monthEntries.filter(e => e.date === key);
                      const dayTotal = hoursByDate[key] || 0;
                      const isToday = key === todayKey();
                      const target = targetHours(date);
                      const isFuture = key > todayKey();
                      const onTarget = target > 0 && dayTotal >= target;
                      let cellBg = "";
                      if (isWeekend) cellBg = "bg-paper/10";
                      else if (isFuture) cellBg = "";
                      else if (onTarget) cellBg = "bg-emerald-100 dark:bg-emerald-900/50";
                      else if (!isFuture && target > 0) cellBg = "bg-red-100 dark:bg-red-900/50";
                      if (isWeekend) return (
                        <div key={di} className={`border-r border-border/20 last:border-r-0 ${cellBg} flex flex-col items-center justify-start pt-1.5`}>
                          <span className="text-[9px] font-mono text-muted/30">{date.getDate()}</span>
                        </div>
                      );
                      return (
                        <div key={di} className={`min-h-[90px] border-r border-border/20 last:border-r-0 p-1.5 flex flex-col ${cellBg} ${isToday ? "ring-inset ring-2 ring-accent/50" : ""}`}>
                          <div className={`text-xs font-mono mb-1 w-5 h-5 flex items-center justify-center rounded-full shrink-0 ${isToday ? "bg-accent text-white text-[10px] font-bold" : "text-muted"}`}>
                            {date.getDate()}
                          </div>
                          <div className="flex-1 space-y-0.5 min-w-0">
                            {dayEntries.map(entry => (
                              <div key={entry.id}
                                className="text-[10px] font-mono rounded px-1.5 py-1 truncate leading-tight bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600">
                                <span className="text-gray-900 dark:text-gray-100">{entry.client}</span>
                                <span className="text-gray-600 dark:text-gray-400 ml-1">{entry.hours}h</span>
                              </div>
                            ))}
                          </div>
                          {target > 0 && !isFuture && (
                            <div className={`text-[10px] font-mono font-bold text-right mt-0.5 shrink-0 ${onTarget ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-300"}`}>
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
        </div>

        {/* Activity breakdown */}
        {clientTotals.length > 0 && (
          <ActivityBreakdown clientTotals={clientTotals} maxHours={maxHours}/>
        )}
      </main>
    </div>
  );
}

"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

const ADMIN_EMAIL = "chris.shepherd@jympartnership.co.uk";

type Entry = { id: string; date: string; client: string; hours: number; user_id: string };
type Client = { id: string; name: string; sort_order: number };

// Returns target hours for a given JS Date (0 = weekend, 7 = Friday, 8 = Mon-Thu)
function targetHours(date: Date): number {
  const day = date.getDay(); // 0=Sun,1=Mon,...,5=Fri,6=Sat
  if (day === 0 || day === 6) return 0;
  if (day === 5) return 7;
  return 8;
}

function getCalendarMonth(year: number, month: number) {
  // Returns array of weeks, each week is array of 7 dates (Mon-Sun), nulls for padding
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Adjust so week starts Monday (JS: 0=Sun)
  const startPad = (firstDay.getDay() + 6) % 7;
  const days: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) days.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

export default function Dashboard() {
  const supabase = createClient();
  const router = useRouter();

  const [user, setUser] = useState<{ email?: string; id?: string } | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterClient, setFilterClient] = useState("All");
  const [success, setSuccess] = useState("");
  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; });

  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    client: "",
    hours: "8",
  });

  const fetchClients = useCallback(async () => {
    const { data } = await supabase.from("clients").select("*").order("sort_order").order("name");
    setClients(data || []);
    if (data && data.length > 0) {
      setForm(f => ({ ...f, client: f.client || data[0].name }));
    }
  }, [supabase]);

  const fetchEntries = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("timesheet_entries").select("*").eq("user_id", userId).order("date", { ascending: false });
    setEntries(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      setUser({ email: session.user.email, id: session.user.id });
      fetchClients();
      fetchEntries(session.user.id);
    });
  }, [supabase, router, fetchEntries, fetchClients]);

  async function handleSignOut() { await supabase.auth.signOut(); router.push("/login"); }

  function resetForm() {
    setForm({ date: new Date().toISOString().split("T")[0], client: clients[0]?.name || "", hours: "8" });
    setEditId(null); setShowForm(false);
  }

  function startEdit(entry: Entry) {
    setForm({ date: entry.date, client: entry.client, hours: String(entry.hours) });
    setEditId(entry.id); setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const payload = { date: form.date, client: form.client, hours: parseFloat(form.hours), user_id: session.user.id, user_email: session.user.email };
    if (editId) { await supabase.from("timesheet_entries").update(payload).eq("id", editId); setSuccess("Entry updated!"); }
    else { await supabase.from("timesheet_entries").insert(payload); setSuccess("Hours logged!"); }
    await fetchEntries(session.user.id); resetForm(); setSaving(false);
    setTimeout(() => setSuccess(""), 3000);
  }

  async function handleDelete(id: string) {
    await supabase.from("timesheet_entries").delete().eq("id", id);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) fetchEntries(session.user.id);
  }

  function exportCSV() {
    const rows = [["Date", "Client", "Hours"]];
    filtered.forEach(e => rows.push([e.date, e.client, String(e.hours)]));
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `timesheet-${new Date().toISOString().split("T")[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // Build a map of date -> total hours logged
  const hoursByDate: Record<string, number> = {};
  entries.forEach(e => { hoursByDate[e.date] = (hoursByDate[e.date] || 0) + e.hours; });

  function getDayStatus(date: Date): "green" | "red" | "grey" | "weekend" | "future" {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = targetHours(date);
    if (target === 0) return "weekend";
    if (date > today) return "future";
    const key = date.toISOString().split("T")[0];
    const logged = hoursByDate[key] || 0;
    if (logged >= target) return "green";
    return "red";
  }

  const filtered = filterClient === "All" ? entries : entries.filter(e => e.client === filterClient);
  const totalHours = filtered.reduce((s, e) => s + e.hours, 0);
  const clientTotals = clients.map(c => ({ name: c.name, hours: entries.filter(e => e.client === c.name).reduce((s, e) => s + e.hours, 0) })).filter(c => c.hours > 0);
  const maxHours = Math.max(...clientTotals.map(c => c.hours), 1);
  const isAdmin = user?.email === ADMIN_EMAIL;

  const calWeeks = getCalendarMonth(calMonth.year, calMonth.month);
  const calMonthLabel = new Date(calMonth.year, calMonth.month, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  // Count green/red days in calendar month for summary
  const calDays = calWeeks.flat().filter(d => d !== null) as Date[];
  const workDays = calDays.filter(d => targetHours(d) > 0 && d <= new Date());
  const today = new Date(); today.setHours(23, 59, 59);
  const greenDays = workDays.filter(d => getDayStatus(d) === "green").length;
  const redDays = workDays.filter(d => getDayStatus(d) === "red").length;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="font-mono text-sm text-muted animate-pulse">Loading your timesheet…</div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-ink rounded flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="5" height="5" fill="#F5F2EB"/>
                <rect x="9" y="2" width="5" height="5" fill="#E8572A"/>
                <rect x="2" y="9" width="5" height="5" fill="#E8572A"/>
                <rect x="9" y="9" width="5" height="5" fill="#F5F2EB"/>
              </svg>
            </div>
            <span className="font-display font-bold text-base">Timesheet</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted font-mono hidden sm:block">{user?.email}</span>
            {isAdmin && (
              <button onClick={() => router.push("/admin")} className="text-xs font-mono text-accent hover:text-accent/80 transition-colors">Admin</button>
            )}
            <button onClick={handleSignOut} className="text-xs font-mono text-muted hover:text-accent transition-colors">Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-10">

        {/* Title + Log button */}
        <div className="flex items-end justify-between animate-fade-up">
          <div>
            <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
            <h1 className="font-display text-4xl font-bold text-ink">Your Hours</h1>
          </div>
          <button onClick={() => { setShowForm(!showForm); setEditId(null); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white font-display font-semibold text-sm rounded-xl hover:bg-accent/90 active:scale-95 transition-all">
            <span className="text-lg leading-none">+</span>Log hours
          </button>
        </div>

        {success && (
          <div className="animate-fade-in fixed top-6 right-6 z-50 bg-ink text-paper text-sm font-mono px-4 py-2.5 rounded-xl shadow-xl">✓ {success}</div>
        )}

        {/* Log hours form */}
        {showForm && (
          <div className="animate-fade-up bg-card border border-border rounded-2xl p-7 shadow-sm">
            <h2 className="font-display text-lg font-bold mb-6">{editId ? "Edit entry" : "Log hours"}</h2>
            {clients.length === 0 ? (
              <p className="text-sm text-muted font-body">No activities set up yet. {isAdmin ? "Go to Admin to add some." : "Ask your administrator to add activities."}</p>
            ) : (
              <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div>
                  <label className="block text-xs font-mono text-muted uppercase tracking-widest mb-2">Date</label>
                  <input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-paper text-ink text-sm font-body focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-all"/>
                </div>
                <div>
                  <label className="block text-xs font-mono text-muted uppercase tracking-widest mb-2">Activity</label>
                  <select value={form.client} onChange={e => setForm({ ...form, client: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-paper text-ink text-sm font-body focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-all">
                    {clients.map(c => <option key={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono text-muted uppercase tracking-widest mb-2">Hours</label>
                  <input type="number" required min="0.25" max="24" step="0.25" value={form.hours}
                    onChange={e => setForm({ ...form, hours: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-paper text-ink text-sm font-body focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-all"/>
                </div>
                <div className="sm:col-span-3 flex items-center gap-3">
                  <button type="submit" disabled={saving}
                    className="px-6 py-3 bg-ink text-paper font-display font-semibold text-sm rounded-xl hover:bg-ink/90 active:scale-95 transition-all disabled:opacity-50">
                    {saving ? "Saving…" : editId ? "Update entry" : "Save entry"}
                  </button>
                  <button type="button" onClick={resetForm}
                    className="px-4 py-3 border border-border text-muted text-sm font-body rounded-xl hover:border-ink hover:text-ink transition-all">
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 animate-fade-up delay-100">
          <div className="bg-card border border-border rounded-2xl p-5">
            <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Total hours</p>
            <p className="font-display text-3xl font-bold">{totalHours.toFixed(1)}</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-5">
            <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Entries</p>
            <p className="font-display text-3xl font-bold">{filtered.length}</p>
          </div>
          <div className="bg-accent/10 border border-accent/20 rounded-2xl p-5 col-span-2 sm:col-span-1">
            <p className="text-xs font-mono text-accent uppercase tracking-widest mb-1">This week</p>
            <p className="font-display text-3xl font-bold text-accent">
              {entries.filter(e => {
                const d = new Date(e.date);
                const now = new Date();
                const monday = new Date(now); monday.setDate(now.getDate() - now.getDay() + 1); monday.setHours(0,0,0,0);
                return d >= monday;
              }).reduce((s, e) => s + e.hours, 0).toFixed(1)}h
            </p>
          </div>
        </div>

        {/* ── ATTENDANCE CALENDAR ── */}
        <div className="bg-card border border-border rounded-2xl p-7 animate-fade-up delay-200">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-display text-sm font-bold uppercase tracking-widest text-muted">Attendance</h2>
              <p className="font-display font-bold text-lg mt-0.5">{calMonthLabel}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCalMonth(m => {
                  const d = new Date(m.year, m.month - 1, 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:border-ink text-muted hover:text-ink transition-all text-sm"
              >‹</button>
              <button
                onClick={() => setCalMonth(m => {
                  const d = new Date(m.year, m.month + 1, 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:border-ink text-muted hover:text-ink transition-all text-sm"
              >›</button>
            </div>
          </div>

          {/* Day labels */}
          <div className="grid grid-cols-7 mb-2">
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
              <div key={d} className={`text-center text-xs font-mono uppercase tracking-wider py-1 ${d === "Sat" || d === "Sun" ? "text-muted/30" : "text-muted"}`}>{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="space-y-1">
            {calWeeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1">
                {week.map((date, di) => {
                  if (!date) return <div key={di} />;
                  const status = getDayStatus(date);
                  const isToday = date.toDateString() === new Date().toDateString();
                  const key = date.toISOString().split("T")[0];
                  const logged = hoursByDate[key] || 0;
                  const target = targetHours(date);

                  let bg = "bg-border/20 text-muted/40"; // weekend / future
                  if (status === "green") bg = "bg-emerald-100 text-emerald-700 border border-emerald-200";
                  if (status === "red") bg = "bg-red-50 text-red-500 border border-red-200";
                  if (status === "future") bg = "bg-border/10 text-muted/30";

                  return (
                    <div key={di} title={target > 0 ? `${logged}h / ${target}h target` : ""}
                      className={`relative rounded-lg p-1.5 text-center transition-all ${bg} ${isToday ? "ring-2 ring-accent ring-offset-1" : ""}`}>
                      <span className="text-xs font-mono leading-none">{date.getDate()}</span>
                      {target > 0 && status !== "future" && (
                        <div className="text-[9px] font-mono leading-none mt-0.5 opacity-70">
                          {logged > 0 ? `${logged}h` : "—"}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Legend + summary */}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-border/50">
            <div className="flex items-center gap-4 text-xs font-mono text-muted">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-200 inline-block"/>{greenDays} on target</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-50 border border-red-200 inline-block"/>{redDays} missing</span>
            </div>
            <span className="text-xs font-mono text-muted">Mon–Thu 8h · Fri 7h</span>
          </div>
        </div>

        {/* Activity breakdown chart */}
        {clientTotals.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-7 animate-fade-up delay-200">
            <h2 className="font-display text-sm font-bold uppercase tracking-widest text-muted mb-6">Hours by activity</h2>
            <div className="space-y-3">
              {clientTotals.sort((a, b) => b.hours - a.hours).map(c => (
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
        )}

        {/* Entries table */}
        <div className="animate-fade-up delay-300">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold">Entries</h2>
            <div className="flex items-center gap-3">
              <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
                className="text-xs font-mono px-3 py-1.5 rounded-lg border border-border bg-paper text-ink focus:outline-none focus:border-ink transition-all">
                <option value="All">All activities</option>
                {clients.map(c => <option key={c.id}>{c.name}</option>)}
              </select>
              {filtered.length > 0 && (
                <button onClick={exportCSV}
                  className="text-xs font-mono px-3 py-1.5 border border-border rounded-lg hover:border-ink hover:text-ink text-muted transition-all flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5l3 3 3-3M1 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  Export CSV
                </button>
              )}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-12 text-center">
              <div className="text-4xl mb-3">🕐</div>
              <p className="font-display font-semibold text-ink mb-1">No entries yet</p>
              <p className="text-sm text-muted">Log your first hours to get started.</p>
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
                          {new Date(entry.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-block text-xs font-mono bg-ink/8 text-ink rounded-md px-2 py-1 whitespace-nowrap">{entry.client}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="font-display font-bold text-sm">{entry.hours}h</span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2 justify-end">
                            <button onClick={() => startEdit(entry)} className="text-xs text-muted hover:text-ink font-mono transition-colors">Edit</button>
                            <button onClick={() => handleDelete(entry.id)} className="text-xs text-muted hover:text-accent font-mono transition-colors">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

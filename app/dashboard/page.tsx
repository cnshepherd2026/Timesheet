"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

const SUPER_ADMIN = "chris.shepherd@jympartnership.co.uk";

type Entry = { id: string; date: string; client: string; hours: number; user_id: string };
type Client = { id: string; name: string; sort_order: number };

// Format a local Date as YYYY-MM-DD without UTC conversion
function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Today's date key in local time
function todayKey(): string {
  return localDateKey(new Date());
}

// Returns target hours for a given JS Date (0=weekend, 7=Friday, 8=Mon-Thu)
function targetHours(date: Date): number {
  const day = date.getDay();
  if (day === 0 || day === 6) return 0;
  if (day === 5) return 7;
  return 8;
}

function getCalendarMonth(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = (firstDay.getDay() + 6) % 7; // Mon=0
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
  const [filterClient, setFilterClient] = useState("All");
  const [success, setSuccess] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [entriesView, setEntriesView] = useState<"list" | "week">("week");
  const SECTIONS = ["log", "stats", "calendar", "breakdown", "entries"] as const;
  type SectionId = typeof SECTIONS[number];
  const [sectionOrder, setSectionOrder] = useState<SectionId[]>(() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("jym-section-order") : null;
      if (saved) return JSON.parse(saved);
    } catch {}
    return ["log", "stats", "calendar", "breakdown", "entries"];
  });
  const dragSectionItem = useRef<number | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [form, setForm] = useState({
    date: todayKey(),
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
      // Check admin status from profile or super admin email
      if (session.user.email === SUPER_ADMIN) {
        setIsAdmin(true);
      } else {
        const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", session.user.id).single();
        setIsAdmin(profile?.is_admin || false);
      }
      fetchClients();
      fetchEntries(session.user.id);
    });
  }, [supabase, router, fetchEntries, fetchClients]);

  async function handleSignOut() { await supabase.auth.signOut(); router.push("/login"); }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    if (newPassword.length < 8) { setPasswordError("Password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setPasswordError("Passwords do not match."); return; }
    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { setPasswordError(error.message); setPasswordSaving(false); return; }
    setShowChangePassword(false);
    setNewPassword("");
    setConfirmPassword("");
    setPasswordSaving(false);
    setSuccess("Password updated!");
    setTimeout(() => setSuccess(""), 3000);
  }

  function resetForm() {
    setForm({ date: todayKey(), client: clients[0]?.name || "", hours: "8" });
    setEditId(null);
  }

  function startEdit(entry: Entry) {
    setForm({ date: entry.date, client: entry.client, hours: String(entry.hours) });
    setEditId(entry.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const payload = { date: form.date, client: form.client, hours: parseFloat(form.hours), user_id: session.user.id, user_email: session.user.email };
    if (editId) {
      await supabase.from("timesheet_entries").update(payload).eq("id", editId);
      setSuccess("Entry updated!");
    } else {
      await supabase.from("timesheet_entries").insert(payload);
      setSuccess("Hours logged!");
    }
    await fetchEntries(session.user.id);
    resetForm();
    setSaving(false);
    setTimeout(() => setSuccess(""), 3000);
  }

  async function handleDelete(id: string) {
    await supabase.from("timesheet_entries").delete().eq("id", id);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) fetchEntries(session.user.id);
  }

  function exportCSV() {
    const rows = [["Date", "Activity", "Hours"]];
    filtered.forEach(e => rows.push([e.date, e.client, String(e.hours)]));
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `timesheet-${todayKey()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // Build date -> hours map using the string key directly from DB (already YYYY-MM-DD)
  const hoursByDate: Record<string, number> = {};
  entries.forEach(e => { hoursByDate[e.date] = (hoursByDate[e.date] || 0) + e.hours; });

  function getDayStatus(date: Date): "green" | "red" | "weekend" | "future" {
    const target = targetHours(date);
    if (target === 0) return "weekend";
    const key = localDateKey(date);
    if (key > todayKey()) return "future";
    const logged = hoursByDate[key] || 0;
    return logged >= target ? "green" : "red";
  }

  const filtered = filterClient === "All" ? entries : entries.filter(e => e.client === filterClient);
  const totalHours = filtered.reduce((s, e) => s + e.hours, 0);
  const clientTotals = clients
    .map(c => ({ name: c.name, hours: entries.filter(e => e.client === c.name).reduce((s, e) => s + e.hours, 0) }))
    .filter(c => c.hours > 0);
  const maxHours = Math.max(...clientTotals.map(c => c.hours), 1);


  const calWeeks = getCalendarMonth(calMonth.year, calMonth.month);
  const calMonthLabel = new Date(calMonth.year, calMonth.month, 1)
    .toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const calDays = calWeeks.flat().filter(d => d !== null) as Date[];
  const workDays = calDays.filter(d => targetHours(d) > 0 && localDateKey(d) <= todayKey());
  const greenDays = workDays.filter(d => getDayStatus(d) === "green").length;
  const redDays = workDays.filter(d => getDayStatus(d) === "red").length;

  function handleSectionDragStart(index: number) { dragSectionItem.current = index; }
  function handleSectionDragEnter(index: number) {
    if (dragSectionItem.current === null || dragSectionItem.current === index) return;
    const newOrder = [...sectionOrder];
    const dragged = newOrder[dragSectionItem.current];
    newOrder.splice(dragSectionItem.current, 1);
    newOrder.splice(index, 0, dragged);
    dragSectionItem.current = index;
    setSectionOrder(newOrder);
  }
  function handleSectionDragEnd() {
    dragSectionItem.current = null;
    try { localStorage.setItem("jym-section-order", JSON.stringify(sectionOrder)); } catch {}
  }

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
            <span className="font-display font-bold text-base">JYM Timesheet</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted font-mono hidden sm:block">{user?.email}</span>
            {isAdmin && (
              <button onClick={() => router.push("/admin")} className="text-xs font-mono text-accent hover:text-accent/80 transition-colors">Admin</button>
            )}
            <button onClick={() => setShowChangePassword(true)} className="text-xs font-mono text-muted hover:text-ink transition-colors">Change password</button>
            <button onClick={handleSignOut} className="text-xs font-mono text-muted hover:text-accent transition-colors">Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">

        {/* Title */}
        <div className="animate-fade-up">
          <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
          <h1 className="font-display text-4xl font-bold text-ink">Your Hours</h1>
        </div>

        {success && (
          <div className="animate-fade-in fixed top-6 right-6 z-50 bg-ink text-paper text-sm font-mono px-4 py-2.5 rounded-xl shadow-xl">✓ {success}</div>
        )}

        {/* Change password modal */}
        {showChangePassword && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-ink/20 backdrop-blur-sm" onClick={() => setShowChangePassword(false)}>
            <div className="bg-card border border-border rounded-2xl p-8 shadow-xl w-full max-w-sm animate-fade-up" onClick={e => e.stopPropagation()}>
              <h2 className="font-display text-xl font-bold mb-6">Change password</h2>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-muted uppercase tracking-widest mb-2">New password</label>
                  <input type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full px-4 py-3 rounded-xl border border-border bg-paper text-ink placeholder-muted/50 text-sm font-body focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-all"/>
                </div>
                <div>
                  <label className="block text-xs font-mono text-muted uppercase tracking-widest mb-2">Confirm password</label>
                  <input type="password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your password"
                    className="w-full px-4 py-3 rounded-xl border border-border bg-paper text-ink placeholder-muted/50 text-sm font-body focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-all"/>
                </div>
                {passwordError && (
                  <div className="text-xs text-accent font-mono bg-accent/8 border border-accent/20 rounded-lg px-3 py-2">{passwordError}</div>
                )}
                <div className="flex gap-3 pt-1">
                  <button type="submit" disabled={passwordSaving}
                    className="flex-1 py-3 bg-ink text-paper font-display font-semibold text-sm rounded-xl hover:bg-ink/90 active:scale-95 transition-all disabled:opacity-50">
                    {passwordSaving ? "Saving…" : "Update password"}
                  </button>
                  <button type="button" onClick={() => { setShowChangePassword(false); setPasswordError(""); setNewPassword(""); setConfirmPassword(""); }}
                    className="px-4 py-3 border border-border text-muted text-sm font-body rounded-xl hover:border-ink hover:text-ink transition-all">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {sectionOrder.map((sectionId, idx) => {
          const dragProps = {
            draggable: true,
            onDragStart: () => handleSectionDragStart(idx),
            onDragEnter: () => handleSectionDragEnter(idx),
            onDragEnd: handleSectionDragEnd,
            onDragOver: (e: React.DragEvent) => e.preventDefault(),
          };
          const handle = (
            <div className="absolute -left-7 top-4 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing hidden lg:flex">
              <svg width="10" height="16" viewBox="0 0 10 16" fill="none" className="text-muted/30">
                <circle cx="3" cy="2" r="1.5" fill="currentColor"/><circle cx="7" cy="2" r="1.5" fill="currentColor"/>
                <circle cx="3" cy="6" r="1.5" fill="currentColor"/><circle cx="7" cy="6" r="1.5" fill="currentColor"/>
                <circle cx="3" cy="10" r="1.5" fill="currentColor"/><circle cx="7" cy="10" r="1.5" fill="currentColor"/>
                <circle cx="3" cy="14" r="1.5" fill="currentColor"/><circle cx="7" cy="14" r="1.5" fill="currentColor"/>
              </svg>
            </div>
          );
          if (sectionId === "log") return (
            <div key="log" {...dragProps} className="group relative">
              {handle}
              <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
          <h2 className="font-display text-lg font-bold mb-6">{editId ? "Edit entry" : "Log hours"}</h2>
          {clients.length === 0 ? (
            <p className="text-sm text-muted font-body">
              No activities set up yet. {isAdmin ? "Go to Admin to add some." : "Ask your administrator to add activities."}
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div>
                <label className="block text-xs font-mono text-muted uppercase tracking-widest mb-2">Date</label>
                <input type="date" required value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
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
                  className="px-6 py-3 bg-accent text-white font-display font-semibold text-sm rounded-xl hover:bg-accent/90 active:scale-95 transition-all disabled:opacity-50">
                  {saving ? "Saving…" : editId ? "Update entry" : "Save entry"}
                </button>
                {editId && (
                  <button type="button" onClick={resetForm}
                    className="px-4 py-3 border border-border text-muted text-sm font-body rounded-xl hover:border-ink hover:text-ink transition-all">
                    Cancel edit
                  </button>
                )}
              </div>
            </form>
          )}
              </div>
            </div>
          );
          if (sectionId === "stats") return (
            <div key="stats" {...dragProps} className="group relative">
              {handle}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
                const now = new Date();
                const monday = new Date(now);
                monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
                monday.setHours(0, 0, 0, 0);
                const sunday = new Date(monday);
                sunday.setDate(monday.getDate() + 6);
                return e.date >= localDateKey(monday) && e.date <= localDateKey(sunday);
              }).reduce((s, e) => s + e.hours, 0).toFixed(1)}h
            </p>
          </div>
              </div>
            </div>
          );
          if (sectionId === "calendar") return (
            <div key="calendar" {...dragProps} className="group relative">
              {handle}
              <div className="bg-card border border-border rounded-2xl p-7">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-display text-sm font-bold uppercase tracking-widest text-muted">Month View</h2>
              <p className="font-display font-bold text-lg mt-0.5">{calMonthLabel}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCalMonth(m => {
                  const d = new Date(m.year, m.month - 1, 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:border-ink text-muted hover:text-ink transition-all">‹</button>
              <button
                onClick={() => { const n = new Date(); setCalMonth({ year: n.getFullYear(), month: n.getMonth() }); }}
                className="text-xs font-mono px-3 py-1.5 rounded-lg border border-border hover:border-ink text-muted hover:text-ink transition-all">Today</button>
              <button
                onClick={() => setCalMonth(m => {
                  const d = new Date(m.year, m.month + 1, 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:border-ink text-muted hover:text-ink transition-all">›</button>
            </div>
          </div>

          {/* Day headers */}
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
                  if (!date) return <div key={di}/>;
                  const status = getDayStatus(date);
                  const isToday = localDateKey(date) === todayKey();
                  const key = localDateKey(date);
                  const logged = hoursByDate[key] || 0;
                  const target = targetHours(date);

                  let bg = "bg-border/15 text-muted/30"; // weekend
                  if (status === "green") bg = "bg-emerald-100 text-emerald-700 border border-emerald-200";
                  if (status === "red") bg = "bg-red-50 text-red-500 border border-red-200";
                  if (status === "future") bg = "bg-border/10 text-muted/40 border border-dashed border-border/30";

                  return (
                    <div key={di}
                      title={target > 0 ? `${logged}h logged / ${target}h target` : "Weekend"}
                      className={`relative rounded-lg p-1.5 text-center ${bg} ${isToday ? "ring-2 ring-accent ring-offset-1" : ""}`}>
                      <span className="text-xs font-mono leading-none block">{date.getDate()}</span>
                      {target > 0 && status !== "future" && (
                        <div className="text-[9px] font-mono leading-none mt-0.5 opacity-80">
                          {logged > 0 ? `${logged}h` : "—"}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-border/50">
            <div className="flex items-center gap-4 text-xs font-mono text-muted">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-200 inline-block"/>
                {greenDays} on target
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-red-50 border border-red-200 inline-block"/>
                {redDays} missing
              </span>
            </div>
            <span className="text-xs font-mono text-muted">Mon–Thu 8h · Fri 7h</span>
          </div>
              </div>
            </div>
          );
          if (sectionId === "breakdown") return clientTotals.length === 0 ? null : (
            <div key="breakdown" {...dragProps} className="group relative">
              {handle}
              <div className="bg-card border border-border rounded-2xl p-7">
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
            </div>
          );
          if (sectionId === "entries") return (
            <div key="entries" {...dragProps} className="group relative">
              {handle}
              <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-bold">Entries</h2>
            <div className="flex items-center gap-3">
              {/* View toggle */}
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button onClick={() => setEntriesView("week")}
                  className={`text-xs font-mono px-3 py-1.5 transition-colors ${entriesView === "week" ? "bg-ink text-paper" : "bg-paper text-muted hover:text-ink"}`}>
                  Week
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
                <button onClick={exportCSV}
                  className="text-xs font-mono px-3 py-1.5 border border-border rounded-lg hover:border-ink hover:text-ink text-muted transition-all flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5l3 3 3-3M1 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  Export CSV
                </button>
              )}
            </div>
          </div>

          {entriesView === "week" ? (() => {
            // Calculate week days for current weekOffset
            const now = new Date();
            const monday = new Date(now);
            monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + weekOffset * 7);
            monday.setHours(0, 0, 0, 0);
            const weekDays = Array.from({ length: 5 }, (_, i) => {
              const d = new Date(monday);
              d.setDate(monday.getDate() + i);
              return d;
            });
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            const weekLabel = `${monday.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${sunday.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
            const weekEntries = entries.filter(e => e.date >= localDateKey(monday) && e.date <= localDateKey(sunday));
            const weekTotal = weekEntries.reduce((s, e) => s + e.hours, 0);

            return (
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                {/* Week nav */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-paper/40">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setWeekOffset(o => o - 1)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg border border-border hover:border-ink text-muted hover:text-ink transition-all text-sm">‹</button>
                    <button onClick={() => setWeekOffset(0)}
                      className="text-xs font-mono px-2.5 py-1 rounded-lg border border-border hover:border-ink text-muted hover:text-ink transition-all">This week</button>
                    <button onClick={() => setWeekOffset(o => o + 1)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg border border-border hover:border-ink text-muted hover:text-ink transition-all text-sm">›</button>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-mono text-muted">{weekLabel}</span>
                    <span className="text-xs font-mono font-medium text-ink">{weekTotal.toFixed(1)}h total</span>
                  </div>
                </div>

                {/* Day columns */}
                <div className="grid grid-cols-5 divide-x divide-border/50">
                  {weekDays.map(day => {
                    const key = localDateKey(day);
                    const dayEntries = entries.filter(e => e.date === key);
                    const dayTotal = dayEntries.reduce((s, e) => s + e.hours, 0);
                    const target = targetHours(day);
                    const isToday = key === todayKey();
                    const isPast = key < todayKey();
                    const onTarget = dayTotal >= target;
                    const dayName = day.toLocaleDateString("en-GB", { weekday: "short" });
                    const dayNum = day.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

                    return (
                      <div key={key} className={`flex flex-col min-h-[160px] ${isToday ? "bg-accent/5" : ""}`}>
                        {/* Day header */}
                        <div className={`px-3 py-3 border-b border-border/50 ${isToday ? "border-accent/20" : ""}`}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className={`text-xs font-mono font-medium uppercase tracking-wider ${isToday ? "text-accent" : "text-muted"}`}>{dayName}</span>
                            {target > 0 && (isPast || isToday) && dayTotal > 0 && (
                              <span className={`text-[10px] font-mono ${onTarget ? "text-emerald-600" : "text-red-400"}`}>
                                {onTarget ? "✓" : `${dayTotal}/${target}h`}
                              </span>
                            )}
                          </div>
                          <div className={`text-xs font-mono ${isToday ? "text-accent font-semibold" : "text-muted/60"}`}>{dayNum}</div>
                        </div>

                        {/* Entries */}
                        <div className="flex-1 p-2 space-y-1.5">
                          {dayEntries.map(entry => (
                            <div key={entry.id}
                              className="group relative bg-ink/6 hover:bg-ink/10 rounded-lg px-2.5 py-2 transition-all cursor-pointer"
                              onClick={() => startEdit(entry)}>
                              <div className="text-xs font-mono text-ink font-medium truncate">{entry.client}</div>
                              <div className="text-[11px] font-mono text-muted mt-0.5">{entry.hours}h</div>
                              <button
                                onClick={e => { e.stopPropagation(); handleDelete(entry.id); }}
                                className="absolute top-1.5 right-1.5 w-4 h-4 rounded text-muted hover:text-accent opacity-0 group-hover:opacity-100 transition-all text-[10px] flex items-center justify-center">
                                ✕
                              </button>
                            </div>
                          ))}
                          {dayEntries.length === 0 && target > 0 && (
                            <div className={`text-[10px] font-mono text-center py-4 ${isPast ? "text-red-300" : "text-muted/30"}`}>
                              {isPast ? "No hours logged" : "—"}
                            </div>
                          )}
                        </div>

                        {/* Day total */}
                        {dayTotal > 0 && (
                          <div className={`px-3 py-2 border-t border-border/30 text-right text-xs font-mono font-semibold ${onTarget ? "text-emerald-600" : "text-muted"}`}>
                            {dayTotal}h
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })() : (
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
            </>
          )}
              </div>
            </div>
          );
          return null;
        })}
      </main>
    </div>
  );
}

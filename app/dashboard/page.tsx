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
  const [entriesCache, setEntriesCache] = useState<Record<string, Entry[]>>({}); // keyed by "YYYY-MM"
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthLoading, setMonthLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterClient, setFilterClient] = useState("All");
  const [success, setSuccess] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [entriesView, setEntriesView] = useState<"list" | "month">("month");
  const [darkMode, setDarkMode] = useState(() => {
    try { return typeof window !== "undefined" && localStorage.getItem("jym-dark-mode") === "true"; }
    catch { return false; }
  });

  function toggleDarkMode() {
    const next = !darkMode;
    setDarkMode(next);
    try {
      localStorage.setItem("jym-dark-mode", String(next));
      if (next) document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
    } catch {}
  }
  const SECTIONS = ["log", "stats", "breakdown", "entries"] as const;
  type SectionId = typeof SECTIONS[number];
  const [sectionOrder, setSectionOrder] = useState<SectionId[]>(() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("jym-section-order") : null;
      if (saved) return JSON.parse(saved);
    } catch {}
    return ["log", "entries", "stats", "breakdown"];
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

  const fetchMonthEntries = useCallback(async (userId: string, year: number, month: number) => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    const monthStart = `${prefix}-01`;
    const monthEnd = `${prefix}-31`; // Supabase will clamp to actual days
    const { data } = await supabase
      .from("timesheet_entries")
      .select("*")
      .eq("user_id", userId)
      .gte("date", monthStart)
      .lte("date", monthEnd)
      .order("date", { ascending: false });
    setEntriesCache(prev => ({ ...prev, [prefix]: data || [] }));
    return data || [];
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
      const n = new Date();
      fetchMonthEntries(session.user.id, n.getFullYear(), n.getMonth()).then(() => setLoading(false));
    });
  }, [supabase, router, fetchMonthEntries, fetchClients]);

  // Fetch entries when calendar month changes (if not already cached)
  useEffect(() => {
    if (!user?.id) return;
    const prefix = `${String(calMonth.year)}-${String(calMonth.month + 1).padStart(2, "0")}`;
    if (entriesCache[prefix] !== undefined) return; // already cached
    setMonthLoading(true);
    fetchMonthEntries(user.id, calMonth.year, calMonth.month)
      .finally(() => setMonthLoading(false));
  }, [calMonth.year, calMonth.month, user?.id, fetchMonthEntries]);

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
    if (session) fetchMonthEntries(session.user.id, calMonth.year, calMonth.month);
  }

  function exportCSV() {
    const rows = [["Date", "Activity", "Hours"]];
    filtered.forEach(e => rows.push([e.date, e.client, String(e.hours)]));
    // filename includes month
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `timesheet-${todayKey()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // Get entries for the currently viewed month from cache
  const calMonthPrefix = `${String(calMonth.year)}-${String(calMonth.month + 1).padStart(2, "0")}`;
  const monthEntries = entriesCache[calMonthPrefix] || [];

  // Build date -> hours map
  const hoursByDate: Record<string, number> = {};
  monthEntries.forEach(e => { hoursByDate[e.date] = (hoursByDate[e.date] || 0) + e.hours; });

  function getDayStatus(date: Date): "green" | "red" | "weekend" | "future" {
    const target = targetHours(date);
    if (target === 0) return "weekend";
    const key = localDateKey(date);
    if (key > todayKey()) return "future";
    const logged = hoursByDate[key] || 0;
    return logged >= target ? "green" : "red";
  }

  const filtered = (filterClient === "All" ? monthEntries : monthEntries.filter(e => e.client === filterClient));
  const totalHours = filtered.reduce((s, e) => s + e.hours, 0);
  const clientTotals = clients
    .map(c => ({ name: c.name, hours: monthEntries.filter(e => e.client === c.name).reduce((s, e) => s + e.hours, 0) }))
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
            <img src="/JYM-Logo.jpg" alt="JYM Partnership" className="h-8 w-auto object-contain"/>
            <span className="font-display font-semibold text-sm text-ink hidden sm:block">Timesheet</span>
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

        {/* Title + Dark mode toggle */}
        <div className="flex items-start justify-between animate-fade-up mb-8">
          <div>
            <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
            <h1 className="font-display text-4xl font-bold text-ink">Your Hours</h1>
          </div>
          {/* Dark mode toggle */}
          <button onClick={toggleDarkMode}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card hover:border-ink transition-all mt-1"
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className={darkMode ? "text-muted" : "text-accent"}>
              <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M7 1v1M7 12v1M1 7h1M12 7h1M2.9 2.9l.7.7M10.4 10.4l.7.7M2.9 11.1l.7-.7M10.4 3.6l.7-.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <div className={`w-9 h-5 rounded-full transition-all relative ${darkMode ? "bg-ink" : "bg-border"}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full shadow transition-all ${darkMode ? "left-4 bg-paper" : "left-0.5 bg-white"}`}/>
            </div>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className={darkMode ? "text-accent" : "text-muted"}>
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
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

        <div className="space-y-8">
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
            <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">{calMonthLabel} hours</p>
            <p className="font-display text-3xl font-bold">{totalHours.toFixed(1)}</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-5">
            <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Entries</p>
            <p className="font-display text-3xl font-bold">{monthEntries.length}</p>
          </div>
          <div className="bg-accent/10 border border-accent/20 rounded-2xl p-5 col-span-2 sm:col-span-1">
            <p className="text-xs font-mono text-accent uppercase tracking-widest mb-1">This week</p>
            <p className="font-display text-3xl font-bold text-accent">
              {Object.values(entriesCache).flat().filter(e => {
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
            <div className="flex items-center gap-3">
              {/* View toggle */}
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
                <button onClick={exportCSV}
                  className="text-xs font-mono px-3 py-1.5 border border-border rounded-lg hover:border-ink hover:text-ink text-muted transition-all flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5l3 3 3-3M1 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  Export CSV
                </button>
              )}
            </div>
          </div>

          {entriesView === "month" ? (() => {
            const weeks = getCalendarMonth(calMonth.year, calMonth.month);
            const monthTotal = monthEntries.reduce((s, e) => s + e.hours, 0);
            const gridCols = "grid-cols-[1fr_1fr_1fr_1fr_1fr_28px_28px]";
            return (
              <div className="bg-card border border-border rounded-2xl overflow-hidden"><div className="overflow-x-auto"><div className="min-w-[560px]">
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
                        const dayTotal = dayEntries.reduce((s, e) => s + e.hours, 0);
                        const isToday = key === todayKey();
                        const target = targetHours(date);
                        const isFuture = key > todayKey();
                        const isPastOrToday = !isFuture;
                        const onTarget = target > 0 && dayTotal >= target;
                        let cellBg = "";
                        if (isWeekend) cellBg = "bg-paper/10";
                        else if (isFuture) cellBg = "";
                        else if (onTarget) cellBg = "bg-emerald-100 dark:bg-emerald-900/50";
                        else if (isPastOrToday && target > 0) cellBg = "bg-red-100 dark:bg-red-900/50";
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
                                <div key={entry.id} onClick={() => startEdit(entry)}
                                  className="text-[10px] font-mono rounded px-1.5 py-1 truncate cursor-pointer leading-tight bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 transition-colors shadow-sm hover:shadow">
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
        </div>
      </main>
    </div>
  );
}

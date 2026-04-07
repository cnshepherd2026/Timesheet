"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { localDateKey, todayKey, Entry, Client } from "@/lib/dateUtils";
import LogHoursForm from "@/components/dashboard/LogHoursForm";
import StatsBar from "@/components/dashboard/StatsBar";
import ActivityBreakdown from "@/components/dashboard/ActivityBreakdown";
import EntriesSection from "@/components/dashboard/EntriesSection";

const SUPER_ADMIN = "chris.shepherd@jympartnership.co.uk";

export default function Dashboard() {
  const supabase = createClient();
  const router = useRouter();

  const [user, setUser] = useState<{ email?: string; id?: string } | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
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
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [form, setForm] = useState({ date: todayKey(), client: "", hours: "8" });

  const fetchClients = useCallback(async () => {
    const { data } = await supabase.from("clients").select("*").order("sort_order").order("name");
    setClients(data || []);
    if (data && data.length > 0) setForm(f => ({ ...f, client: f.client || data[0].name }));
  }, [supabase]);

  const fetchEntries = useCallback(async (userId: string) => {
    const { data } = await supabase.from("timesheet_entries").select("*")
      .eq("user_id", userId).order("date", { ascending: false });
    const parsed = (data || []).map((e: any) => ({ ...e, hours: parseFloat(e.hours) }));
    setEntries(parsed);
    return parsed;
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      setUser({ email: session.user.email, id: session.user.id });
      if (session.user.email === SUPER_ADMIN) {
        setIsAdmin(true);
      } else {
        const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", session.user.id).single();
        setIsAdmin(profile?.is_admin || false);
      }
      fetchClients();
      fetchEntries(session.user.id).then(() => setLoading(false));
    });
  }, [supabase, router, fetchEntries, fetchClients]);



  function toggleDarkMode() {
    const next = !darkMode;
    setDarkMode(next);
    try {
      localStorage.setItem("jym-dark-mode", String(next));
      if (next) document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
    } catch {}
  }

  async function handleSignOut() { await supabase.auth.signOut(); router.push("/login"); }

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
    if (editId) { await supabase.from("timesheet_entries").update(payload).eq("id", editId); setSuccess("Entry updated!"); }
    else { await supabase.from("timesheet_entries").insert(payload); setSuccess("Hours logged!"); }
    await fetchEntries(session.user.id);
    resetForm(); setSaving(false);
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

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault(); setPasswordError("");
    if (newPassword.length < 8) { setPasswordError("Password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setPasswordError("Passwords do not match."); return; }
    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { setPasswordError(error.message); setPasswordSaving(false); return; }
    setShowChangePassword(false); setNewPassword(""); setConfirmPassword(""); setPasswordSaving(false);
    setSuccess("Password updated!"); setTimeout(() => setSuccess(""), 3000);
  }

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

  const calMonthPrefix = `${String(calMonth.year)}-${String(calMonth.month + 1).padStart(2, "0")}`;
  const monthEntries = entries.filter(e => e.date.startsWith(calMonthPrefix));
  const calMonthLabel = new Date(calMonth.year, calMonth.month, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const filtered = filterClient === "All" ? monthEntries : monthEntries.filter(e => e.client === filterClient);
  const totalHours = filtered.reduce((s, e) => s + e.hours, 0);
  const clientTotals = clients
    .map(c => ({ name: c.name, hours: monthEntries.filter(e => e.client === c.name).reduce((s, e) => s + e.hours, 0) }))
    .filter(c => c.hours > 0);
  const maxHours = Math.max(...clientTotals.map(c => c.hours), 1);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="font-mono text-sm text-muted animate-pulse">Loading your timesheet…</div>
    </div>
  );

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
            {isAdmin && <button onClick={() => router.push("/admin")} className="text-xs font-mono text-accent hover:text-accent/80 transition-colors">Admin</button>}
            <button onClick={() => setShowChangePassword(true)} className="text-xs font-mono text-muted hover:text-ink transition-colors">Change password</button>
            <button onClick={handleSignOut} className="text-xs font-mono text-muted hover:text-accent transition-colors">Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Title + dark mode */}
        <div className="flex items-start justify-between animate-fade-up mb-8">
          <div>
            <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
            <h1 className="font-display text-4xl font-bold text-ink">Your Hours</h1>
          </div>
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
                {passwordError && <div className="text-xs text-accent font-mono bg-accent/8 border border-accent/20 rounded-lg px-3 py-2">{passwordError}</div>}
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

        {/* Draggable sections */}
        <div className="space-y-8">
          {sectionOrder.map((sectionId, idx) => {
            const dragProps = {
              draggable: true,
              onDragStart: () => handleSectionDragStart(idx),
              onDragEnter: () => handleSectionDragEnter(idx),
              onDragEnd: handleSectionDragEnd,
              onDragOver: (e: React.DragEvent) => e.preventDefault(),
            };
            if (sectionId === "log") return (
              <div key="log" id="log-form" {...dragProps} className="group relative">
                {handle}
                <LogHoursForm
                  form={form} setForm={setForm} clients={clients}
                  saving={saving} editId={editId} isAdmin={isAdmin}
                  onSubmit={handleSubmit} onCancel={resetForm}
                />
              </div>
            );
            if (sectionId === "stats") return (
              <div key="stats" {...dragProps} className="group relative">
                {handle}
                <StatsBar
                  totalHours={totalHours} monthEntriesCount={monthEntries.length}
                  calMonthLabel={calMonthLabel} allEntries={entries}
                />
              </div>
            );
            if (sectionId === "breakdown") return clientTotals.length === 0 ? null : (
              <div key="breakdown" {...dragProps} className="group relative">
                {handle}
                <ActivityBreakdown clientTotals={clientTotals} maxHours={maxHours}/>
              </div>
            );
            if (sectionId === "entries") return (
              <div key="entries" {...dragProps} className="group relative">
                {handle}
                <EntriesSection
                  monthEntries={monthEntries} filtered={filtered} clients={clients}
                  calMonth={calMonth} calMonthLabel={calMonthLabel}
                  monthLoading={monthLoading} entriesView={entriesView}
                  filterClient={filterClient}
                  setEntriesView={setEntriesView} setFilterClient={setFilterClient}
                  setCalMonth={setCalMonth} onEdit={startEdit}
                  onDelete={handleDelete} onExportCSV={exportCSV}
                  onDateClick={(dateStr) => { setForm(f => ({ ...f, date: dateStr })); setTimeout(() => { document.getElementById("log-form")?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 50); }}
                />
              </div>
            );
            return null;
          })}
        </div>
      </main>
    </div>
  );
}

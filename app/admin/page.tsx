"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

const ADMIN_EMAILS = ["chris.shepherd@jympartnership.co.uk"];

type Client = { id: string; name: string; sort_order: number };
type Entry = { id: string; date: string; client: string; hours: number; user_id: string; user_email: string };
type Profile = { id: string; display_name: string | null; email: string };

function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function targetHours(date: Date): number {
  const day = date.getDay();
  if (day === 0 || day === 6) return 0;
  if (day === 5) return 7;
  return 8;
}

function getWeekDays(weekOffset: number): Date[] {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export default function AdminPage() {
  const supabase = createClient();
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [newClient, setNewClient] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [reportView, setReportView] = useState<"by-client" | "by-user">("by-client");
  const [filterMonth, setFilterMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [editingName, setEditingName] = useState<Record<string, string>>({});
  const [attendWeekOffset, setAttendWeekOffset] = useState(0);

  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const fetchAll = useCallback(async () => {
    const [{ data: clientData }, { data: entryData }, { data: profileData }] = await Promise.all([
      supabase.from("clients").select("*").order("sort_order").order("name"),
      supabase.from("timesheet_entries").select("*").order("date", { ascending: false }),
      supabase.from("profiles").select("*"),
    ]);
    setClients(clientData || []);
    setEntries(entryData || []);

    const profileMap: Record<string, Profile> = {};
    (profileData || []).forEach((p: any) => {
      profileMap[p.id] = { id: p.id, display_name: p.display_name, email: "" };
    });
    (entryData || []).forEach((e: any) => {
      if (profileMap[e.user_id]) profileMap[e.user_id].email = e.user_email || "";
      else profileMap[e.user_id] = { id: e.user_id, display_name: null, email: e.user_email || e.user_id };
    });
    const profileList = Object.values(profileMap);
    setProfiles(profileList);
    const nameMap: Record<string, string> = {};
    profileList.forEach(p => { nameMap[p.id] = p.display_name || ""; });
    setEditingName(nameMap);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      if (!ADMIN_EMAILS.includes(session.user.email ?? "")) { router.push("/dashboard"); return; }
      fetchAll();
    });
  }, [supabase, router, fetchAll]);

  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault();
    if (!newClient.trim()) return;
    setSaving(true);
    const maxOrder = clients.reduce((m, c) => Math.max(m, c.sort_order || 0), 0);
    await supabase.from("clients").insert({ name: newClient.trim(), sort_order: maxOrder + 1 });
    setNewClient("");
    await fetchAll();
    setSaving(false);
    setSuccess("Activity added!");
    setTimeout(() => setSuccess(""), 3000);
  }

  async function handleDeleteClient(id: string) {
    await supabase.from("clients").delete().eq("id", id);
    fetchAll();
  }

  async function handleSaveName(userId: string) {
    const name = editingName[userId]?.trim() || null;
    await supabase.from("profiles").upsert({ id: userId, display_name: name }, { onConflict: "id" } as any);
    setSuccess("Name saved!");
    setTimeout(() => setSuccess(""), 3000);
    fetchAll();
  }

  function handleDragStart(index: number) { dragItem.current = index; }
  function handleDragEnter(index: number) {
    dragOverItem.current = index;
    const newList = [...clients];
    const dragged = newList[dragItem.current!];
    newList.splice(dragItem.current!, 1);
    newList.splice(index, 0, dragged);
    dragItem.current = index;
    setClients(newList);
  }
  async function handleDragEnd() {
    const updates = clients.map((c, i) => ({ id: c.id, name: c.name, sort_order: i }));
    await Promise.all(updates.map(u => supabase.from("clients").update({ sort_order: u.sort_order }).eq("id", u.id)));
    dragItem.current = null; dragOverItem.current = null;
    setSuccess("Order saved!"); setTimeout(() => setSuccess(""), 2000);
  }

  function getDisplayName(userId: string, userEmail: string) {
    const profile = profiles.find(p => p.id === userId);
    return profile?.display_name || userEmail || userId;
  }

  function exportReportCSV() {
    const filtered = filterMonth ? entries.filter(e => e.date.startsWith(filterMonth)) : entries;
    const rows = [["Date", "Person", "Activity", "Hours"]];
    filtered.forEach(e => rows.push([e.date, getDisplayName(e.user_id, e.user_email), e.client, String(e.hours)]));
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `timesheet-report-${filterMonth || "all"}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // Attendance helpers
  const hoursByUserDate: Record<string, Record<string, number>> = {};
  entries.forEach(e => {
    if (!hoursByUserDate[e.user_id]) hoursByUserDate[e.user_id] = {};
    hoursByUserDate[e.user_id][e.date] = (hoursByUserDate[e.user_id][e.date] || 0) + e.hours;
  });

  function getUserDayStatus(userId: string, date: Date): "green" | "red" | "future" | "weekend" {
    const target = targetHours(date);
    if (target === 0) return "weekend";
    const todayStr = localDateKey(new Date());
    const key = localDateKey(date);
    if (key > todayStr) return "future";
    const logged = (hoursByUserDate[userId] || {})[key] || 0;
    return logged >= target ? "green" : "red";
  }

  const attendWeekDays = getWeekDays(attendWeekOffset);
  const weekLabel = `${attendWeekDays[0].toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${attendWeekDays[4].toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  const filteredEntries = filterMonth ? entries.filter(e => e.date.startsWith(filterMonth)) : entries;

  const clientSummary = clients.map(c => {
    const ce = filteredEntries.filter(e => e.client === c.name);
    const totalHours = ce.reduce((s, e) => s + e.hours, 0);
    const userBreakdown: Record<string, { name: string; hours: number }> = {};
    ce.forEach(e => {
      const key = e.user_id;
      const name = getDisplayName(e.user_id, e.user_email);
      if (!userBreakdown[key]) userBreakdown[key] = { name, hours: 0 };
      userBreakdown[key].hours += e.hours;
    });
    return { name: c.name, totalHours, userBreakdown: Object.values(userBreakdown) };
  }).filter(c => c.totalHours > 0).sort((a, b) => b.totalHours - a.totalHours);

  const userSummary = profiles.map(p => {
    const ue = filteredEntries.filter(e => e.user_id === p.id);
    const totalHours = ue.reduce((s, e) => s + e.hours, 0);
    const byClient: Record<string, number> = {};
    ue.forEach(e => { byClient[e.client] = (byClient[e.client] || 0) + e.hours; });
    return { id: p.id, name: p.display_name || p.email || p.id, totalHours, byClient: Object.entries(byClient) };
  }).filter(u => u.totalHours > 0).sort((a, b) => b.totalHours - a.totalHours);

  const totalAllHours = filteredEntries.reduce((s, e) => s + e.hours, 0);
  const maxClientHours = Math.max(...clientSummary.map(c => c.totalHours), 1);

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    return d.toISOString().slice(0, 7);
  });

  // All users who have a profile (show everyone, even if no entries yet)
  const allUsers = profiles;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="font-mono text-sm text-muted animate-pulse">Loading…</div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
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
            <span className="text-xs font-mono text-muted bg-border/60 px-2 py-0.5 rounded-md">Admin</span>
          </div>
          <button onClick={() => router.push("/dashboard")} className="text-xs font-mono text-muted hover:text-ink transition-colors">← Back to timesheet</button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-12">

        {success && (
          <div className="animate-fade-in fixed top-6 right-6 z-50 bg-ink text-paper text-sm font-mono px-4 py-2.5 rounded-xl shadow-xl">✓ {success}</div>
        )}

        {/* ── ATTENDANCE OVERVIEW ── */}
        <section className="animate-fade-up space-y-5">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="font-display text-4xl font-bold text-ink">Attendance</h1>
              <p className="text-sm text-muted mt-1">Daily hours target per team member. Mon–Thu 8h · Fri 7h</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setAttendWeekOffset(o => o - 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:border-ink text-muted hover:text-ink transition-all text-sm">‹</button>
              <button onClick={() => setAttendWeekOffset(0)}
                className="text-xs font-mono px-3 py-1.5 rounded-lg border border-border hover:border-ink text-muted hover:text-ink transition-all">This week</button>
              <button onClick={() => setAttendWeekOffset(o => o + 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:border-ink text-muted hover:text-ink transition-all text-sm">›</button>
            </div>
          </div>
          <p className="text-xs font-mono text-muted">{weekLabel}</p>

          {allUsers.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-10 text-center">
              <p className="text-sm text-muted">No users have logged time yet.</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              {/* Header row */}
              <div className="grid grid-cols-[1fr_repeat(5,_52px)] gap-2 px-6 py-3 border-b border-border bg-paper/50">
                <div className="text-xs font-mono text-muted uppercase tracking-widest">Person</div>
                {attendWeekDays.map(d => (
                  <div key={d.toISOString()} className="text-center text-xs font-mono text-muted uppercase tracking-wider">
                    {d.toLocaleDateString("en-GB", { weekday: "short" })}
                    <div className="text-[10px] text-muted/60">{d.getDate()}</div>
                  </div>
                ))}
              </div>
              {/* User rows */}
              {allUsers.map((user, i) => (
                <div key={user.id} className={`grid grid-cols-[1fr_repeat(5,_52px)] gap-2 px-6 py-3 items-center ${i < allUsers.length - 1 ? "border-b border-border/50" : ""}`}>
                  <div className="text-sm font-body text-ink truncate">{user.display_name || user.email || user.id}</div>
                  {attendWeekDays.map(d => {
                    const status = getUserDayStatus(user.id, d);
                    const key = localDateKey(d);
                    const logged = (hoursByUserDate[user.id] || {})[key] || 0;
                    const target = targetHours(d);
                    let cell = <div className="w-10 h-10 mx-auto rounded-lg bg-border/15" />;
                    if (status === "green") cell = (
                      <div title={`${logged}h logged`} className="w-10 h-10 mx-auto rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center">
                        <span className="text-[10px] font-mono text-emerald-700 font-medium">{logged}h</span>
                      </div>
                    );
                    if (status === "red") cell = (
                      <div title={`${logged}h / ${target}h`} className="w-10 h-10 mx-auto rounded-lg bg-red-50 border border-red-200 flex items-center justify-center">
                        <span className="text-[10px] font-mono text-red-500 font-medium">{logged > 0 ? `${logged}h` : "—"}</span>
                      </div>
                    );
                    if (status === "future") cell = <div className="w-10 h-10 mx-auto rounded-lg bg-border/10 border border-dashed border-border/30" />;
                    return <div key={d.toISOString()}>{cell}</div>;
                  })}
                </div>
              ))}
              {/* Legend */}
              <div className="flex items-center gap-4 px-6 py-3 border-t border-border/50 bg-paper/30">
                <span className="flex items-center gap-1.5 text-xs font-mono text-muted"><span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-200 inline-block"/>On target</span>
                <span className="flex items-center gap-1.5 text-xs font-mono text-muted"><span className="w-3 h-3 rounded-sm bg-red-50 border border-red-200 inline-block"/>Missing / short</span>
                <span className="flex items-center gap-1.5 text-xs font-mono text-muted"><span className="w-3 h-3 rounded-sm bg-border/15 inline-block"/>Weekend</span>
              </div>
            </div>
          )}
        </section>

        {/* ── TIME REPORT ── */}
        <section className="border-t border-border pt-10 animate-fade-up space-y-6">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold text-ink">Time Report</h2>
              <p className="text-sm text-muted mt-1">All staff hours across activities.</p>
            </div>
            <button onClick={exportReportCSV}
              className="text-xs font-mono px-3 py-1.5 border border-border rounded-lg hover:border-ink hover:text-ink text-muted transition-all flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5l3 3 3-3M1 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              Export CSV
            </button>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
              className="text-xs font-mono px-3 py-1.5 rounded-lg border border-border bg-paper text-ink focus:outline-none focus:border-ink transition-all">
              <option value="">All time</option>
              {monthOptions.map(m => (
                <option key={m} value={m}>{new Date(m + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</option>
              ))}
            </select>
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button onClick={() => setReportView("by-client")}
                className={`text-xs font-mono px-3 py-1.5 transition-colors ${reportView === "by-client" ? "bg-ink text-paper" : "bg-paper text-muted hover:text-ink"}`}>By activity</button>
              <button onClick={() => setReportView("by-user")}
                className={`text-xs font-mono px-3 py-1.5 transition-colors ${reportView === "by-user" ? "bg-ink text-paper" : "bg-paper text-muted hover:text-ink"}`}>By person</button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-card border border-border rounded-2xl p-5">
              <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Total hours</p>
              <p className="font-display text-3xl font-bold">{totalAllHours.toFixed(1)}</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-5">
              <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Activities</p>
              <p className="font-display text-3xl font-bold">{clientSummary.length}</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-5">
              <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Team members</p>
              <p className="font-display text-3xl font-bold">{userSummary.length}</p>
            </div>
          </div>

          {filteredEntries.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-12 text-center">
              <p className="text-sm text-muted">No entries for this period.</p>
            </div>
          ) : reportView === "by-client" ? (
            <div className="space-y-4">
              {clientSummary.map(c => (
                <div key={c.name} className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
                    <span className="font-display font-bold text-sm">{c.name}</span>
                    <div className="flex items-center gap-4">
                      <div className="w-32 bg-border/40 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-accent rounded-full" style={{ width: `${(c.totalHours / maxClientHours) * 100}%` }}/>
                      </div>
                      <span className="font-display font-bold text-sm w-14 text-right">{c.totalHours.toFixed(1)}h</span>
                    </div>
                  </div>
                  {c.userBreakdown.sort((a, b) => b.hours - a.hours).map(u => (
                    <div key={u.name} className="flex items-center justify-between px-6 py-3 border-b border-border/30 last:border-b-0 bg-paper/30">
                      <span className="text-xs font-mono text-muted">{u.name}</span>
                      <span className="text-xs font-mono text-ink font-medium">{u.hours.toFixed(1)}h</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {userSummary.map(u => (
                <div key={u.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
                    <span className="font-display font-bold text-sm">{u.name}</span>
                    <span className="font-display font-bold text-sm">{u.totalHours.toFixed(1)}h</span>
                  </div>
                  {u.byClient.sort((a, b) => b[1] - a[1]).map(([client, hours]) => (
                    <div key={client} className="flex items-center justify-between px-6 py-3 border-b border-border/30 last:border-b-0 bg-paper/30">
                      <span className="text-xs font-mono text-muted">{client}</span>
                      <span className="text-xs font-mono text-ink font-medium">{hours.toFixed(1)}h</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── MANAGE PEOPLE ── */}
        <section className="border-t border-border pt-10 space-y-6 animate-fade-up">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink">Manage People</h2>
            <p className="text-sm text-muted mt-1">Set display names for each team member.</p>
          </div>
          {profiles.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-10 text-center">
              <p className="text-sm text-muted">No users have logged time yet.</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              {profiles.map((profile, i) => (
                <div key={profile.id} className={`flex items-center gap-4 px-6 py-4 ${i < profiles.length - 1 ? "border-b border-border/50" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-muted truncate">{profile.email || profile.id}</p>
                  </div>
                  <input type="text" value={editingName[profile.id] || ""}
                    onChange={e => setEditingName(n => ({ ...n, [profile.id]: e.target.value }))}
                    placeholder="Display name"
                    className="w-44 px-3 py-2 rounded-lg border border-border bg-paper text-ink text-sm font-body focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-all"/>
                  <button onClick={() => handleSaveName(profile.id)}
                    className="text-xs font-mono px-3 py-2 bg-ink text-paper rounded-lg hover:bg-ink/90 transition-all whitespace-nowrap">Save</button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── MANAGE ACTIVITIES ── */}
        <section className="border-t border-border pt-10 space-y-6 animate-fade-up">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink">Manage Activities</h2>
            <p className="text-sm text-muted mt-1">Add clients, leave types, or any activity. Drag to reorder.</p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-7">
            <h3 className="font-display text-xs font-bold uppercase tracking-widest text-muted mb-5">Add new activity</h3>
            <form onSubmit={handleAddClient} className="flex gap-3">
              <input type="text" required value={newClient} onChange={e => setNewClient(e.target.value)}
                placeholder="e.g. Annual Leave, Client Name…"
                className="flex-1 px-4 py-3 rounded-xl border border-border bg-paper text-ink placeholder-muted/50 text-sm font-body focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-all"/>
              <button type="submit" disabled={saving}
                className="px-6 py-3 bg-ink text-paper font-display font-semibold text-sm rounded-xl hover:bg-ink/90 active:scale-95 transition-all disabled:opacity-50 whitespace-nowrap">
                {saving ? "Adding…" : "Add"}
              </button>
            </form>
          </div>

          <div>
            <h3 className="font-display text-xs font-bold uppercase tracking-widest text-muted mb-4">Current activities ({clients.length})</h3>
            {clients.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-10 text-center">
                <p className="text-sm text-muted">No activities yet. Add your first one above.</p>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                {clients.map((client, i) => (
                  <div key={client.id} draggable
                    onDragStart={() => handleDragStart(i)}
                    onDragEnter={() => handleDragEnter(i)}
                    onDragEnd={handleDragEnd}
                    onDragOver={e => e.preventDefault()}
                    className={`flex items-center gap-3 px-6 py-4 hover:bg-paper/60 transition-colors cursor-grab active:cursor-grabbing select-none ${i < clients.length - 1 ? "border-b border-border/50" : ""}`}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-muted/50 shrink-0">
                      <circle cx="4" cy="3" r="1.2" fill="currentColor"/>
                      <circle cx="10" cy="3" r="1.2" fill="currentColor"/>
                      <circle cx="4" cy="7" r="1.2" fill="currentColor"/>
                      <circle cx="10" cy="7" r="1.2" fill="currentColor"/>
                      <circle cx="4" cy="11" r="1.2" fill="currentColor"/>
                      <circle cx="10" cy="11" r="1.2" fill="currentColor"/>
                    </svg>
                    <span className="flex-1 font-body text-sm text-ink">{client.name}</span>
                    <button onClick={() => handleDeleteClient(client.id)} className="text-xs font-mono text-muted hover:text-accent transition-colors">Remove</button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs font-mono text-muted mt-3">↕ Drag rows to reorder — order is saved automatically</p>
          </div>
        </section>

      </main>
    </div>
  );
}

"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

const SUPER_ADMIN = "chris.shepherd@jympartnership.co.uk";

type Client = { id: string; name: string; sort_order: number };
type Entry = { id: string; date: string; client: string; hours: number; user_id: string; user_email: string };
type Profile = { id: string; display_name: string | null; email: string; is_admin: boolean; created_at?: string };

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

function getTwoWeekDays(twoWeekOffset: number): Date[] {
  // twoWeekOffset moves in 2-week blocks; find the Monday of the current 2-week period
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + twoWeekOffset * 10);
  monday.setHours(0, 0, 0, 0);
  // Return Mon-Fri of week 1 then Mon-Fri of week 2
  const days: Date[] = [];
  for (let week = 0; week < 2; week++) {
    for (let day = 0; day < 5; day++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + week * 7 + day);
      days.push(d);
    }
  }
  return days;
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
  const [inactiveThreshold, setInactiveThreshold] = useState<10 | 22>(() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("jym-inactive-threshold") : null;
      if (saved === "22") return 22;
    } catch {}
    return 10;
  });

  function toggleInactiveThreshold() {
    const next = inactiveThreshold === 10 ? 22 : 10;
    setInactiveThreshold(next);
    try { localStorage.setItem("jym-inactive-threshold", String(next)); } catch {}
  }
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<Profile | null>(null);

  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const fetchAll = useCallback(async () => {
    const [{ data: clientData }, { data: entryData }, { data: profileData }, usersRes] = await Promise.all([
      supabase.from("clients").select("*").order("sort_order").order("name"),
      supabase.from("timesheet_entries").select("*").order("date", { ascending: false }),
      supabase.from("profiles").select("*"),
      fetch("/api/users"),
    ]);
    setClients(clientData || []);
    setEntries(entryData || []);

    // Build email map from auth users API (authoritative source)
    const emailMap: Record<string, string> = {};
    if (usersRes.ok) {
      const usersData = await usersRes.json();
      (usersData.users || []).forEach((u: any) => { emailMap[u.id] = u.email || ""; });
    }

    const profileMap: Record<string, Profile> = {};
    (profileData || []).forEach((p: any) => {
      profileMap[p.id] = { id: p.id, display_name: p.display_name, email: emailMap[p.id] || "", is_admin: p.is_admin || false };
    });
    // Also add any users from auth that don't have a profile row yet
    Object.entries(emailMap).forEach(([id, email]) => {
      if (!profileMap[id]) profileMap[id] = { id, display_name: null, email, is_admin: false };
      else if (!profileMap[id].email) profileMap[id].email = email;
    });
    // Fill in from entries as fallback
    (entryData || []).forEach((e: any) => {
      if (profileMap[e.user_id] && !profileMap[e.user_id].email) {
        profileMap[e.user_id].email = e.user_email || "";
      }
    });

    const profileList = Object.values(profileMap).sort((a, b) => a.email.localeCompare(b.email));
    setProfiles(profileList);
    const nameMap: Record<string, string> = {};
    profileList.forEach(p => { nameMap[p.id] = p.display_name || ""; });
    setEditingName(nameMap);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      // Allow super admin or any user with is_admin = true
      if (session.user.email !== SUPER_ADMIN) {
        const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", session.user.id).single();
        if (!profile?.is_admin) { router.push("/dashboard"); return; }
      }
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

  async function handleToggleAdmin(userId: string, currentValue: boolean) {
    // Prevent removing super admin's own admin status
    const profile = profiles.find(p => p.id === userId);
    if (profile?.email === SUPER_ADMIN && currentValue) return;
    await supabase.from("profiles").update({ is_admin: !currentValue }).eq("id", userId);
    setSuccess(!currentValue ? "Admin access granted!" : "Admin access removed!");
    setTimeout(() => setSuccess(""), 3000);
    fetchAll();
  }

  async function handleInviteUser(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { setSuccess("Error: " + data.error); }
    else { setSuccess("Invite sent to " + inviteEmail); setInviteEmail(""); await fetchAll(); }
    setInviting(false);
    setTimeout(() => setSuccess(""), 4000);
  }

  async function handleDeleteUser(userId: string) {
    const res = await fetch("/api/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    if (!res.ok) { setSuccess("Error: " + data.error); }
    else { setSuccess("User removed."); await fetchAll(); }
    setConfirmDeleteUser(null);
    setTimeout(() => setSuccess(""), 3000);
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

  // Last logged date per user (only counting working days)
  const lastLoggedByUser: Record<string, string> = {};
  entries.forEach(e => {
    if (!lastLoggedByUser[e.user_id] || e.date > lastLoggedByUser[e.user_id]) {
      lastLoggedByUser[e.user_id] = e.date;
    }
  });

  // Count working days between two date strings
  function workingDaysSince(dateStr: string): number {
    const from = new Date(dateStr + "T12:00:00");
    const to = new Date();
    to.setHours(12, 0, 0, 0);
    let count = 0;
    const cur = new Date(from);
    cur.setDate(cur.getDate() + 1); // start counting from day after
    while (cur <= to) {
      const day = cur.getDay();
      if (day !== 0 && day !== 6) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }

  function getUserDayStatus(userId: string, date: Date): "green" | "red" | "future" | "weekend" {
    const target = targetHours(date);
    if (target === 0) return "weekend";
    const todayStr = localDateKey(new Date());
    const key = localDateKey(date);
    if (key > todayStr) return "future";
    const logged = (hoursByUserDate[userId] || {})[key] || 0;
    return logged >= target ? "green" : "red";
  }

  const attendWeekDays = getTwoWeekDays(attendWeekOffset);
  const weekLabel = `${attendWeekDays[0].toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${attendWeekDays[9].toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

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

  // Users who haven't logged in more than threshold working days
  const inactiveUsers = allUsers.map(u => {
    const last = lastLoggedByUser[u.id];
    if (!last) return { ...u, daysSince: 999, lastDate: null as string | null };
    const days = workingDaysSince(last);
    return { ...u, daysSince: days, lastDate: last as string | null };
  }).filter(u => u.daysSince >= inactiveThreshold)
    .sort((a, b) => b.daysSince - a.daysSince);

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
            <img src="/JYM-Logo.jpg" alt="JYM Partnership" className="h-8 w-auto object-contain"/>
            <span className="font-display font-semibold text-sm text-ink hidden sm:block">Timesheet</span>
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
              <h1 className="font-display text-4xl font-bold text-ink">User Summary</h1>
              <p className="text-sm text-muted mt-1">Two-week view of daily hours per team member. Mon–Thu 8h · Fri 7h</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setAttendWeekOffset(o => o - 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:border-ink text-muted hover:text-ink transition-all text-sm">‹</button>
              <button onClick={() => setAttendWeekOffset(0)}
                className="text-xs font-mono px-3 py-1.5 rounded-lg border border-border hover:border-ink text-muted hover:text-ink transition-all">Current</button>
              <button onClick={() => setAttendWeekOffset(o => o + 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:border-ink text-muted hover:text-ink transition-all text-sm">›</button>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-ink/5 border border-border rounded-lg">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-muted shrink-0"><rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M1 5h10M4 1v2M8 1v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            <span className="text-xs font-mono font-medium text-ink">{weekLabel}</span>
          </div>

          {allUsers.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-10 text-center">
              <p className="text-sm text-muted">No users have logged time yet.</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              {/* Header row */}
              <div className="overflow-x-auto"><div className="min-w-[700px]"><div className="grid grid-cols-[1fr_repeat(10,_44px)] gap-1 px-4 py-3 border-b border-border bg-paper/50">
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
                <div key={user.id} className={`grid grid-cols-[1fr_repeat(10,_44px)] gap-1 px-4 py-3 items-center ${i < allUsers.length - 1 ? "border-b border-border/50" : ""}`}>
                  <div className="text-sm font-body text-ink truncate">{user.display_name || user.email || user.id}</div>
                  {attendWeekDays.map(d => {
                    const status = getUserDayStatus(user.id, d);
                    const key = localDateKey(d);
                    const logged = (hoursByUserDate[user.id] || {})[key] || 0;
                    const target = targetHours(d);
                    let cell = <div className="w-9 h-9 mx-auto rounded-lg bg-border/15" />;
                    if (status === "green") cell = (
                      <div title={`${logged}h logged`} className="w-9 h-9 mx-auto rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center">
                        <span className="text-[10px] font-mono text-emerald-700 font-medium">{logged}h</span>
                      </div>
                    );
                    if (status === "red") cell = (
                      <div title={`${logged}h / ${target}h`} className="w-9 h-9 mx-auto rounded-lg bg-red-50 border border-red-200 flex items-center justify-center">
                        <span className="text-[10px] font-mono text-red-500 font-medium">{logged > 0 ? `${logged}h` : "—"}</span>
                      </div>
                    );
                    if (status === "future") cell = <div className="w-9 h-9 mx-auto rounded-lg bg-border/10 border border-dashed border-border/30" />;
                    return <div key={d.toISOString()}>{cell}</div>;
                  })}
                </div>
              ))}
            </div></div>
              {/* Legend */}
              <div className="flex items-center gap-4 px-4 py-3 border-t border-border/50 bg-paper/30">
                <span className="flex items-center gap-1.5 text-xs font-mono text-muted"><span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-200 inline-block"/>On target</span>
                <span className="flex items-center gap-1.5 text-xs font-mono text-muted"><span className="w-3 h-3 rounded-sm bg-red-50 border border-red-200 inline-block"/>Missing / short</span>
              </div>
            </div>
          )}
          {/* Inactive users alert */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-display font-bold text-ink">Inactive users</span>
                {inactiveUsers.length > 0 && (
                  <span className="text-xs font-mono bg-accent/10 text-accent border border-accent/20 px-2 py-0.5 rounded-full">
                    {inactiveUsers.length} flagged
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-mono transition-colors ${inactiveThreshold === 10 ? "text-ink font-semibold" : "text-muted"}`}>2 weeks</span>
                <button onClick={toggleInactiveThreshold}
                  className={`w-10 h-6 rounded-full transition-all relative ${inactiveThreshold === 22 ? "bg-accent" : "bg-border"}`}>
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${inactiveThreshold === 22 ? "left-5" : "left-1"}`}/>
                </button>
                <span className={`text-xs font-mono transition-colors ${inactiveThreshold === 22 ? "text-ink font-semibold" : "text-muted"}`}>1 month</span>
              </div>
            </div>
            {inactiveUsers.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"/>
                All team members have logged time within the last {inactiveThreshold === 10 ? "2 weeks" : "month"}
              </div>
            ) : (
              <div className="space-y-2">
                {inactiveUsers.map(u => (
                  <div key={u.id} className="flex items-center justify-between py-2.5 px-4 bg-accent/5 border border-accent/15 rounded-xl">
                    <div className="flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full bg-accent inline-block shrink-0"/>
                      <span className="text-sm font-body text-ink">{u.display_name || u.email || u.id}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-muted">
                        {u.lastDate
                          ? `Last logged ${new Date(u.lastDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                          : "Never logged"}
                      </span>
                      <span className="text-xs font-mono font-semibold text-accent">
                        {u.daysSince === 999 ? "—" : `${u.daysSince} working day${u.daysSince !== 1 ? "s" : ""} ago`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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

        {/* Confirm delete user modal */}
        {confirmDeleteUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-ink/20 backdrop-blur-sm" onClick={() => setConfirmDeleteUser(null)}>
            <div className="bg-card border border-border rounded-2xl p-8 shadow-xl w-full max-w-sm animate-fade-up" onClick={e => e.stopPropagation()}>
              <h2 className="font-display text-xl font-bold mb-2">Remove user?</h2>
              <p className="text-sm text-muted mb-6">This will permanently delete <span className="font-medium text-ink">{confirmDeleteUser.email}</span> and all their timesheet entries. This cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => handleDeleteUser(confirmDeleteUser.id)}
                  className="flex-1 py-3 bg-accent text-white font-display font-semibold text-sm rounded-xl hover:bg-accent/90 transition-all">
                  Yes, remove
                </button>
                <button onClick={() => setConfirmDeleteUser(null)}
                  className="px-4 py-3 border border-border text-muted text-sm font-body rounded-xl hover:border-ink hover:text-ink transition-all">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── MANAGE PEOPLE ── */}
        <section className="border-t border-border pt-10 space-y-6 animate-fade-up">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink">Manage People</h2>
            <p className="text-sm text-muted mt-1">Invite team members, set display names, and manage admin access.</p>
          </div>

          {/* Invite user */}
          <div className="bg-card border border-border rounded-2xl p-7">
            <h3 className="font-display text-xs font-bold uppercase tracking-widest text-muted mb-5">Invite new user</h3>
            <form onSubmit={handleInviteUser} className="flex gap-3">
              <input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                placeholder="colleague@email.com"
                className="flex-1 px-4 py-3 rounded-xl border border-border bg-paper text-ink placeholder-muted/50 text-sm font-body focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-all"/>
              <button type="submit" disabled={inviting}
                className="px-6 py-3 bg-ink text-paper font-display font-semibold text-sm rounded-xl hover:bg-ink/90 active:scale-95 transition-all disabled:opacity-50 whitespace-nowrap">
                {inviting ? "Sending…" : "Send invite"}
              </button>
            </form>
          </div>
          {profiles.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-10 text-center">
              <p className="text-sm text-muted">No users have logged time yet.</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_180px_80px_60px_32px] gap-3 px-6 py-2 border-b border-border bg-paper/50">
                <div className="text-xs font-mono text-muted uppercase tracking-widest">Email</div>
                <div className="text-xs font-mono text-muted uppercase tracking-widest">Display name</div>
                <div className="text-xs font-mono text-muted uppercase tracking-widest"></div>
                <div className="text-xs font-mono text-muted uppercase tracking-widest text-center">Admin</div>
              </div>
              {profiles.map((profile, i) => (
                <div key={profile.id} className={`grid grid-cols-[1fr_180px_80px_60px_32px] gap-3 items-center px-6 py-3 ${i < profiles.length - 1 ? "border-b border-border/50" : ""}`}>
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-muted truncate">{profile.email || profile.id}</p>
                    {profile.is_admin && <span className="text-[10px] font-mono text-accent">admin</span>}
                  </div>
                  <input type="text" value={editingName[profile.id] || ""}
                    onChange={e => setEditingName(n => ({ ...n, [profile.id]: e.target.value }))}
                    placeholder="Display name"
                    className="px-3 py-2 rounded-lg border border-border bg-paper text-ink text-sm font-body focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-all"/>
                  <button onClick={() => handleSaveName(profile.id)}
                    className="text-xs font-mono px-3 py-2 bg-ink text-paper rounded-lg hover:bg-ink/90 transition-all whitespace-nowrap">Save</button>
                  {/* Admin toggle */}
                  <div className="flex justify-center">
                    <button
                      onClick={() => handleToggleAdmin(profile.id, profile.is_admin)}
                      disabled={profile.email === SUPER_ADMIN}
                      title={profile.email === SUPER_ADMIN ? "Super admin — cannot be changed" : profile.is_admin ? "Remove admin access" : "Grant admin access"}
                      className={`w-10 h-6 rounded-full transition-all relative ${profile.is_admin ? "bg-accent" : "bg-border"} ${profile.email === "chris.shepherd@jympartnership.co.uk" ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:opacity-80"}`}>
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${profile.is_admin ? "left-5" : "left-1"}`}/>
                    </button>
                  </div>
                  {/* Delete user */}
                  {profile.email !== SUPER_ADMIN && (
                    <button onClick={() => setConfirmDeleteUser(profile)}
                      className="text-xs font-mono text-muted hover:text-accent transition-colors ml-1" title="Remove user">
                      ✕
                    </button>
                  )}
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

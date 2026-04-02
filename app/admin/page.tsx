"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

const ADMIN_EMAIL = "chris.shepherd@jympartnership.co.uk";

type Client = { id: string; name: string };
type Entry = { id: string; date: string; client: string; hours: number; user_id: string; user_email: string };
type UserSummary = { email: string; totalHours: number; byClient: Record<string, number> };

export default function AdminPage() {
  const supabase = createClient();
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newClient, setNewClient] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [reportView, setReportView] = useState<"by-user" | "by-client">("by-client");
  const [filterMonth, setFilterMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const fetchClients = useCallback(async () => {
    const { data } = await supabase.from("clients").select("*").order("name");
    setClients(data || []);
  }, [supabase]);

  const fetchEntries = useCallback(async () => {
    // Fetch all entries with user emails via a join on auth.users isn't directly possible client-side,
    // so we fetch entries and get user emails from profiles or metadata
    const { data } = await supabase
      .from("timesheet_entries")
      .select("*")
      .order("date", { ascending: false });

    // Fetch all users list — only works if we store emails in a profiles table
    // Instead, we'll use user_id and group by that, showing truncated IDs
    // For better UX we store email at insert time in the entry itself
    setEntries(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      if (session.user.email !== ADMIN_EMAIL) { router.push("/dashboard"); return; }
      fetchClients();
      fetchEntries();
    });
  }, [supabase, router, fetchClients, fetchEntries]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newClient.trim()) return;
    setSaving(true);
    await supabase.from("clients").insert({ name: newClient.trim() });
    setNewClient("");
    await fetchClients();
    setSaving(false);
    setSuccess("Client added!");
    setTimeout(() => setSuccess(""), 3000);
  }

  async function handleDelete(id: string) {
    await supabase.from("clients").delete().eq("id", id);
    fetchClients();
  }

  function exportReportCSV() {
    const filtered = filterMonth ? entries.filter(e => e.date.startsWith(filterMonth)) : entries;
    const rows = [["Date", "User", "Client", "Hours"]];
    filtered.forEach(e => rows.push([e.date, e.user_email || e.user_id, e.client, String(e.hours)]));
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `timesheet-report-${filterMonth || "all"}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // Filter entries by selected month
  const filteredEntries = filterMonth
    ? entries.filter(e => e.date.startsWith(filterMonth))
    : entries;

  // By-client summary
  const clientSummary = clients.map(c => {
    const clientEntries = filteredEntries.filter(e => e.client === c.name);
    const totalHours = clientEntries.reduce((s, e) => s + e.hours, 0);
    const userBreakdown: Record<string, number> = {};
    clientEntries.forEach(e => {
      const key = e.user_email || e.user_id;
      userBreakdown[key] = (userBreakdown[key] || 0) + e.hours;
    });
    return { name: c.name, totalHours, userBreakdown };
  }).filter(c => c.totalHours > 0);

  // By-user summary
  const userMap: Record<string, UserSummary> = {};
  filteredEntries.forEach(e => {
    const key = e.user_email || e.user_id;
    if (!userMap[key]) userMap[key] = { email: key, totalHours: 0, byClient: {} };
    userMap[key].totalHours += e.hours;
    userMap[key].byClient[e.client] = (userMap[key].byClient[e.client] || 0) + e.hours;
  });
  const userSummary = Object.values(userMap).sort((a, b) => b.totalHours - a.totalHours);

  const totalAllHours = filteredEntries.reduce((s, e) => s + e.hours, 0);
  const maxClientHours = Math.max(...clientSummary.map(c => c.totalHours), 1);

  // Generate month options (last 12 months)
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return d.toISOString().slice(0, 7);
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="font-mono text-sm text-muted animate-pulse">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-ink rounded flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="5" height="5" fill="#F5F2EB" />
                <rect x="9" y="2" width="5" height="5" fill="#E8572A" />
                <rect x="2" y="9" width="5" height="5" fill="#E8572A" />
                <rect x="9" y="9" width="5" height="5" fill="#F5F2EB" />
              </svg>
            </div>
            <span className="font-display font-bold text-base">Timesheet</span>
            <span className="text-xs font-mono text-muted bg-border/60 px-2 py-0.5 rounded-md">Admin</span>
          </div>
          <button onClick={() => router.push("/dashboard")} className="text-xs font-mono text-muted hover:text-ink transition-colors">
            ← Back to timesheet
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-10">

        {success && (
          <div className="animate-fade-in fixed top-6 right-6 z-50 bg-ink text-paper text-sm font-mono px-4 py-2.5 rounded-xl shadow-xl">
            ✓ {success}
          </div>
        )}

        {/* ── REPORTING SECTION ── */}
        <div className="animate-fade-up">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h1 className="font-display text-4xl font-bold text-ink">Time Report</h1>
              <p className="text-sm text-muted mt-1">All staff hours across clients.</p>
            </div>
            <button
              onClick={exportReportCSV}
              className="text-xs font-mono px-3 py-1.5 border border-border rounded-lg hover:border-ink hover:text-ink text-muted transition-all flex items-center gap-1.5"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5l3 3 3-3M1 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              Export CSV
            </button>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <select
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
              className="text-xs font-mono px-3 py-1.5 rounded-lg border border-border bg-paper text-ink focus:outline-none focus:border-ink transition-all"
            >
              <option value="">All time</option>
              {monthOptions.map(m => (
                <option key={m} value={m}>
                  {new Date(m + "-01").toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                </option>
              ))}
            </select>
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setReportView("by-client")}
                className={`text-xs font-mono px-3 py-1.5 transition-colors ${reportView === "by-client" ? "bg-ink text-paper" : "bg-paper text-muted hover:text-ink"}`}
              >
                By client
              </button>
              <button
                onClick={() => setReportView("by-user")}
                className={`text-xs font-mono px-3 py-1.5 transition-colors ${reportView === "by-user" ? "bg-ink text-paper" : "bg-paper text-muted hover:text-ink"}`}
              >
                By person
              </button>
            </div>
          </div>

          {/* Summary stat */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-card border border-border rounded-2xl p-5">
              <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Total hours</p>
              <p className="font-display text-3xl font-bold">{totalAllHours.toFixed(1)}</p>
            </div>
            <div className="bg-card border border-border rounded-2xl p-5">
              <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Active clients</p>
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
            /* By client view */
            <div className="space-y-4">
              {clientSummary.sort((a, b) => b.totalHours - a.totalHours).map(c => (
                <div key={c.name} className="bg-card border border-border rounded-2xl overflow-hidden">
                  {/* Client header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
                    <div className="flex items-center gap-3">
                      <span className="font-display font-bold text-sm">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-32 bg-border/40 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-accent rounded-full" style={{ width: `${(c.totalHours / maxClientHours) * 100}%` }} />
                      </div>
                      <span className="font-display font-bold text-sm w-14 text-right">{c.totalHours.toFixed(1)}h</span>
                    </div>
                  </div>
                  {/* User breakdown */}
                  {Object.entries(c.userBreakdown).sort((a, b) => b[1] - a[1]).map(([email, hours]) => (
                    <div key={email} className="flex items-center justify-between px-6 py-3 border-b border-border/30 last:border-b-0 bg-paper/30">
                      <span className="text-xs font-mono text-muted truncate max-w-xs">{email}</span>
                      <span className="text-xs font-mono text-ink font-medium">{hours.toFixed(1)}h</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            /* By user view */
            <div className="space-y-4">
              {userSummary.map(u => (
                <div key={u.email} className="bg-card border border-border rounded-2xl overflow-hidden">
                  {/* User header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
                    <span className="font-display font-bold text-sm truncate max-w-xs">{u.email}</span>
                    <span className="font-display font-bold text-sm">{u.totalHours.toFixed(1)}h</span>
                  </div>
                  {/* Client breakdown */}
                  {Object.entries(u.byClient).sort((a, b) => b[1] - a[1]).map(([client, hours]) => (
                    <div key={client} className="flex items-center justify-between px-6 py-3 border-b border-border/30 last:border-b-0 bg-paper/30">
                      <span className="text-xs font-mono text-muted">{client}</span>
                      <span className="text-xs font-mono text-ink font-medium">{hours.toFixed(1)}h</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── CLIENT MANAGEMENT ── */}
        <div className="pt-4 border-t border-border space-y-6">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink">Manage Clients</h2>
            <p className="text-sm text-muted mt-1">Add or remove clients from the timesheet dropdown.</p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-7">
            <h3 className="font-display text-xs font-bold uppercase tracking-widest text-muted mb-5">Add new client</h3>
            <form onSubmit={handleAdd} className="flex gap-3">
              <input
                type="text"
                required
                value={newClient}
                onChange={e => setNewClient(e.target.value)}
                placeholder="Client name"
                className="flex-1 px-4 py-3 rounded-xl border border-border bg-paper text-ink placeholder-muted/50 text-sm font-body focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-all"
              />
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-3 bg-ink text-paper font-display font-semibold text-sm rounded-xl hover:bg-ink/90 active:scale-95 transition-all disabled:opacity-50 whitespace-nowrap"
              >
                {saving ? "Adding…" : "Add client"}
              </button>
            </form>
          </div>

          <div>
            <h3 className="font-display text-xs font-bold uppercase tracking-widest text-muted mb-4">
              Current clients ({clients.length})
            </h3>
            {clients.length === 0 ? (
              <div className="bg-card border border-border rounded-2xl p-10 text-center">
                <p className="text-sm text-muted">No clients yet. Add your first one above.</p>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                {clients.map((client, i) => (
                  <div
                    key={client.id}
                    className={`flex items-center justify-between px-6 py-4 hover:bg-paper/60 transition-colors ${i < clients.length - 1 ? "border-b border-border/50" : ""}`}
                  >
                    <span className="font-body text-sm text-ink">{client.name}</span>
                    <button
                      onClick={() => handleDelete(client.id)}
                      className="text-xs font-mono text-muted hover:text-accent transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}

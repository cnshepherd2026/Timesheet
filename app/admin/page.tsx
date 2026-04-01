"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

const ADMIN_EMAIL = "chris.shepherd@jympartnership.co.uk";

type Client = { id: string; name: string };

export default function AdminPage() {
  const supabase = createClient();
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [newClient, setNewClient] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");

  const fetchClients = useCallback(async () => {
    const { data } = await supabase.from("clients").select("*").order("name");
    setClients(data || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push("/login"); return; }
      if (session.user.email !== ADMIN_EMAIL) { router.push("/dashboard"); return; }
      fetchClients();
    });
  }, [supabase, router, fetchClients]);

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
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
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

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        <div className="animate-fade-up">
          <h1 className="font-display text-4xl font-bold text-ink">Manage Clients</h1>
          <p className="text-sm text-muted mt-2">Add or remove clients from the timesheet dropdown.</p>
        </div>

        {success && (
          <div className="animate-fade-in fixed top-6 right-6 z-50 bg-ink text-paper text-sm font-mono px-4 py-2.5 rounded-xl shadow-xl">
            ✓ {success}
          </div>
        )}

        {/* Add client form */}
        <div className="bg-card border border-border rounded-2xl p-7 animate-fade-up delay-100">
          <h2 className="font-display text-sm font-bold uppercase tracking-widest text-muted mb-5">Add new client</h2>
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

        {/* Client list */}
        <div className="animate-fade-up delay-200">
          <h2 className="font-display text-sm font-bold uppercase tracking-widest text-muted mb-4">
            Current clients ({clients.length})
          </h2>
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
      </main>
    </div>
  );
}

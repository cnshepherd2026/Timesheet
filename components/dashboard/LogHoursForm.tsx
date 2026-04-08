"use client";
import { Client } from "@/lib/dateUtils";

type Form = { date: string; client: string; hours: string };

type Props = {
  form: Form;
  setForm: (f: Form) => void;
  clients: Client[];
  saving: boolean;
  editId: string | null;
  isAdmin: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
};

export default function LogHoursForm({ form, setForm, clients, saving, editId, isAdmin, onSubmit, onCancel }: Props) {
  return (
    <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
      <h2 className="font-display text-lg font-bold mb-6">{editId ? "Edit entry" : "Log hours"}</h2>
      {clients.length === 0 ? (
        <p className="text-sm text-muted font-body">
          No activities set up yet. {isAdmin ? "Go to Admin to add some." : "Ask your administrator to add activities."}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-mono text-muted uppercase tracking-widest mb-2">Date</label>
            <input type="date" required value={form.date}
              onChange={e => setForm({ ...form, date: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-border bg-paper text-ink text-sm font-body focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-all"/>
          </div>
          <div className="col-span-2 sm:col-span-1">
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
              <button type="button" onClick={onCancel}
                className="px-4 py-3 border border-border text-muted text-sm font-body rounded-xl hover:border-ink hover:text-ink transition-all">
                Cancel edit
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

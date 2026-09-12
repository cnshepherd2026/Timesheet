"use client";
import { Client, todayKey } from "@/lib/dateUtils";

type Form = { date: string; client: string; hours: string };

type Props = {
  form: Form;
  setForm: (f: Form) => void;
  clients: Client[];
  topActivities: string[];
  saving: boolean;
  editId: string | null;
  isAdmin: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
};

export default function LogHoursForm({ form, setForm, clients, topActivities, saving, editId, isAdmin, onSubmit, onCancel }: Props) {
  const isToday = form.date === todayKey();
  const dateHint = !form.date
    ? ""
    : isToday
      ? "Today"
      : new Date(form.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="bg-card border border-border rounded-2xl p-7 shadow-sm">
      <h2 className="font-display text-lg font-bold mb-6">{editId ? "Edit entry" : "Log hours"}</h2>
      {clients.length === 0 ? (
        <p className="text-sm text-muted font-body">
          No activities set up yet. {isAdmin ? "Go to Admin to add some." : "Ask your administrator to add activities."}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          {topActivities.length > 0 && (
            <div>
              <label className="block text-xs font-mono text-muted uppercase tracking-widest mb-2">Your most used</label>
              <div className="flex flex-wrap gap-2">
                {topActivities.map(name => (
                  <button key={name} type="button" onClick={() => setForm({ ...form, client: name })}
                    aria-pressed={form.client === name}
                    className={`text-xs font-mono px-3 py-2.5 rounded-lg border transition-all active:scale-95 ${
                      form.client === name
                        ? "bg-accent text-white border-accent"
                        : "border-border text-ink hover:border-accent hover:bg-accent/5"
                    }`}>
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-mono text-muted uppercase tracking-widest mb-2">Date</label>
              <input type="date" required value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-border bg-paper text-ink text-sm font-body focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-all"/>
              <p className={`text-[11px] font-mono mt-1.5 ${isToday ? "text-muted" : "text-accent"}`}>{dateHint}</p>
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
          </div>
        </form>
      )}
    </div>
  );
}

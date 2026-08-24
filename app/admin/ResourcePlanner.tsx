"use client";
import { useState, useEffect, useCallback, Fragment } from "react";
import { createClient } from "@/lib/supabase";

// ── Types ──
type PlannerProject = { id: string; name: string; kind: string; status: string; sort_order: number };
type PlannerEntry = { id: string; user_id: string; date: string; project_id: string | null; portion: string; hours: number; note: string | null };
type Planner = { id: string; display_name: string | null; is_planner: boolean };

type View = "board" | "projects" | "people";

// ── Date helpers ──
function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
const UK_BANK_HOLIDAYS = new Set([
  "2025-01-01","2025-04-18","2025-04-21","2025-05-05","2025-05-26","2025-08-25","2025-12-25","2025-12-26",
  "2026-01-01","2026-04-03","2026-04-06","2026-05-04","2026-05-25","2026-08-31","2026-12-25","2026-12-28",
  "2027-01-01","2027-03-26","2027-03-29","2027-05-03","2027-05-31","2027-08-30","2027-12-27","2027-12-28",
]);
function isBankHoliday(date: Date): boolean { return UK_BANK_HOLIDAYS.has(localDateKey(date)); }
function targetHours(date: Date): number {
  const day = date.getDay();
  if (day === 0 || day === 6) return 0;
  if (isBankHoliday(date)) return 0;
  if (day === 5) return 7;
  return 8;
}
function mondayOf(weekIndex: number): Date {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + weekIndex * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}
function weekDays(weekIndex: number): Date[] {
  const monday = mondayOf(weekIndex);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

const STATUS_LABEL: Record<string, string> = {
  live: "Live projects",
  to_plan_in: "Work to plan in",
  probable: "Probables",
  archived: "Archived",
};
const STATUS_ORDER = ["live", "to_plan_in", "probable", "archived"];

type Props = { mode?: "admin" | "self"; selfUserId?: string; selfName?: string | null };

export default function ResourcePlanner({ mode = "admin", selfUserId, selfName }: Props) {
  const supabase = createClient();
  const isSelf = mode === "self";

  const [view, setView] = useState<View>("board");
  const [weekStart, setWeekStart] = useState(0);   // week index of the first shown week
  const [weeksShown, setWeeksShown] = useState(1); // 1, 2 or 4
  const [projects, setProjects] = useState<PlannerProject[]>([]);
  const [entries, setEntries] = useState<PlannerEntry[]>([]);
  const [planners, setPlanners] = useState<Planner[]>([]);
  const [allProfiles, setAllProfiles] = useState<Planner[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<string | null>(selfUserId || null);
  const [toast, setToast] = useState("");

  const [editing, setEditing] = useState<{ userId: string; date: string } | null>(null);
  const [newProjectId, setNewProjectId] = useState("");
  const [newPortion, setNewPortion] = useState<"full" | "half" | "custom">("full");
  const [newHours, setNewHours] = useState<number>(8);

  const [projName, setProjName] = useState("");
  const [projStatus, setProjStatus] = useState("live");

  // All visible days across the shown weeks
  const weekBlocks = Array.from({ length: weeksShown }, (_, i) => weekDays(weekStart + i));
  const allDays = weekBlocks.flat();
  const rangeLabel = `${allDays[0].toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${allDays[allDays.length - 1].toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const loadStatic = useCallback(async () => {
    if (isSelf) {
      const [{ data: proj }, { data: userRes }] = await Promise.all([
        supabase.from("planner_projects").select("*").order("sort_order"),
        supabase.auth.getUser(),
      ]);
      setProjects(proj || []);
      setMe(selfUserId || userRes?.user?.id || null);
      setPlanners([{ id: selfUserId!, display_name: selfName || "You", is_planner: true }]);
      setLoading(false);
      return;
    }
    const [{ data: proj }, { data: profs }, { data: userRes }] = await Promise.all([
      supabase.from("planner_projects").select("*").order("sort_order"),
      supabase.from("profiles").select("id, display_name, is_planner"),
      supabase.auth.getUser(),
    ]);
    setProjects(proj || []);
    const profList = (profs || []) as Planner[];
    setAllProfiles(profList);
    setPlanners(profList.filter(p => p.is_planner).sort((a, b) => (a.display_name || "").localeCompare(b.display_name || "")));
    setMe(userRes?.user?.id || null);
    setLoading(false);
  }, [supabase, isSelf, selfUserId, selfName]);

  const loadWeek = useCallback(async () => {
    const from = localDateKey(allDays[0]);
    const to = localDateKey(allDays[allDays.length - 1]);
    let q = supabase.from("planner_entries").select("*").gte("date", from).lte("date", to);
    if (isSelf && selfUserId) q = q.eq("user_id", selfUserId);
    const { data } = await q;
    setEntries((data || []) as PlannerEntry[]);
  }, [supabase, weekStart, weeksShown, isSelf, selfUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadStatic(); }, [loadStatic]);
  useEffect(() => { loadWeek(); }, [loadWeek]);

  const projectById = (id: string | null) => projects.find(p => p.id === id) || null;
  const cellEntries = (userId: string, dateKey: string) => entries.filter(e => e.user_id === userId && e.date === dateKey);
  const projName2 = (id: string | null) => projectById(id)?.name || "—";
  const isAbsence = (id: string | null) => projectById(id)?.kind === "absence";
  function chipClasses(id: string | null) {
    if (isAbsence(id)) return "bg-border/50 text-muted";
    return "bg-accent/10 text-accent border border-accent/20";
  }

  function openCell(userId: string, date: Date) {
    setEditing({ userId, date: localDateKey(date) });
    setNewProjectId("");
    setNewPortion("full");
    setNewHours(targetHours(date) || 8);
  }

  async function addAssignment() {
    if (!editing || !newProjectId) return;
    const date = new Date(editing.date + "T12:00:00");
    let hours = newHours;
    if (newPortion === "full") hours = targetHours(date) || 8;
    else if (newPortion === "half") hours = (targetHours(date) || 8) / 2;
    await supabase.from("planner_entries").insert({
      user_id: editing.userId, date: editing.date, project_id: newProjectId,
      portion: newPortion, hours, created_by: me,
    });
    setNewProjectId("");
    await loadWeek();
    flash("Assigned");
  }

  async function removeEntry(id: string) {
    await supabase.from("planner_entries").delete().eq("id", id);
    await loadWeek();
  }

  async function addProject(e: React.FormEvent) {
    e.preventDefault();
    if (!projName.trim()) return;
    const maxOrder = projects.reduce((m, p) => Math.max(m, p.sort_order || 0), 0);
    await supabase.from("planner_projects").insert({ name: projName.trim(), status: projStatus, kind: "project", sort_order: maxOrder + 10 });
    setProjName("");
    await loadStatic();
    flash("Project added");
  }
  async function setProjectStatus(id: string, status: string) {
    await supabase.from("planner_projects").update({ status }).eq("id", id);
    await loadStatic();
  }
  async function removeProject(id: string) {
    await supabase.from("planner_projects").delete().eq("id", id);
    await loadStatic();
    await loadWeek();
  }
  async function togglePlanner(id: string, current: boolean) {
    await supabase.from("profiles").update({ is_planner: !current }).eq("id", id);
    await loadStatic();
    flash(!current ? "Added to planner" : "Removed from planner");
  }
  async function renameProject(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    await supabase.from("planner_projects").update({ name: trimmed }).eq("id", id);
    await loadStatic();
    flash("Renamed");
  }
  async function moveProject(list: PlannerProject[], index: number, dir: -1 | 1) {
    const t = index + dir;
    if (t < 0 || t >= list.length) return;
    const a = list[index], b = list[t];
    await Promise.all([
      supabase.from("planner_projects").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("planner_projects").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
    await loadStatic();
  }

  const absenceItems = projects.filter(p => p.kind === "absence").sort((a, b) => a.sort_order - b.sort_order);
  const statusGroups = STATUS_ORDER
    .map(s => ({ status: s, items: projects.filter(p => p.kind !== "absence" && p.status === s).sort((a, b) => a.sort_order - b.sort_order) }))
    .filter(g => g.items.length > 0);

  const todayKey = localDateKey(new Date());

  if (loading) return <div className="text-sm text-muted animate-pulse py-8">Loading planner…</div>;

  return (
    <section className={isSelf ? "space-y-4" : "animate-fade-up space-y-6"}>
      {toast && <div className="animate-fade-in fixed top-6 right-6 z-50 bg-accent text-white text-sm px-4 py-2.5 rounded-xl shadow-xl">✓ {toast}</div>}

      {!isSelf && (
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs text-accent tracking-wide mb-1">Arch Techs</p>
            <h1 className="font-display text-3xl font-medium text-ink">Resource planner</h1>
            <p className="text-sm text-muted mt-1">Plan the team&rsquo;s week, project by project.</p>
          </div>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(["board", "projects", "people"] as View[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`text-xs px-4 py-2 transition-colors ${view === v ? "bg-ink text-paper" : "bg-card text-muted hover:text-ink"}`}>
                {v === "board" ? "Board" : v === "projects" ? "Projects" : "Planners"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── BOARD ── */}
      {(isSelf || view === "board") && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-ink/5 border border-border rounded-lg">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-muted shrink-0"><rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M1 5h10M4 1v2M8 1v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                <span className="text-xs font-medium text-ink">{rangeLabel}</span>
              </div>
              {/* range toggle */}
              <div className="flex rounded-lg border border-border overflow-hidden">
                {[1, 2, 4].map(n => (
                  <button key={n} onClick={() => setWeeksShown(n)}
                    className={`text-xs px-3 py-1.5 transition-colors ${weeksShown === n ? "bg-ink text-paper" : "bg-card text-muted hover:text-ink"}`}>
                    {n === 1 ? "1 week" : n === 4 ? "4 weeks" : "2 weeks"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setWeekStart(o => o - weeksShown)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:border-ink text-muted hover:text-ink transition-all text-sm">‹</button>
              <button onClick={() => setWeekStart(0)} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:border-ink text-muted hover:text-ink transition-all">Today</button>
              <button onClick={() => setWeekStart(o => o + weeksShown)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:border-ink text-muted hover:text-ink transition-all text-sm">›</button>
            </div>
          </div>

          {planners.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-10 text-center">
              <p className="text-sm text-muted">No planners selected yet. Go to <button onClick={() => setView("people")} className="text-accent underline">Planners</button> to choose who appears here.</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: `${140 + planners.length * 200}px` }}>
                  <thead>
                    <tr className="border-b border-border bg-paper/50">
                      <th className="text-left px-4 py-3 w-[120px]"><span className="text-xs text-muted tracking-wide">Day</span></th>
                      {planners.map(p => {
                        const total = allDays.reduce((s, d) => s + cellEntries(p.id, localDateKey(d)).reduce((a, e) => a + Number(e.hours), 0), 0);
                        return (
                          <th key={p.id} className="text-left px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-accent/15 text-accent text-[11px] font-medium flex items-center justify-center">
                                {(p.display_name || "?").split(" ").map(n => n[0]).slice(0, 2).join("")}
                              </span>
                              <span className="text-sm font-medium text-ink">{p.display_name || "Unnamed"}</span>
                              <span className="text-[10px] text-muted ml-auto">{total}h</span>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {weekBlocks.map((block, bi) => (
                      <Fragment key={bi}>
                        {weeksShown > 1 && (
                          <tr className="bg-paper/40 border-b border-border">
                            <td colSpan={planners.length + 1} className="px-4 py-1.5">
                              <span className="text-[11px] text-muted">Week of {block[0].toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                            </td>
                          </tr>
                        )}
                        {block.map(d => {
                          const key = localDateKey(d);
                          const isToday = key === todayKey;
                          const bh = isBankHoliday(d);
                          return (
                            <tr key={key} className={`border-b border-border/50 align-top ${bh ? "bg-paper/40" : ""}`}>
                              <td className="px-4 py-3">
                                <div className={`text-sm font-medium ${isToday ? "text-accent" : "text-ink"}`}>{d.toLocaleDateString("en-GB", { weekday: "short" })} {d.getDate()}</div>
                                <div className="text-[11px] text-muted">{bh ? "Bank holiday" : d.toLocaleDateString("en-GB", { month: "short" })}</div>
                              </td>
                              {planners.map(p => {
                                const ce = cellEntries(p.id, key);
                                if (bh) return (
                                  <td key={p.id} className="px-3 py-2">
                                    <div className="text-[12px] text-muted bg-border/40 rounded-lg px-3 py-2">Bank holiday</div>
                                  </td>
                                );
                                return (
                                  <td key={p.id} className="px-3 py-2">
                                    <button onClick={() => openCell(p.id, d)} className="w-full text-left group">
                                      {ce.length === 0 ? (
                                        <div className="text-[12px] text-muted/60 border border-dashed border-border rounded-lg px-3 py-2 group-hover:border-accent group-hover:text-accent transition-colors">+ Add</div>
                                      ) : (
                                        <div className="space-y-1">
                                          {ce.map(e => (
                                            <div key={e.id} className={`rounded-lg px-2.5 py-1.5 text-[12px] flex items-center justify-between ${chipClasses(e.project_id)}`}>
                                              <span className="truncate">{projName2(e.project_id)}</span>
                                              <span className="text-[10px] opacity-70 ml-2 shrink-0">{e.portion === "full" ? "Full" : e.portion === "half" ? "Half" : `${e.hours}h`}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-xs text-muted">Tip: click any day to assign work, half days, leave or training.</p>
        </>
      )}

      {/* ── PROJECTS (admin only) ── */}
      {!isSelf && view === "projects" && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-2xl p-7">
            <h3 className="text-xs font-medium tracking-wide text-muted mb-5">Add planner project</h3>
            <form onSubmit={addProject} className="flex gap-3 flex-wrap">
              <input type="text" value={projName} onChange={e => setProjName(e.target.value)} placeholder="e.g. HMP Wetherby Anson Unit"
                className="flex-1 min-w-[240px] px-4 py-3 rounded-xl border border-border bg-paper text-ink placeholder-muted/50 text-sm focus:outline-none focus:border-ink transition-all"/>
              <select value={projStatus} onChange={e => setProjStatus(e.target.value)}
                className="px-3 py-3 rounded-xl border border-border bg-paper text-ink text-sm focus:outline-none focus:border-ink">
                <option value="live">Live</option>
                <option value="to_plan_in">Work to plan in</option>
                <option value="probable">Probable</option>
              </select>
              <button type="submit" className="px-6 py-3 bg-ink text-paper font-medium text-sm rounded-xl hover:bg-ink/90 transition-all">Add</button>
            </form>
            <p className="text-xs text-muted mt-3">This list is separate from the timesheet clients — keep it as project-specific as you like.</p>
          </div>

          {/* Leave & absence — kept in a separate list at the top */}
          {absenceItems.length > 0 && (
            <div>
              <h3 className="text-xs font-medium tracking-wide text-muted mb-3">Leave &amp; absence ({absenceItems.length})</h3>
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                {absenceItems.map((p, i) => (
                  <div key={p.id} className={`flex items-center gap-2 px-4 py-2.5 ${i < absenceItems.length - 1 ? "border-b border-border/50" : ""}`}>
                    <div className="flex flex-col mr-1 leading-none">
                      <button onClick={() => moveProject(absenceItems, i, -1)} disabled={i === 0} className="text-[10px] text-muted hover:text-ink disabled:opacity-30">▲</button>
                      <button onClick={() => moveProject(absenceItems, i, 1)} disabled={i === absenceItems.length - 1} className="text-[10px] text-muted hover:text-ink disabled:opacity-30">▼</button>
                    </div>
                    <input defaultValue={p.name} onBlur={e => { if (e.target.value.trim() !== p.name) renameProject(p.id, e.target.value); }}
                      className="flex-1 text-sm text-ink bg-transparent border border-transparent hover:border-border focus:border-ink rounded-lg px-2 py-1 focus:outline-none transition-colors"/>
                    <button onClick={() => removeProject(p.id)} className="text-xs text-muted hover:text-accent transition-colors">Remove</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projects grouped by status — rename inline, reorder with the arrows */}
          {statusGroups.map(g => (
            <div key={g.status}>
              <h3 className="text-xs font-medium tracking-wide text-muted mb-3">{STATUS_LABEL[g.status]} ({g.items.length})</h3>
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                {g.items.map((p, i) => (
                  <div key={p.id} className={`flex items-center gap-2 px-4 py-2.5 ${i < g.items.length - 1 ? "border-b border-border/50" : ""}`}>
                    <div className="flex flex-col mr-1 leading-none">
                      <button onClick={() => moveProject(g.items, i, -1)} disabled={i === 0} className="text-[10px] text-muted hover:text-ink disabled:opacity-30">▲</button>
                      <button onClick={() => moveProject(g.items, i, 1)} disabled={i === g.items.length - 1} className="text-[10px] text-muted hover:text-ink disabled:opacity-30">▼</button>
                    </div>
                    <input defaultValue={p.name} onBlur={e => { if (e.target.value.trim() !== p.name) renameProject(p.id, e.target.value); }}
                      className="flex-1 text-sm text-ink bg-transparent border border-transparent hover:border-border focus:border-ink rounded-lg px-2 py-1 focus:outline-none transition-colors"/>
                    <select value={p.status} onChange={e => setProjectStatus(p.id, e.target.value)}
                      className="text-[11px] px-2 py-1 rounded-lg border border-border bg-paper text-muted focus:outline-none focus:border-ink">
                      <option value="live">Live</option>
                      <option value="to_plan_in">To plan in</option>
                      <option value="probable">Probable</option>
                      <option value="archived">Archived</option>
                    </select>
                    <button onClick={() => removeProject(p.id)} className="text-xs text-muted hover:text-accent transition-colors">Remove</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── PLANNERS (admin only) ── */}
      {!isSelf && view === "people" && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="text-xs font-medium tracking-wide text-muted mb-2">Who appears in the planner?</h3>
            <p className="text-sm text-muted mb-5">Turn on the people whose time you forward-plan. Only they show as columns, and they can plan their own week from their dashboard.</p>
            <div className="divide-y divide-border/60">
              {allProfiles.sort((a, b) => (a.display_name || "").localeCompare(b.display_name || "")).map(p => (
                <div key={p.id} className="flex items-center justify-between py-3">
                  <span className="text-sm text-ink">{p.display_name || "(unnamed user)"}</span>
                  <button onClick={() => togglePlanner(p.id, p.is_planner)}
                    className={`w-10 h-6 rounded-full transition-all relative ${p.is_planner ? "bg-accent" : "bg-border"}`}>
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${p.is_planner ? "left-5" : "left-1"}`}/>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Cell editor modal ── */}
      {editing && (() => {
        const person = planners.find(p => p.id === editing.userId);
        const date = new Date(editing.date + "T12:00:00");
        const ce = cellEntries(editing.userId, editing.date);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-ink/20 backdrop-blur-sm" onClick={() => setEditing(null)}>
            <div className="bg-card border border-border rounded-2xl p-6 shadow-xl w-full max-w-md animate-fade-up" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-display text-lg font-medium text-ink">{person?.display_name || "Planner"}</h2>
                  <p className="text-xs text-muted">{date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
                </div>
                <button onClick={() => setEditing(null)} className="text-muted hover:text-ink text-sm">✕</button>
              </div>

              {ce.length > 0 && (
                <div className="space-y-1.5 mb-4">
                  {ce.map(e => (
                    <div key={e.id} className={`rounded-lg px-3 py-2 text-sm flex items-center justify-between ${chipClasses(e.project_id)}`}>
                      <span>{projName2(e.project_id)}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] opacity-70">{e.portion === "full" ? "Full day" : e.portion === "half" ? "Half day" : `${e.hours}h`}</span>
                        <button onClick={() => removeEntry(e.id)} className="text-[11px] opacity-70 hover:opacity-100">Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-border pt-4 space-y-3">
                <select value={newProjectId} onChange={e => setNewProjectId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-paper text-ink text-sm focus:outline-none focus:border-ink">
                  <option value="">Choose a project…</option>
                  {absenceItems.length > 0 && (
                    <optgroup label="Leave &amp; absence">
                      {absenceItems.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </optgroup>
                  )}
                  {statusGroups.filter(g => g.status !== "archived").map(g => (
                    <optgroup key={g.status} label={STATUS_LABEL[g.status]}>
                      {g.items.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </optgroup>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  {(["full", "half", "custom"] as const).map(pt => (
                    <button key={pt} onClick={() => setNewPortion(pt)}
                      className={`text-xs px-3 py-2 rounded-lg border transition-colors ${newPortion === pt ? "bg-ink text-paper border-ink" : "border-border text-muted hover:text-ink"}`}>
                      {pt === "full" ? "Full day" : pt === "half" ? "Half day" : "Hours"}
                    </button>
                  ))}
                  {newPortion === "custom" && (
                    <input type="number" min={0} max={24} step={0.5} value={newHours} onChange={e => setNewHours(Number(e.target.value))}
                      className="w-20 px-3 py-2 rounded-lg border border-border bg-paper text-ink text-sm focus:outline-none focus:border-ink"/>
                  )}
                </div>
                <button onClick={addAssignment} disabled={!newProjectId}
                  className="w-full py-3 bg-accent text-white font-medium text-sm rounded-xl hover:bg-accent/90 transition-all disabled:opacity-40">
                  Add to day
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
}

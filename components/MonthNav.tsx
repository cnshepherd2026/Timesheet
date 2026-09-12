"use client";
import { useEffect, useRef, useState } from "react";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Shared arrow button — used for month, year and week stepping so every screen matches. */
export function NavArrow({ dir, onClick, label }: { dir: "prev" | "next"; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg border border-border bg-card text-ink hover:border-ink hover:bg-paper active:scale-95 transition-all shrink-0">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d={dir === "prev" ? "M10 3L5 8l5 5" : "M6 3l5 5-5 5"}
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}

export type MonthValue = { year: number; month: number };

type Props = {
  value: MonthValue;
  onChange: (m: MonthValue) => void;
};

export default function MonthNav({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(value.year);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) setPickerYear(value.year); }, [open, value.year]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const now = new Date();
  const isCurrentMonth = value.year === now.getFullYear() && value.month === now.getMonth();
  const label = new Date(value.year, value.month, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  function step(delta: number) {
    const d = new Date(value.year, value.month + delta, 1);
    onChange({ year: d.getFullYear(), month: d.getMonth() });
  }

  return (
    <div ref={wrapRef} className="relative flex items-center gap-1.5">
      <NavArrow dir="prev" label="Previous month" onClick={() => step(-1)}/>

      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        title="Jump to another month"
        className="flex items-center gap-1.5 px-3 h-10 sm:h-9 rounded-lg border border-border bg-card text-sm font-mono text-ink hover:border-ink transition-all whitespace-nowrap">
        {label}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <NavArrow dir="next" label="Next month" onClick={() => step(1)}/>

      {!isCurrentMonth && (
        <button type="button" onClick={() => onChange({ year: now.getFullYear(), month: now.getMonth() })}
          className="text-xs font-mono px-3 h-10 sm:h-9 rounded-lg border border-border text-muted hover:text-ink hover:border-ink transition-all">
          Today
        </button>
      )}

      {open && (
        <div className="absolute top-full left-0 mt-2 z-30 w-64 bg-card border border-border rounded-xl shadow-xl p-3">
          <div className="flex items-center justify-between mb-2.5">
            <NavArrow dir="prev" label="Previous year" onClick={() => setPickerYear(y => y - 1)}/>
            <span className="text-sm font-mono font-bold text-ink">{pickerYear}</span>
            <NavArrow dir="next" label="Next year" onClick={() => setPickerYear(y => y + 1)}/>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MONTHS_SHORT.map((m, i) => {
              const selected = pickerYear === value.year && i === value.month;
              const isThisMonth = pickerYear === now.getFullYear() && i === now.getMonth();
              return (
                <button key={m} type="button"
                  onClick={() => { onChange({ year: pickerYear, month: i }); setOpen(false); }}
                  className={`text-xs font-mono py-2.5 rounded-lg border transition-all active:scale-95 ${
                    selected
                      ? "bg-ink text-paper border-ink"
                      : isThisMonth
                        ? "border-accent/40 text-accent hover:bg-accent/5"
                        : "border-border text-ink hover:border-ink hover:bg-paper"
                  }`}>
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

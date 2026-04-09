export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayKey(): string {
  return localDateKey(new Date());
}

// UK Bank Holidays (England & Wales)
const UK_BANK_HOLIDAYS = new Set([
  // 2025
  "2025-01-01", // New Year's Day
  "2025-04-18", // Good Friday
  "2025-04-21", // Easter Monday
  "2025-05-05", // Early May Bank Holiday
  "2025-05-26", // Spring Bank Holiday
  "2025-08-25", // Summer Bank Holiday
  "2025-12-25", // Christmas Day
  "2025-12-26", // Boxing Day
  // 2026
  "2026-01-01", // New Year's Day
  "2026-04-03", // Good Friday
  "2026-04-06", // Easter Monday
  "2026-05-04", // Early May Bank Holiday
  "2026-05-25", // Spring Bank Holiday
  "2026-08-31", // Summer Bank Holiday
  "2026-12-25", // Christmas Day
  "2026-12-28", // Boxing Day (substitute)
  // 2027
  "2027-01-01", // New Year's Day
  "2027-03-26", // Good Friday
  "2027-03-29", // Easter Monday
  "2027-05-03", // Early May Bank Holiday
  "2027-05-31", // Spring Bank Holiday
  "2027-08-30", // Summer Bank Holiday
  "2027-12-27", // Christmas Day (substitute)
  "2027-12-28", // Boxing Day (substitute)
]);

export function isBankHoliday(date: Date): boolean {
  return UK_BANK_HOLIDAYS.has(localDateKey(date));
}

export function targetHours(date: Date): number {
  const day = date.getDay();
  if (day === 0 || day === 6) return 0;
  if (isBankHoliday(date)) return 0;
  if (day === 5) return 7;
  return 8;
}

export function getCalendarMonth(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = (firstDay.getDay() + 6) % 7;
  const days: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) days.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

export type Entry = { id: string; date: string; client: string; hours: number; user_id: string };
export type Client = { id: string; name: string; sort_order: number };

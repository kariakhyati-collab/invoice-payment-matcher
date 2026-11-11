import type { IsoDate } from "./types";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAY_MS = 86_400_000;

function build(y: number, m: number, d: number): IsoDate | null {
  if (y < 100) y += 2000;
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  // Reject roll-overs such as 2026-02-31.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function monthIndex(name: string): number {
  return MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;
}

/**
 * Parse the date formats commonly found in accounting and bank exports into
 * an ISO date. Slash dates are read as US-style month/day/year.
 *
 *   2026-10-31 · 2026-10-31T09:00:00Z · 2026/10/31 · 10/31/2026 · 31-Oct-2026 · Oct 31, 2026
 */
export function parseDate(raw: string): IsoDate | null {
  const s = raw.trim();
  let m: RegExpExecArray | null;

  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s))) {
    return build(+m[1], +m[2], +m[3]);
  }
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s))) {
    return build(+m[3], +m[1], +m[2]);
  }
  if ((m = /^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s,]+(\d{4})$/.exec(s))) {
    const month = monthIndex(m[2]);
    return month ? build(+m[3], month, +m[1]) : null;
  }
  if ((m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s))) {
    const month = monthIndex(m[1]);
    return month ? build(+m[3], month, +m[2]) : null;
  }
  return null;
}

/** Whole days since the Unix epoch (UTC), so date maths ignores time zones. */
export function dayNumber(iso: IsoDate): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** `to − from` in whole days. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return dayNumber(to) - dayNumber(from);
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const dt = new Date((dayNumber(iso) + days) * DAY_MS);
  return dt.toISOString().slice(0, 10);
}

/** "2026-10-31" → "Oct 31, 2026". */
export function formatDate(iso: IsoDate): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${d}, ${y}`;
}

export function maxDate(dates: Iterable<IsoDate>): IsoDate | null {
  let best: IsoDate | null = null;
  for (const d of dates) if (best === null || d > best) best = d;
  return best;
}

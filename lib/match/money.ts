import type { Cents } from "./types";

const CURRENCY_MARKERS = /[$€£¥₹]|\b(?:USD|EUR|GBP|CAD|AUD|INR)\b/gi;

/**
 * Parse a human-formatted amount into integer cents without ever going
 * through a float. Accepts currency symbols / codes, thousands separators,
 * a leading or trailing minus and accounting-style parentheses.
 *
 *   "$1,234.5"  → 123450
 *   "(80.00)"   → -8000
 *   "USD 99"    → 9900
 *
 * Returns `null` when the input is not a number.
 */
export function parseAmount(raw: string): Cents | null {
  let s = raw.trim();
  if (!s) return null;

  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(CURRENCY_MARKERS, "").replace(/[\s ',]/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }

  const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[1] === "" && !m[2])) return null;

  const whole = m[1] === "" ? 0 : Number(m[1]);
  const frac = m[2] ?? "";
  let cents = whole * 100 + Number((frac + "00").slice(0, 2));
  // Round half-up on any third decimal.
  if (frac.length > 2 && Number(frac[2]) >= 5) cents += 1;
  if (!Number.isSafeInteger(cents)) return null;
  return negative && cents !== 0 ? -cents : cents;
}

/** Cents → plain decimal string (`123450` → `"1234.50"`), for CSV export. */
export function centsToDecimal(cents: Cents): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const formatters = new Map<string, Intl.NumberFormat>();

/** Cents → localised currency string (`123450` → `"$1,234.50"`). */
export function formatMoney(cents: Cents, currency = "USD", locale = "en-US"): string {
  const key = `${locale}|${currency}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: "currency", currency });
    formatters.set(key, f);
  }
  return f.format(cents / 100);
}

/** Compact form for tiles and chart labels (`2273000` → `"$22.7K"`). */
export function formatMoneyCompact(cents: Cents, currency = "USD", locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(cents / 100);
}

export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

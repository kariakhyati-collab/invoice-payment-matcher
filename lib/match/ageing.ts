import type { AgeBucket, Cents, InvoiceStatus } from "./types";

export const AGE_BUCKETS: { bucket: AgeBucket; label: string }[] = [
  { bucket: "current", label: "Current" },
  { bucket: "1-30", label: "1–30 days" },
  { bucket: "31-60", label: "31–60 days" },
  { bucket: "61-90", label: "61–90 days" },
  { bucket: "90+", label: "90+ days" },
];

export function ageBucket(daysPastDue: number): AgeBucket {
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "1-30";
  if (daysPastDue <= 60) return "31-60";
  if (daysPastDue <= 90) return "61-90";
  return "90+";
}

export interface AgeingRow {
  bucket: AgeBucket;
  label: string;
  amount: Cents;
  count: number;
}

/** Open balances grouped into the standard AR ageing buckets. */
export function ageingReport(statuses: readonly InvoiceStatus[]): AgeingRow[] {
  return AGE_BUCKETS.map(({ bucket, label }) => {
    const rows = statuses.filter((s) => s.open > 0 && s.bucket === bucket);
    return { bucket, label, amount: rows.reduce((t, s) => t + s.open, 0), count: rows.length };
  });
}

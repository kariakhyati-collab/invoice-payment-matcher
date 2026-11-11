import { toCsv } from "./csv";
import { centsToDecimal } from "./money";
import type { Invoice, Payment, ReconcileResult } from "./types";

export type Decision = "accepted" | "rejected";

const HEADER = [
  "type",
  "status",
  "rule",
  "confidence",
  "payment_date",
  "payer",
  "payment_amount",
  "reference",
  "invoice_no",
  "customer",
  "invoice_amount",
  "applied",
  "write_off",
  "shortfall",
  "unapplied",
  "flags",
  "note",
];

/**
 * Flatten a reconciliation into a CSV a bookkeeper can post from: one line
 * per invoice allocation, then one line per exception.
 */
export function resultToCsv(
  result: ReconcileResult,
  invoices: readonly Invoice[],
  payments: readonly Payment[],
  decisions: ReadonlyMap<string, Decision> = new Map(),
): string {
  const inv = new Map(invoices.map((i) => [i.id, i]));
  const pay = new Map(payments.map((p) => [p.id, p]));
  const rows: (string | number)[][] = [HEADER];

  for (const m of result.matches) {
    const p = pay.get(m.paymentId)!;
    m.allocations.forEach((a, idx) => {
      const i = inv.get(a.invoiceId)!;
      const first = idx === 0; // payment-level figures only once per match
      rows.push([
        "match",
        decisions.get(m.key) ?? "pending",
        m.rule,
        m.confidence.toFixed(2),
        p.date,
        p.payer,
        first ? centsToDecimal(p.amount) : "",
        p.reference,
        i.invoiceNo,
        i.customer,
        centsToDecimal(i.amount),
        centsToDecimal(a.applied),
        first ? centsToDecimal(m.writeOff) : "",
        first ? centsToDecimal(m.shortfall) : "",
        first ? centsToDecimal(m.unapplied) : "",
        m.flags.join(" "),
        first ? m.explanation : "",
      ]);
    });
  }

  for (const e of result.exceptions) {
    const p = e.paymentId ? pay.get(e.paymentId) : undefined;
    const i = e.invoiceId ? inv.get(e.invoiceId) : undefined;
    rows.push([
      "exception",
      e.kind,
      "",
      "",
      p?.date ?? "",
      p?.payer ?? "",
      p ? centsToDecimal(p.amount) : "",
      p?.reference ?? "",
      i?.invoiceNo ?? "",
      i?.customer ?? "",
      i ? centsToDecimal(i.amount) : "",
      "",
      "",
      "",
      "",
      "",
      e.explanation,
    ]);
  }
  return toCsv(rows);
}

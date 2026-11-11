import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ageingReport } from "../ageing";
import { guessMapping, INVOICE_FIELDS, PAYMENT_FIELDS, readInvoices, readPayments } from "../columns";
import { parseCsv } from "../csv";
import { reconcile } from "../engine";
import { resultToCsv } from "../export";
import { draftReminder } from "../reminder";
import type { InvoiceStatus } from "../types";
import { inv, pay } from "./helpers";

function loadSamples() {
  const read = (f: string) => parseCsv(readFileSync(join(__dirname, "../../../public/samples", f), "utf8"));
  const invTable = read("invoices.csv");
  const payTable = read("payments.csv");
  const im = guessMapping(invTable[0], INVOICE_FIELDS);
  const pm = guessMapping(payTable[0], PAYMENT_FIELDS);
  expect(im.complete && pm.complete).toBe(true);
  const { invoices, issues: ii } = readInvoices(invTable, im.mapping);
  const { payments, issues: pi } = readPayments(payTable, pm.mapping);
  expect([...ii, ...pi]).toEqual([]);
  return { invoices, payments };
}

describe("sample data", () => {
  const { invoices, payments } = loadSamples();
  const r = reconcile(invoices, payments);

  it("exercises every matching rule", () => {
    const rules = new Set(r.matches.map((m) => m.rule));
    expect([...rules].sort()).toEqual(["amount_customer", "exact", "multi_invoice", "overpayment", "partial"]);
  });

  it("exercises every flag and exception kind", () => {
    const flags = new Set(r.matches.flatMap((m) => m.flags));
    for (const f of ["early_payment", "bank_fee", "short_pay", "overpayment", "ambiguous"]) expect(flags).toContain(f);
    const kinds = new Set(r.exceptions.map((e) => e.kind));
    for (const k of ["unmatched_payment", "unapplied_cash", "duplicate_payment", "duplicate_invoice", "overdue_invoice"])
      expect(kinds).toContain(k);
  });

  it("has open balances in every ageing bucket", () => {
    expect(r.asOf).toBe("2026-10-30");
    for (const row of ageingReport(r.invoices)) expect(row.amount).toBeGreaterThan(0);
  });

  it("is stable (snapshot of the headline numbers)", () => {
    expect({
      invoices: invoices.length,
      payments: payments.length,
      matches: r.matches.length,
      exceptions: r.exceptions.length,
      byRule: r.matches.reduce<Record<string, number>>((t, m) => ({ ...t, [m.rule]: (t[m.rule] ?? 0) + 1 }), {}),
    }).toMatchInlineSnapshot(`
      {
        "byRule": {
          "amount_customer": 7,
          "exact": 12,
          "multi_invoice": 3,
          "overpayment": 2,
          "partial": 3,
        },
        "exceptions": 13,
        "invoices": 41,
        "matches": 27,
        "payments": 33,
      }
    `);
  });
});

const status = (daysPastDue: number, bucket: InvoiceStatus["bucket"], paid = 0): InvoiceStatus => {
  const invoice = inv("INV-1019", "Pinecrest Bakery LLC", 615, "2026-09-10", "2026-10-10");
  return { invoice, paid, writtenOff: 0, open: invoice.amount - paid, status: paid ? "partial" : "open", daysPastDue, bucket };
};

describe("draftReminder", () => {
  it("escalates tone with the ageing bucket", () => {
    const tones = (
      [
        [12, "1-30"],
        [45, "31-60"],
        [75, "61-90"],
        [120, "90+"],
      ] as const
    ).map(([d, b]) => draftReminder(status(d, b), { asOf: "2026-10-31" }));
    expect(tones.map((t) => t.tone)).toEqual(["friendly", "firm", "urgent", "final"]);
    expect(tones[0].subject).toBe("Friendly reminder: invoice INV-1019 ($615.00)");
    expect(tones[3].subject).toMatch(/^Final notice/);
    expect(tones[3].body).toMatch(/Nov 10, 2026/); // as-of + 10 days
  });

  it("includes the facts, the remaining balance and the sign-off", () => {
    const d = draftReminder(status(45, "31-60", 15000), {
      asOf: "2026-10-31",
      senderName: "Sam Lee",
      companyName: "Example Supply Co.",
    });
    expect(d.body).toMatch(/^Hi Pinecrest Bakery LLC team,/);
    expect(d.body).toContain("Outstanding:  $465.00");
    expect(d.body).toContain("$150.00 already received");
    expect(d.body.trim().endsWith("Sam Lee\nExample Supply Co.")).toBe(true);
  });

  it("refuses invoices that are not overdue", () => {
    expect(() => draftReminder(status(-3, "current"), { asOf: "2026-10-31" })).toThrow();
  });
});

describe("resultToCsv", () => {
  it("writes one row per allocation and per exception", () => {
    const a = inv("INV-1", "Acme", 100);
    const b = inv("INV-2", "Acme", 50);
    const payments = [pay("Acme", 150, "INV-1, INV-2"), pay("Stranger", 9.99)];
    const result = reconcile([a, b], payments);
    const rows = parseCsv(resultToCsv(result, [a, b], payments, new Map([[result.matches[0].key, "accepted"]])));
    expect(rows[0][0]).toBe("type");
    expect(rows.slice(1).map((r) => [r[0], r[1], r[8]])).toEqual([
      ["match", "accepted", "INV-1"],
      ["match", "accepted", "INV-2"],
      ["exception", "unmatched_payment", ""],
    ]);
    expect(rows[1][6]).toBe("150.00");
    expect(rows[2][6]).toBe(""); // payment amount not repeated
  });
});

import { describe, expect, it } from "vitest";
import { matchKey, reconcile } from "../engine";
import { inv, pay } from "./helpers";

describe("pass 1 · exact", () => {
  it("matches when the memo cites the invoice and the amount is equal", () => {
    const i = inv("INV-1001", "Northwind Botanicals Inc.", 4250);
    const p = pay("Some Other Name", 4250, "Payment for INV-1001");
    const { matches, exceptions } = reconcile([i], [p]);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ rule: "exact", confidence: 1, invoiceIds: [i.id], unapplied: 0 });
    expect(exceptions).toEqual([]);
  });

  it("is a little less sure when only the digits of the number appear", () => {
    const i = inv("INV-1039", "Tidewell Marine Supply", 980);
    const { matches } = reconcile([i], [pay("Tidewell", 980, "Invoice 1039")]);
    expect(matches[0]).toMatchObject({ rule: "exact", confidence: 0.95 });
  });

  it("settles several invoices cited in one memo", () => {
    const a = inv("INV-1", "Acme", 100);
    const b = inv("INV-2", "Acme", 250);
    const { matches } = reconcile([a, b], [pay("Acme", 350, "INV-1 INV-2")]);
    expect(matches[0]).toMatchObject({ rule: "exact", invoiceIds: [a.id, b.id] });
  });

  it("wins over a fuzzy match on a different invoice with the same amount", () => {
    const older = inv("INV-1", "Acme Corp", 500, "2026-08-01", "2026-08-31");
    const cited = inv("INV-2", "Acme Corp", 500);
    const { matches } = reconcile([older, cited], [pay("Acme Corp", 500, "INV-2")]);
    expect(matches[0].invoiceIds).toEqual([cited.id]);
  });
});

describe("pass 2 · amount + customer", () => {
  it("matches equal amounts when the payer resembles the customer", () => {
    const i = inv("INV-1", "Larkspur Coffee Roasters LLC", 865);
    const { matches } = reconcile([i], [pay("LARKSPUR COFFEE ROASTERS", 865, "ACH CREDIT 0829")]);
    expect(matches[0]).toMatchObject({ rule: "amount_customer", confidence: 0.9, flags: [] });
  });

  it("does not match an equal amount from an unrelated payer", () => {
    const i = inv("INV-1", "Larkspur Coffee Roasters LLC", 865);
    const { matches, exceptions } = reconcile([i], [pay("Harborview Tea Co", 865)]);
    expect(matches).toEqual([]);
    expect(exceptions.map((e) => e.kind)).toContain("unmatched_payment");
  });

  it("picks the oldest of several same-amount invoices and flags the ambiguity", () => {
    const old = inv("INV-1", "Saltmarsh Analytics Ltd", 3300, "2026-08-14", "2026-09-13");
    const newer = inv("INV-2", "Saltmarsh Analytics Ltd", 3300, "2026-09-22", "2026-10-22");
    const { matches } = reconcile([newer, old], [pay("SALTMARSH ANALYTICS LIMITED", 3300)]);
    expect(matches[0].invoiceIds).toEqual([old.id]);
    expect(matches[0].flags).toContain("ambiguous");
    expect(matches[0].confidence).toBeLessThan(0.9);
  });
});

describe("pass 3 · one payment, several invoices", () => {
  it("finds the subset of a customer's invoices that adds up", () => {
    const a = inv("INV-1", "Sunline Cycles LLC", 720, "2026-08-24", "2026-09-23");
    const b = inv("INV-2", "Sunline Cycles LLC", 1085, "2026-09-29", "2026-10-29");
    const c = inv("INV-3", "Sunline Cycles LLC", 455.5, "2026-10-10", "2026-11-09");
    const other = inv("INV-4", "Pinecrest Bakery LLC", 2260.5);
    const { matches } = reconcile([a, b, c, other], [pay("Sunline Cycles", 2260.5, "Thanks")]);
    expect(matches[0]).toMatchObject({ rule: "multi_invoice", invoiceIds: [a.id, b.id, c.id] });
    expect(matches[0].allocations.map((x) => x.applied)).toEqual([72000, 108500, 45550]);
  });

  it("only considers the paying customer's invoices", () => {
    const a = inv("INV-1", "Acme", 100);
    const b = inv("INV-2", "Globex", 200);
    const { matches } = reconcile([a, b], [pay("Acme", 300)]);
    expect(matches.filter((m) => m.rule === "multi_invoice")).toEqual([]);
  });

  it("lowers confidence when more than one combination fits", () => {
    const invoices = [100, 200, 300].map((d, k) => inv(`INV-${k}`, "Acme Widgets", d));
    const { matches } = reconcile(invoices, [pay("Acme Widgets", 300)]);
    // 300 alone is an amount match (pass 2) — so ask for 400 = 100+300 only.
    expect(matches[0].rule).toBe("amount_customer");
    const r2 = reconcile(
      [100, 200, 300, 400].map((d, k) => inv(`X-${k}`, "Acme Widgets", d)),
      [pay("Acme Widgets", 600)],
    );
    expect(r2.matches[0].rule).toBe("multi_invoice");
    expect(r2.matches[0].flags).toContain("ambiguous");
  });
});

describe("pass 4 · partial payments", () => {
  it("writes off a small difference as a bank fee", () => {
    const i = inv("INV-1015", "Larkspur Coffee Roasters LLC", 1240);
    const r = reconcile([i], [pay("Larkspur Coffee Roasters LLC", 1225, "INV-1015 less wire fee")]);
    expect(r.matches[0]).toMatchObject({ rule: "partial", flags: ["bank_fee"], writeOff: 1500, shortfall: 0 });
    expect(r.invoices[0]).toMatchObject({ status: "paid", open: 0, writtenOff: 1500, paid: 122500 });
  });

  it("treats the tolerance boundary as inclusive", () => {
    const at = reconcile([inv("A-1", "Acme", 100)], [pay("Acme", 65, "A-1")], { feeTolerance: 3500 });
    expect(at.matches[0].flags).toEqual(["bank_fee"]);
    const over = reconcile([inv("A-1", "Acme", 100)], [pay("Acme", 64.99, "A-1")], { feeTolerance: 3500 });
    expect(over.matches[0].flags).toEqual(["short_pay"]);
  });

  it("leaves the rest open on a short-pay", () => {
    const i = inv("INV-1003", "Cobalt Ridge Outfitters", 6400);
    const r = reconcile([i], [pay("Cobalt Ridge Outfitters", 4000, "Partial payment INV-1003")]);
    expect(r.matches[0]).toMatchObject({ rule: "partial", flags: ["short_pay"], shortfall: 240000 });
    expect(r.invoices[0]).toMatchObject({ status: "partial", open: 240000, paid: 400000 });
    expect(r.summary.openAR).toBe(240000);
  });

  it("matches an unreferenced short-pay to the closest invoice of that customer", () => {
    const big = inv("INV-1", "Quarry Lane Builders Inc.", 18750);
    const close = inv("INV-2", "Quarry Lane Builders Inc.", 9200);
    const r = reconcile([big, close], [pay("Quarry Lane Builders", 9000, "PROGRESS PMT")]);
    expect(r.matches[0]).toMatchObject({ rule: "partial", invoiceIds: [close.id], shortfall: 20000 });
    expect(r.matches[0].confidence).toBeLessThan(0.85);
  });

  it("won't guess a short-pay that covers under half the invoice", () => {
    const r = reconcile([inv("INV-1", "Acme", 1000)], [pay("Acme", 300)]);
    expect(r.matches).toEqual([]);
    expect(r.exceptions.map((e) => e.kind)).toContain("unapplied_cash");
  });
});

describe("pass 5 · overpayment", () => {
  it("applies the cited invoice and holds the excess as unapplied cash", () => {
    const i = inv("INV-1005", "Brightwater Logistics Co.", 12500);
    const r = reconcile([i], [pay("Brightwater Logistics", 12750, "INV-1005")]);
    expect(r.matches[0]).toMatchObject({ rule: "overpayment", unapplied: 25000, flags: ["overpayment"] });
    expect(r.summary.cashApplied).toBe(1250000);
    expect(r.summary.unappliedCash).toBe(25000);
  });

  it("uses the best-fitting invoices when the memo is silent", () => {
    const a = inv("INV-1", "Fernhill Design Studio", 2800, "2026-07-20", "2026-08-19");
    const b = inv("INV-2", "Fernhill Design Studio", 2400);
    const r = reconcile([a, b], [pay("Fernhill Design Studio", 2850, "ACH")]);
    expect(r.matches[0]).toMatchObject({ rule: "overpayment", invoiceIds: [a.id], unapplied: 5000 });
  });

  it("raises unapplied cash when a known customer has nothing open", () => {
    const r = reconcile([inv("INV-1", "Sunline Cycles LLC", 50, "2026-09-01")], [
      pay("Sunline Cycles", 50, "INV-1", "2026-09-10"),
      pay("Sunline Cycles LLC", 300, "Deposit", "2026-10-15"),
    ]);
    expect(r.exceptions).toEqual([expect.objectContaining({ kind: "unapplied_cash", amount: 30000 })]);
  });
});

describe("duplicates", () => {
  it("sets aside an identical bank line imported twice", () => {
    const i = inv("INV-1010", "Tidewell Marine Supply", 4475);
    const p1 = pay("Tidewell Marine Supply", 4475, "INV-1010", "2026-09-16");
    const p2 = { ...p1, id: "dup", row: p1.row + 1 };
    const r = reconcile([i], [p1, p2]);
    expect(r.matches).toHaveLength(1);
    expect(r.exceptions).toEqual([expect.objectContaining({ kind: "duplicate_payment", paymentId: "dup" })]);
  });

  it("flags a second payment for an invoice that is already settled", () => {
    const i = inv("INV-1011", "Juniper & Vale Interiors", 5600);
    const first = pay("Juniper & Vale Interiors", 5600, "INV-1011", "2026-09-21");
    const second = pay("JUNIPER AND VALE INTERIORS", 5600, "INV-1011", "2026-10-05");
    // Another open invoice that a naive matcher might dump the cash on.
    const other = inv("INV-1026", "Juniper & Vale Interiors", 2975);
    const r = reconcile([i, other], [second, first]);
    expect(r.matches.map((m) => m.paymentId)).toEqual([first.id]);
    const dbl = r.exceptions.find((e) => e.paymentId === second.id);
    expect(dbl?.kind).toBe("duplicate_payment");
    expect(dbl?.explanation).toMatch(/Sep 21, 2026/);
  });

  it("matches only the first of two invoices sharing a number", () => {
    const a = inv("INV-1038", "Saltmarsh Analytics Ltd", 1100);
    const b = { ...a, id: "dup-inv", row: a.row + 1 };
    const r = reconcile([a, b], [pay("Saltmarsh Analytics", 1100, "INV-1038")]);
    expect(r.matches[0].invoiceIds).toEqual([a.id]);
    expect(r.exceptions).toEqual([expect.objectContaining({ kind: "duplicate_invoice", invoiceId: "dup-inv" })]);
    expect(r.invoices).toHaveLength(1);
  });
});

describe("early payments", () => {
  it("still matches a payment dated before its invoice, but flags it", () => {
    const i = inv("INV-1029", "Cobalt Ridge Outfitters", 1725, "2026-10-02", "2026-11-01");
    const r = reconcile([i], [pay("Cobalt Ridge Outfitters", 1725, "Pro-forma INV-1029", "2026-09-30")]);
    expect(r.matches[0].rule).toBe("exact");
    expect(r.matches[0].flags).toContain("early_payment");
    expect(r.matches[0].confidence).toBe(0.9);
    expect(r.matches[0].explanation).toMatch(/2 days before/);
  });
});

describe("rejections", () => {
  it("never proposes a rejected pairing again and falls through to the next rule", () => {
    const old = inv("INV-1", "Acme Supply", 500, "2026-08-01", "2026-08-31");
    const newer = inv("INV-2", "Acme Supply", 500);
    const p = pay("Acme Supply", 500);
    const first = reconcile([old, newer], [p]);
    expect(first.matches[0].invoiceIds).toEqual([old.id]);

    const second = reconcile([old, newer], [p], { rejected: [matchKey(p.id, [old.id])] });
    expect(second.matches[0].invoiceIds).toEqual([newer.id]);

    const third = reconcile([old, newer], [p], {
      rejected: [matchKey(p.id, [old.id]), matchKey(p.id, [newer.id])],
    });
    expect(third.matches).toEqual([]);
  });
});

describe("ageing, overdue exceptions and summary", () => {
  it("ages open balances against the as-of date and raises overdue invoices", () => {
    const invoices = [
      inv("C", "A", 1, "2026-10-01", "2026-10-31"),
      inv("D1", "A", 2, "2026-09-01", "2026-10-30"),
      inv("D31", "A", 3, "2026-08-01", "2026-09-30"),
      inv("D61", "A", 4, "2026-07-01", "2026-08-31"),
      inv("D91", "A", 5, "2026-06-01", "2026-08-01"),
    ];
    const r = reconcile(invoices, [], { asOf: "2026-10-31" });
    expect(r.invoices.map((s) => s.bucket)).toEqual(["current", "1-30", "31-60", "61-90", "90+"]);
    expect(r.exceptions.filter((e) => e.kind === "overdue_invoice")).toHaveLength(4);
    expect(r.summary).toMatchObject({ openAR: 1500, overdueAR: 1400, matchedRate: 0 });
  });

  it("defaults the as-of date to the latest date in the data", () => {
    const r = reconcile([inv("A", "A", 1, "2026-09-01")], [pay("x", 1, "", "2026-10-20")]);
    expect(r.asOf).toBe("2026-10-20");
  });

  it("keeps every cent accounted for", () => {
    const invoices = [inv("INV-1", "Acme", 100), inv("INV-2", "Acme", 200)];
    const payments = [pay("Acme", 99.5, "INV-1"), pay("Acme", 250, "INV-2"), pay("Nobody", 12.34)];
    const r = reconcile(invoices, payments);
    const s = r.summary;
    expect(s.cashApplied + s.unappliedCash).toBe(s.cashReceived);
    const invoiced = invoices.reduce((t, i) => t + i.amount, 0);
    const paid = r.invoices.reduce((t, x) => t + x.paid, 0);
    expect(paid + s.writeOffs + s.openAR).toBe(invoiced);
    expect(paid).toBe(s.cashApplied);
  });

  it("copes with empty input", () => {
    const r = reconcile([], []);
    expect(r.matches).toEqual([]);
    expect(r.summary.matchedRate).toBe(0);
  });
});

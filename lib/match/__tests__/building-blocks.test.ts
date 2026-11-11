import { describe, expect, it } from "vitest";
import { guessMapping, INVOICE_FIELDS, PAYMENT_FIELDS, readInvoices, readPayments } from "../columns";
import { nameSimilarity, nameTokens } from "../names";
import { ReferenceIndex } from "../references";
import { bestFitSubset, findExactSubsets } from "../subset";
import { inv } from "./helpers";

describe("nameTokens / nameSimilarity", () => {
  it("drops legal suffixes and punctuation", () => {
    expect(nameTokens("Halcyon Dental Group, P.C.")).toEqual(["halcyon", "dental", "group"]);
    expect(nameTokens("Juniper & Vale Interiors")).toEqual(["juniper", "vale", "interiors"]);
  });

  it.each([
    ["LARKSPUR COFFEE ROASTERS", "Larkspur Coffee Roasters LLC", 1],
    ["SALTMARSH ANALYTICS LIMITED", "Saltmarsh Analytics Ltd", 1],
    ["JUNIPER AND VALE INTERIORS", "Juniper & Vale Interiors", 1],
    ["Fern Hill Studio", "Fernhill Studio", 1],
  ])("%s ≈ %s", (a, b, expected) => {
    expect(nameSimilarity(a, b)).toBe(expected);
  });

  it("scores partial names highly and unrelated names low", () => {
    expect(nameSimilarity("Tidewell Marine", "Tidewell Marine Supply")).toBeGreaterThanOrEqual(0.8);
    expect(nameSimilarity("Northwind Botanical", "Northwind Botanicals Inc.")).toBe(1);
    expect(nameSimilarity("Brightwatr Logistics", "Brightwater Logistics Co.")).toBe(1);
    expect(nameSimilarity("Supply", "Tidewell Marine Supply")).toBeLessThan(0.6);
    expect(nameSimilarity("K. MORRISON", "Cobalt Ridge Outfitters")).toBe(0);
    expect(nameSimilarity("", "Anything")).toBe(0);
  });
});

describe("ReferenceIndex", () => {
  const invoices = [inv("INV-1017", "A", 1), inv("INV-1039", "B", 1), inv("2041", "C", 1), inv("INV-1200", "D", 1)];
  const index = new ReferenceIndex(invoices);
  const nos = (memo: string) => index.find(memo).map((r) => `${r.invoice.invoiceNo}:${r.strength}`);

  it("finds invoice numbers written in different ways", () => {
    expect(nos("INV-1017")).toEqual(["INV-1017:full"]);
    expect(nos("inv1017 thanks")).toEqual(["INV-1017:full"]);
    expect(nos("Inv 1017")).toEqual(["INV-1017:full"]);
    expect(nos("Invoice 1039")).toEqual(["INV-1039:numeric"]);
    expect(nos("for 2041")).toEqual(["2041:full"]);
  });

  it("finds several references in one memo", () => {
    expect(nos("INV-1017 / INV-1039")).toEqual(["INV-1017:full", "INV-1039:full"]);
  });

  it("ignores unrelated numbers", () => {
    expect(nos("ACH CREDIT 0829")).toEqual([]);
    expect(nos("REF 12000")).toEqual([]);
  });
});

describe("subset search", () => {
  it("finds the smallest exact subset first", () => {
    expect(findExactSubsets([500, 300, 200, 800], 800, { minSize: 1 })).toEqual([[3], [0, 1]]);
    expect(findExactSubsets([500, 300, 200, 800], 800, { minSize: 2 })[0]).toEqual([0, 1]);
  });

  it("returns nothing when no subset adds up", () => {
    expect(findExactSubsets([500, 300], 900)).toEqual([]);
  });

  it("respects the node budget on large inputs", () => {
    const values = Array.from({ length: 40 }, (_, i) => 1000 + i * 7);
    const started = performance.now();
    findExactSubsets(values, 1, { maxNodes: 10_000 });
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("best fit maximises the applied amount under the cap", () => {
    expect(bestFitSubset([2800, 2400, 1000], 2850)).toEqual([0]);
    expect(bestFitSubset([2800, 2400, 1000], 3500)).toEqual([1, 2]);
    expect(bestFitSubset([5000], 100)).toEqual([]);
  });
});

describe("column mapping", () => {
  it("maps canonical invoice headers", () => {
    const { mapping, complete } = guessMapping(
      ["invoice_no", "customer", "invoice_date", "due_date", "amount"],
      INVOICE_FIELDS,
    );
    expect(complete).toBe(true);
    expect(mapping).toEqual({ invoiceNo: 0, customer: 1, invoiceDate: 2, dueDate: 3, amount: 4 });
  });

  it("maps typical bank-export headers", () => {
    const { mapping, complete } = guessMapping(["Posting Date", "Counterparty", "Credit", "Memo"], PAYMENT_FIELDS);
    expect(complete).toBe(true);
    expect(mapping).toEqual({ date: 0, payer: 1, amount: 2, reference: 3 });
  });

  it("keeps 'Invoice Date' and 'Invoice #' apart", () => {
    const { mapping } = guessMapping(["Invoice Date", "Client", "Invoice #", "Total", "Due"], INVOICE_FIELDS);
    expect(mapping).toEqual({ invoiceNo: 2, customer: 1, invoiceDate: 0, dueDate: 4, amount: 3 });
  });

  it("reports incomplete mappings", () => {
    expect(guessMapping(["foo", "bar"], PAYMENT_FIELDS).complete).toBe(false);
  });

  it("reads rows, defaults due dates to net 30 and reports bad rows", () => {
    const table = [
      ["invoice", "customer", "date", "amount"],
      ["INV-1", "Acme", "2026-09-01", "$1,000.00"],
      ["INV-2", "Acme", "not a date", "5"],
      ["INV-3", "Acme", "2026-09-01", "0"],
    ];
    const { invoices, issues } = readInvoices(table, {
      invoiceNo: 0,
      customer: 1,
      invoiceDate: 2,
      dueDate: null,
      amount: 3,
    });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ invoiceNo: "INV-1", amount: 100000, dueDate: "2026-10-01", row: 2 });
    expect(issues.map((i) => i.row)).toEqual([3, 4]);
  });

  it("keeps only credits from a bank statement", () => {
    const { payments, issues } = readPayments(
      [
        ["date", "payer", "amount", "memo"],
        ["10/01/2026", "Acme", "(25.00)", "fee"],
        ["10/02/2026", "Acme", "$500", "INV-1"],
      ],
      { date: 0, payer: 1, amount: 2, reference: 3 },
    );
    expect(payments).toEqual([
      { id: "pay-3", row: 3, date: "2026-10-02", payer: "Acme", amount: 50000, reference: "INV-1" },
    ]);
    expect(issues).toHaveLength(1);
  });
});

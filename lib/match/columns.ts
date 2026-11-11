import { addDays, parseDate } from "./dates";
import { parseAmount } from "./money";
import type { Invoice, Payment } from "./types";

export type InvoiceField = "invoiceNo" | "customer" | "invoiceDate" | "dueDate" | "amount";
export type PaymentField = "date" | "payer" | "amount" | "reference";

export interface FieldSpec<F extends string> {
  key: F;
  label: string;
  required: boolean;
  hint?: string;
  synonyms: string[];
}

export const INVOICE_FIELDS: FieldSpec<InvoiceField>[] = [
  {
    key: "invoiceNo",
    label: "Invoice number",
    required: true,
    synonyms: ["invoice no", "invoice number", "invoice", "inv no", "invoice id", "document number", "doc no", "number"],
  },
  {
    key: "customer",
    label: "Customer",
    required: true,
    synonyms: ["customer", "customer name", "client", "bill to", "account name", "company", "debtor", "name"],
  },
  {
    key: "invoiceDate",
    label: "Invoice date",
    required: true,
    synonyms: ["invoice date", "date", "issue date", "issued", "document date", "txn date"],
  },
  {
    key: "dueDate",
    label: "Due date",
    required: false,
    hint: "Defaults to invoice date + 30 days",
    synonyms: ["due date", "due", "payment due", "due on", "due by"],
  },
  {
    key: "amount",
    label: "Amount",
    required: true,
    synonyms: ["amount", "total", "invoice amount", "amount due", "balance", "open amount", "balance due", "invoice total"],
  },
];

export const PAYMENT_FIELDS: FieldSpec<PaymentField>[] = [
  {
    key: "date",
    label: "Payment date",
    required: true,
    synonyms: ["date", "payment date", "posting date", "value date", "transaction date", "booking date", "received"],
  },
  {
    key: "payer",
    label: "Payer",
    required: true,
    synonyms: ["payer", "counterparty", "from", "remitter", "sender", "originator", "customer", "name", "payer name"],
  },
  {
    key: "amount",
    label: "Amount",
    required: true,
    synonyms: ["amount", "credit", "deposit", "amount received", "paid in", "value", "credit amount"],
  },
  {
    key: "reference",
    label: "Reference / memo",
    required: false,
    synonyms: ["reference", "memo", "description", "details", "narrative", "remittance", "remittance info", "ref", "note", "notes"],
  },
];

/** Field → column index (or `null` when unmapped). */
export type ColumnMapping<F extends string> = Record<F, number | null>;

function headerTokens(h: string): string[] {
  return h.toLowerCase().replace(/#/g, " no ").split(/[^a-z0-9]+/).filter(Boolean);
}

function score(header: string, synonym: string): number {
  const h = headerTokens(header);
  const s = headerTokens(synonym);
  if (h.join(" ") === s.join(" ")) return 3;
  if (s.every((t) => h.includes(t))) return 2;
  return 0;
}

/**
 * Guess which column holds which field. Exact synonym matches win over
 * partial ones, and each column is used at most once.
 */
export function guessMapping<F extends string>(
  headers: string[],
  fields: FieldSpec<F>[],
): { mapping: ColumnMapping<F>; complete: boolean } {
  const scored: { field: F; col: number; score: number; order: number }[] = [];
  fields.forEach((f, fi) => {
    headers.forEach((h, col) => {
      // Earlier synonyms are slightly preferred to break ties.
      const best = Math.max(0, ...f.synonyms.map((s, si) => score(h, s) && score(h, s) - si * 0.001));
      if (best > 0) scored.push({ field: f.key, col, score: best, order: fi });
    });
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order || a.col - b.col);

  const mapping = Object.fromEntries(fields.map((f) => [f.key, null])) as ColumnMapping<F>;
  const usedCols = new Set<number>();
  for (const s of scored) {
    if (mapping[s.field] !== null || usedCols.has(s.col)) continue;
    mapping[s.field] = s.col;
    usedCols.add(s.col);
  }
  const complete = fields.every((f) => !f.required || mapping[f.key] !== null);
  return { mapping, complete };
}

export interface RowIssue {
  row: number;
  message: string;
}

const cell = (r: string[], idx: number | null) => (idx === null ? "" : (r[idx] ?? "").trim());

/** Turn a parsed invoice table (header row first) into typed invoices. */
export function readInvoices(
  table: string[][],
  mapping: ColumnMapping<InvoiceField>,
): { invoices: Invoice[]; issues: RowIssue[] } {
  const invoices: Invoice[] = [];
  const issues: RowIssue[] = [];
  table.slice(1).forEach((r, i) => {
    const row = i + 2;
    const invoiceNo = cell(r, mapping.invoiceNo);
    const customer = cell(r, mapping.customer);
    const invoiceDate = parseDate(cell(r, mapping.invoiceDate));
    const amount = parseAmount(cell(r, mapping.amount));
    const dueRaw = cell(r, mapping.dueDate);

    if (!invoiceNo) return issues.push({ row, message: "Missing invoice number" });
    if (!customer) return issues.push({ row, message: `${invoiceNo}: missing customer` });
    if (!invoiceDate) return issues.push({ row, message: `${invoiceNo}: unreadable invoice date` });
    if (amount === null || amount <= 0) return issues.push({ row, message: `${invoiceNo}: amount must be a positive number` });

    const dueDate = dueRaw ? parseDate(dueRaw) : addDays(invoiceDate, 30);
    if (!dueDate) return issues.push({ row, message: `${invoiceNo}: unreadable due date` });

    invoices.push({ id: `inv-${row}`, row, invoiceNo, customer, invoiceDate, dueDate, amount });
  });
  return { invoices, issues };
}

/** Turn a parsed bank / remittance table into typed payments (credits only). */
export function readPayments(
  table: string[][],
  mapping: ColumnMapping<PaymentField>,
): { payments: Payment[]; issues: RowIssue[] } {
  const payments: Payment[] = [];
  const issues: RowIssue[] = [];
  table.slice(1).forEach((r, i) => {
    const row = i + 2;
    const date = parseDate(cell(r, mapping.date));
    const payer = cell(r, mapping.payer);
    const amount = parseAmount(cell(r, mapping.amount));
    const reference = cell(r, mapping.reference);

    if (!date) return issues.push({ row, message: "Unreadable payment date" });
    if (amount === null) return issues.push({ row, message: "Unreadable amount" });
    if (amount <= 0) return issues.push({ row, message: "Skipped: not a credit (amount ≤ 0)" });

    payments.push({ id: `pay-${row}`, row, date, payer, amount, reference });
  });
  return { payments, issues };
}

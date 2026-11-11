import type { Invoice } from "./types";

/** "INV-1042" → "INV1042". */
export function normalizeRef(ref: string): string {
  return ref.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export interface InvoiceReference {
  invoice: Invoice;
  /** `full` = the whole invoice number appears; `numeric` = only its digits do. */
  strength: "full" | "numeric";
}

/**
 * Finds invoice numbers mentioned in free-text bank memos.
 *
 * Memos are messy ("Inv 1017", "INV1016", "Invoice 1039 thanks"), so each
 * memo is tokenised and adjacent tokens are also tried glued together. A bare
 * number only counts when it identifies exactly one invoice.
 */
export class ReferenceIndex {
  private byFull = new Map<string, Invoice>();
  private byDigits = new Map<string, Invoice[]>();

  constructor(invoices: Invoice[]) {
    for (const inv of invoices) {
      const full = normalizeRef(inv.invoiceNo);
      if (!full) continue;
      if (!this.byFull.has(full)) this.byFull.set(full, inv);
      const digits = /(\d{3,})$/.exec(full)?.[1];
      if (digits && digits !== full) {
        this.byDigits.set(digits, [...(this.byDigits.get(digits) ?? []), inv]);
      }
    }
  }

  find(memo: string): InvoiceReference[] {
    const tokens = memo.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
    const found = new Map<string, InvoiceReference>();

    const candidates = [...tokens];
    for (let i = 0; i + 1 < tokens.length; i++) candidates.push(tokens[i] + tokens[i + 1]);

    for (const c of candidates) {
      const inv = this.byFull.get(c);
      if (inv) found.set(inv.id, { invoice: inv, strength: "full" });
    }
    for (const t of tokens) {
      const hits = this.byDigits.get(t);
      if (hits?.length === 1 && !found.has(hits[0].id)) {
        found.set(hits[0].id, { invoice: hits[0], strength: "numeric" });
      }
    }
    return [...found.values()];
  }
}

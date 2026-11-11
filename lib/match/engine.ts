import { ageBucket } from "./ageing";
import { daysBetween, formatDate, maxDate } from "./dates";
import { formatMoney, sumCents } from "./money";
import { nameKey, nameSimilarity } from "./names";
import { normalizeRef, ReferenceIndex, type InvoiceReference } from "./references";
import { bestFitSubset, findExactSubsets } from "./subset";
import type {
  Cents,
  Invoice,
  InvoiceStatus,
  Match,
  MatchFlag,
  MatchRule,
  Payment,
  ReconcileOptions,
  ReconcileResult,
  ReconException,
} from "./types";

const DEFAULTS = {
  feeTolerance: 3500,
  nameThreshold: 0.6,
  maxSubsetCandidates: 16,
  maxSearchNodes: 50_000,
} as const;

/** Unpaid share an unreferenced short-pay or overpayment must cover to be proposed. */
const MIN_COVERAGE = 0.5;

export function matchKey(paymentId: string, invoiceIds: readonly string[]): string {
  return `${paymentId}>${[...invoiceIds].sort().join("+")}`;
}

const clamp = (x: number) => Math.round(Math.min(1, Math.max(0.05, x)) * 100) / 100;
const money = (c: Cents) => formatMoney(c);
const list = (invs: Invoice[]) => invs.map((i) => i.invoiceNo).join(", ");

interface Customer {
  key: string;
  name: string;
  similarity: number;
}

/**
 * Reconcile open invoices against received payments.
 *
 * Runs a sequence of passes from most to least certain. Each pass only sees
 * payments and invoice balances the earlier passes left unmatched, so a
 * high-confidence explanation always wins over a speculative one.
 *
 *  0. duplicates     – repeated invoice numbers / identical bank lines are set aside
 *  1. exact          – memo cites the invoice number(s) and the amount is equal
 *     double payment – memo cites only invoices that are already settled
 *  2. amount_customer – same amount, payer fuzzy-matches the customer
 *  3. multi_invoice  – amount equals a subset of that customer's open invoices
 *  4. partial        – amount is below an invoice: bank fee (within tolerance) or short-pay
 *  5. overpayment    – amount exceeds the invoice(s); the excess is unapplied cash
 *  6. exceptions     – whatever is left over
 */
export function reconcile(
  invoicesIn: readonly Invoice[],
  paymentsIn: readonly Payment[],
  options: ReconcileOptions = {},
): ReconcileResult {
  const opts = { ...DEFAULTS, ...options };
  const rejected = new Set(options.rejected ?? []);
  const asOf =
    options.asOf ??
    maxDate([...paymentsIn.map((p) => p.date), ...invoicesIn.map((i) => i.invoiceDate)]) ??
    "1970-01-01";

  const exceptions: ReconException[] = [];
  const matches: Match[] = [];

  // ── Pass 0: duplicates ─────────────────────────────────────────────────
  const invoices: Invoice[] = [];
  const firstInvoice = new Map<string, Invoice>();
  for (const inv of invoicesIn) {
    const k = normalizeRef(inv.invoiceNo);
    const prior = firstInvoice.get(k);
    if (prior) {
      exceptions.push({
        id: `dup-${inv.id}`,
        kind: "duplicate_invoice",
        invoiceId: inv.id,
        amount: inv.amount,
        explanation: `${inv.invoiceNo} appears more than once (rows ${prior.row} and ${inv.row}). Only the first is matched.`,
      });
    } else {
      firstInvoice.set(k, inv);
      invoices.push(inv);
    }
  }

  const payments: Payment[] = [];
  const firstPayment = new Map<string, Payment>();
  for (const p of paymentsIn) {
    const k = [p.date, p.amount, nameKey(p.payer), normalizeRef(p.reference)].join("|");
    const prior = firstPayment.get(k);
    if (prior) {
      exceptions.push({
        id: `dup-${p.id}`,
        kind: "duplicate_payment",
        paymentId: p.id,
        amount: p.amount,
        explanation: `Identical to the bank line on row ${prior.row} (same date, payer, amount and memo). Likely imported twice.`,
      });
    } else {
      firstPayment.set(k, p);
      payments.push(p);
    }
  }
  payments.sort((a, b) => a.date.localeCompare(b.date) || a.row - b.row);

  // ── Shared state ───────────────────────────────────────────────────────
  const open = new Map<string, Cents>(invoices.map((i) => [i.id, i.amount]));
  const writtenOff = new Map<string, Cents>();
  const settledBy = new Map<string, Payment>();
  const done = new Set<string>(); // payment ids that are matched or excepted
  const refs = new ReferenceIndex(invoices);

  const byCustomer = new Map<string, Invoice[]>();
  const customerName = new Map<string, string>();
  for (const inv of invoices) {
    const k = nameKey(inv.customer);
    byCustomer.set(k, [...(byCustomer.get(k) ?? []), inv]);
    if (!customerName.has(k)) customerName.set(k, inv.customer);
  }
  for (const group of byCustomer.values()) {
    group.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.invoiceNo.localeCompare(b.invoiceNo));
  }

  const customerCache = new Map<string, Customer | null>();
  const resolveCustomer = (payer: string): Customer | null => {
    if (customerCache.has(payer)) return customerCache.get(payer)!;
    let best: Customer | null = null;
    for (const [key, name] of customerName) {
      const similarity = nameSimilarity(payer, name);
      if (similarity >= opts.nameThreshold && (!best || similarity > best.similarity)) {
        best = { key, name, similarity };
      }
    }
    customerCache.set(payer, best);
    return best;
  };

  const openInvoicesOf = (key: string) =>
    (byCustomer.get(key) ?? []).filter((i) => (open.get(i.id) ?? 0) > 0);

  const refsOf = new Map<string, InvoiceReference[]>(payments.map((p) => [p.id, refs.find(p.reference)]));

  const record = (
    p: Payment,
    rule: MatchRule,
    confidence: number,
    targets: Invoice[],
    explanation: string,
    extra: { flags?: MatchFlag[]; writeOff?: Cents; shortfall?: Cents } = {},
  ) => {
    const flags = [...(extra.flags ?? [])];
    let remaining = p.amount;
    const allocations = targets.map((inv) => {
      const applied = Math.min(open.get(inv.id) ?? 0, remaining);
      remaining -= applied;
      return { invoiceId: inv.id, applied };
    });
    const writeOff = extra.writeOff ?? 0;
    const unapplied = remaining;

    for (const a of allocations) {
      let bal = (open.get(a.invoiceId) ?? 0) - a.applied;
      if (writeOff > 0 && targets.length === 1) {
        writtenOff.set(a.invoiceId, writeOff);
        bal -= writeOff;
      }
      open.set(a.invoiceId, bal);
      if (bal === 0 && !settledBy.has(a.invoiceId)) settledBy.set(a.invoiceId, p);
    }

    let text = explanation;
    const earliestInvoice = targets.reduce((d, i) => (i.invoiceDate < d ? i.invoiceDate : d), "9999-12-31");
    if (p.date < earliestInvoice) {
      flags.push("early_payment");
      confidence -= 0.1;
      text += ` Paid ${daysBetween(p.date, earliestInvoice)} days before the invoice was issued — check it is not a deposit for something else.`;
    }
    if (unapplied > 0 && !flags.includes("overpayment")) flags.push("overpayment");

    matches.push({
      key: matchKey(p.id, targets.map((t) => t.id)),
      rule,
      confidence: clamp(confidence),
      paymentId: p.id,
      invoiceIds: targets.map((t) => t.id),
      allocations,
      writeOff,
      shortfall: extra.shortfall ?? 0,
      unapplied,
      flags,
      explanation: text,
    });
    done.add(p.id);
  };

  const isRejected = (p: Payment, targets: Invoice[]) => rejected.has(matchKey(p.id, targets.map((t) => t.id)));
  const pending = () => payments.filter((p) => !done.has(p.id));

  // ── Pass 1: exact (invoice number in memo + amount equal) ──────────────
  for (const p of pending()) {
    const cited = refsOf.get(p.id)!.filter((r) => (open.get(r.invoice.id) ?? 0) > 0);
    if (cited.length === 0) continue;
    const targets = cited.map((r) => r.invoice);
    if (sumCents(targets.map((i) => open.get(i.id)!)) !== p.amount || isRejected(p, targets)) continue;
    const strong = cited.every((r) => r.strength === "full");
    const confidence = (strong ? 1 : 0.95) - (targets.length > 1 ? 0.02 : 0);
    record(
      p,
      "exact",
      confidence,
      targets,
      `Memo cites ${list(targets)} and the amount matches exactly.`,
    );
  }

  // Memo cites only invoices that are already fully settled → double payment.
  for (const p of pending()) {
    const cited = refsOf.get(p.id)!;
    if (cited.length === 0 || cited.some((r) => (open.get(r.invoice.id) ?? 0) > 0)) continue;
    const first = settledBy.get(cited[0].invoice.id);
    exceptions.push({
      id: `dbl-${p.id}`,
      kind: "duplicate_payment",
      paymentId: p.id,
      amount: p.amount,
      explanation: `Memo cites ${list(cited.map((r) => r.invoice))}, already settled${
        first ? ` by the ${formatDate(first.date)} payment` : ""
      }. Possible double payment — refund or hold as credit.`,
    });
    done.add(p.id);
  }

  // ── Pass 2: amount + fuzzy customer name ───────────────────────────────
  for (const p of pending()) {
    const candidates = invoices
      .filter((i) => open.get(i.id) === i.amount && i.amount === p.amount)
      .map((i) => ({ inv: i, sim: nameSimilarity(p.payer, i.customer) }))
      .filter((c) => c.sim >= opts.nameThreshold && !isRejected(p, [c.inv]))
      .sort((a, b) => b.sim - a.sim || a.inv.dueDate.localeCompare(b.inv.dueDate));
    if (candidates.length === 0) continue;
    const best = candidates[0];
    const siblings = candidates.filter((c) => nameKey(c.inv.customer) === nameKey(best.inv.customer)).length;
    const flags: MatchFlag[] = siblings > 1 ? ["ambiguous"] : [];
    record(
      p,
      "amount_customer",
      0.55 + 0.35 * best.sim - (siblings > 1 ? 0.15 : 0),
      [best.inv],
      (best.sim === 1
        ? `Amount matches and payer “${p.payer}” is customer “${best.inv.customer}”.`
        : `Amount matches and payer “${p.payer}” resembles “${best.inv.customer}” (${Math.round(best.sim * 100)}% name similarity).`) +
        (siblings > 1 ? ` ${siblings} open invoices share this amount; the oldest was chosen.` : ""),
      { flags },
    );
  }

  // ── Pass 3: one payment, several invoices (subset-sum) ─────────────────
  for (const p of pending()) {
    const customer = resolveCustomer(p.payer);
    if (!customer) continue;
    const pool = openInvoicesOf(customer.key).slice(0, opts.maxSubsetCandidates);
    if (pool.length < 2) continue;
    const solutions = findExactSubsets(
      pool.map((i) => open.get(i.id)!),
      p.amount,
      { minSize: 2, maxNodes: opts.maxSearchNodes },
    )
      .map((idx) => idx.map((k) => pool[k]))
      .filter((targets) => !isRejected(p, targets));
    if (solutions.length === 0) continue;
    const targets = solutions[0];
    const cited = refsOf.get(p.id)!.some((r) => targets.includes(r.invoice));
    const confidence = 0.6 + 0.25 * customer.similarity + (cited ? 0.1 : 0) - (solutions.length > 1 ? 0.15 : 0);
    record(
      p,
      "multi_invoice",
      Math.min(confidence, 0.97),
      targets,
      `Covers ${targets.length} open invoices for ${customer.name} (${list(targets)}) to the cent.` +
        (solutions.length > 1 ? " Other invoice combinations also add up — check the remittance advice." : ""),
      { flags: solutions.length > 1 ? ["ambiguous"] : [] },
    );
  }

  // Invoices explicitly cited in the memo that are still open.
  const citedOpen = (p: Payment) =>
    refsOf.get(p.id)!.map((r) => r.invoice).filter((i) => (open.get(i.id) ?? 0) > 0);

  // ── Pass 4: partial payment / short-pay ────────────────────────────────
  for (const p of pending()) {
    const cited = citedOpen(p);
    const customer = resolveCustomer(p.payer);
    let target: Invoice | undefined;
    let base: number;
    if (cited.length > 0) {
      target = cited.find((i) => open.get(i.id)! > p.amount);
      base = 0.85;
    } else {
      if (!customer) continue;
      target = openInvoicesOf(customer.key)
        .filter((i) => open.get(i.id)! > p.amount && p.amount >= MIN_COVERAGE * open.get(i.id)!)
        .sort((a, b) => open.get(a.id)! - open.get(b.id)!)[0];
      base = 0.45 + 0.3 * customer.similarity;
    }
    if (!target || isRejected(p, [target])) continue;

    const diff = open.get(target.id)! - p.amount;
    const why = cited.length > 0 ? `Memo cites ${target.invoiceNo}` : `Closest open invoice for ${customer!.name} is ${target.invoiceNo}`;
    if (diff <= opts.feeTolerance) {
      record(
        p,
        "partial",
        base + 0.07,
        [target],
        `${why}; ${money(diff)} short, within the ${money(opts.feeTolerance)} bank-fee tolerance. Difference written off.`,
        { flags: ["bank_fee"], writeOff: diff },
      );
    } else {
      record(
        p,
        "partial",
        base,
        [target],
        `${why}; paid ${money(p.amount)} of ${money(open.get(target.id)!)}. ${money(diff)} remains open — chase or raise a credit note.`,
        { flags: ["short_pay"], shortfall: diff },
      );
    }
  }

  // ── Pass 5: overpayment / unapplied cash ───────────────────────────────
  for (const p of pending()) {
    const cited = citedOpen(p);
    const customer = resolveCustomer(p.payer);
    let targets: Invoice[] = [];
    let confidence: number;
    let why: string;

    if (cited.length > 0 && sumCents(cited.map((i) => open.get(i.id)!)) < p.amount) {
      targets = cited;
      confidence = 0.85;
      why = `Memo cites ${list(targets)}`;
    } else if (customer && cited.length === 0) {
      const pool = openInvoicesOf(customer.key).slice(0, opts.maxSubsetCandidates);
      const pick = bestFitSubset(pool.map((i) => open.get(i.id)!), p.amount, { maxNodes: opts.maxSearchNodes });
      targets = pick.map((k) => pool[k]);
      confidence = 0.45 + 0.3 * customer.similarity;
      why = `Best fit across ${customer.name}'s open invoices is ${list(targets)}`;
      if (sumCents(targets.map((i) => open.get(i.id)!)) < MIN_COVERAGE * p.amount) targets = [];
    } else {
      continue;
    }
    if (targets.length === 0 || isRejected(p, targets)) continue;

    const applied = sumCents(targets.map((i) => open.get(i.id)!));
    record(
      p,
      "overpayment",
      confidence,
      targets,
      `${why}; received ${money(p.amount - applied)} more than owed. Excess held as unapplied cash.`,
      { flags: ["overpayment"] },
    );
  }

  // ── Pass 6: leftovers become exceptions ────────────────────────────────
  for (const p of pending()) {
    const customer = resolveCustomer(p.payer);
    exceptions.push(
      customer
        ? {
            id: `ua-${p.id}`,
            kind: "unapplied_cash",
            paymentId: p.id,
            amount: p.amount,
            explanation: `From ${customer.name}, but no open invoice explains this amount. Hold as customer credit or ask for remittance advice.`,
          }
        : {
            id: `um-${p.id}`,
            kind: "unmatched_payment",
            paymentId: p.id,
            amount: p.amount,
            explanation: `No invoice reference, amount or customer name matched “${p.payer || "unknown payer"}”.`,
          },
    );
    done.add(p.id);
  }

  const statuses: InvoiceStatus[] = invoices.map((invoice) => {
    const bal = open.get(invoice.id)!;
    const off = writtenOff.get(invoice.id) ?? 0;
    const paid = invoice.amount - bal - off;
    const daysPastDue = daysBetween(invoice.dueDate, asOf);
    return {
      invoice,
      paid,
      writtenOff: off,
      open: bal,
      status: bal === 0 ? "paid" : paid > 0 ? "partial" : "open",
      daysPastDue,
      bucket: ageBucket(daysPastDue),
    };
  });

  for (const s of statuses) {
    if (s.status !== "open" || s.daysPastDue <= 0) continue;
    exceptions.push({
      id: `od-${s.invoice.id}`,
      kind: "overdue_invoice",
      invoiceId: s.invoice.id,
      amount: s.open,
      explanation: `${s.invoice.invoiceNo} for ${s.invoice.customer} is ${s.daysPastDue} days past due with no payment received.`,
    });
  }

  const cashReceived = sumCents(paymentsIn.map((p) => p.amount));
  const cashApplied = sumCents(matches.flatMap((m) => m.allocations.map((a) => a.applied)));
  const matchedPaymentCount = matches.length;

  return {
    asOf,
    matches,
    exceptions,
    invoices: statuses,
    summary: {
      paymentCount: paymentsIn.length,
      matchedPaymentCount,
      matchedRate: paymentsIn.length ? matchedPaymentCount / paymentsIn.length : 0,
      cashReceived,
      cashApplied,
      unappliedCash: cashReceived - cashApplied,
      writeOffs: sumCents(writtenOff.values()),
      openAR: sumCents(statuses.map((s) => s.open)),
      overdueAR: sumCents(statuses.filter((s) => s.daysPastDue > 0).map((s) => s.open)),
      exceptionCount: exceptions.length,
    },
  };
}

/** Convenience lookup used by the UI and exporters. */
export function indexResult(result: ReconcileResult, invoices: readonly Invoice[], payments: readonly Payment[]) {
  return {
    invoiceById: new Map(invoices.map((i) => [i.id, i])),
    paymentById: new Map(payments.map((p) => [p.id, p])),
    statusById: new Map(result.invoices.map((s) => [s.invoice.id, s])),
  };
}

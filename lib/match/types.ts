/** All money is stored as integer cents to avoid floating-point drift. */
export type Cents = number;

/** Calendar date as an ISO string, `YYYY-MM-DD`. */
export type IsoDate = string;

export interface Invoice {
  id: string;
  /** 1-based line number in the source file (header = line 1). */
  row: number;
  invoiceNo: string;
  customer: string;
  invoiceDate: IsoDate;
  dueDate: IsoDate;
  amount: Cents;
}

export interface Payment {
  id: string;
  row: number;
  date: IsoDate;
  payer: string;
  amount: Cents;
  reference: string;
}

export type MatchRule =
  | "exact"
  | "amount_customer"
  | "multi_invoice"
  | "partial"
  | "overpayment";

export type MatchFlag =
  | "early_payment"
  | "bank_fee"
  | "short_pay"
  | "overpayment"
  | "ambiguous";

export interface Allocation {
  invoiceId: string;
  applied: Cents;
}

export interface Match {
  /** Stable identity: payment id + invoice ids. Used for accept / reject. */
  key: string;
  rule: MatchRule;
  /** 0–1. */
  confidence: number;
  paymentId: string;
  invoiceIds: string[];
  allocations: Allocation[];
  /** Small difference written off (e.g. a bank fee deducted in transit). */
  writeOff: Cents;
  /** Amount still owed on the invoice after a short payment. */
  shortfall: Cents;
  /** Cash received but not applied to any invoice. */
  unapplied: Cents;
  flags: MatchFlag[];
  explanation: string;
}

export type ExceptionKind =
  | "unmatched_payment"
  | "unapplied_cash"
  | "duplicate_payment"
  | "duplicate_invoice"
  | "overdue_invoice";

export interface ReconException {
  id: string;
  kind: ExceptionKind;
  paymentId?: string;
  invoiceId?: string;
  amount: Cents;
  explanation: string;
}

export type AgeBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

export interface InvoiceStatus {
  invoice: Invoice;
  paid: Cents;
  writtenOff: Cents;
  open: Cents;
  status: "paid" | "partial" | "open";
  /** Days past due as of the reconciliation date (negative = not yet due). */
  daysPastDue: number;
  bucket: AgeBucket;
}

export interface ReconcileOptions {
  /** Short-pays up to this amount are treated as bank fees and written off. Default $35. */
  feeTolerance?: Cents;
  /** Ageing reference date. Defaults to the latest date found in the data. */
  asOf?: IsoDate;
  /** Match keys the user rejected; the engine will not propose them again. */
  rejected?: Iterable<string>;
  /** Minimum payer ↔ customer similarity (0–1) to consider them the same party. Default 0.6. */
  nameThreshold?: number;
  /** Max invoices per customer considered by the subset search. Default 16. */
  maxSubsetCandidates?: number;
  /** Node budget for the subset search, per payment. Default 50 000. */
  maxSearchNodes?: number;
}

export interface Summary {
  paymentCount: number;
  matchedPaymentCount: number;
  /** 0–1 share of payments that were matched. */
  matchedRate: number;
  cashReceived: Cents;
  cashApplied: Cents;
  unappliedCash: Cents;
  writeOffs: Cents;
  openAR: Cents;
  overdueAR: Cents;
  exceptionCount: number;
}

export interface ReconcileResult {
  asOf: IsoDate;
  matches: Match[];
  exceptions: ReconException[];
  invoices: InvoiceStatus[];
  summary: Summary;
}

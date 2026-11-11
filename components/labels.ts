import type { AgeBucket, ExceptionKind, MatchFlag, MatchRule } from "@/lib/match";
import type { Tone } from "./ui";

export const RULE_META: Record<MatchRule, { label: string; tone: Tone; pass: number; description: string }> = {
  exact: { label: "Exact reference", tone: "emerald", pass: 1, description: "Invoice number in memo, amount equal" },
  amount_customer: { label: "Amount + name", tone: "sky", pass: 2, description: "Same amount, payer resembles customer" },
  multi_invoice: { label: "Multi-invoice", tone: "violet", pass: 3, description: "One payment settles several invoices" },
  partial: { label: "Partial", tone: "amber", pass: 4, description: "Short-pay or bank fee deducted" },
  overpayment: { label: "Overpayment", tone: "orange", pass: 5, description: "Excess held as unapplied cash" },
};

export const FLAG_META: Record<MatchFlag, { label: string; tone: Tone }> = {
  early_payment: { label: "Paid before invoice", tone: "sky" },
  bank_fee: { label: "Bank fee", tone: "stone" },
  short_pay: { label: "Short-pay", tone: "amber" },
  overpayment: { label: "Unapplied cash", tone: "orange" },
  ambiguous: { label: "Ambiguous", tone: "rose" },
};

export const EXCEPTION_META: Record<ExceptionKind, { label: string; tone: Tone; order: number }> = {
  duplicate_payment: { label: "Duplicate payment", tone: "rose", order: 0 },
  duplicate_invoice: { label: "Duplicate invoice", tone: "rose", order: 1 },
  unmatched_payment: { label: "Unmatched payment", tone: "amber", order: 2 },
  unapplied_cash: { label: "Unapplied cash", tone: "orange", order: 3 },
  overdue_invoice: { label: "Overdue, unpaid", tone: "stone", order: 4 },
};

export const BUCKET_META: Record<AgeBucket, { tone: Tone; fill: string }> = {
  current: { tone: "emerald", fill: "fill-emerald-500" },
  "1-30": { tone: "amber", fill: "fill-amber-400" },
  "31-60": { tone: "orange", fill: "fill-orange-500" },
  "61-90": { tone: "rose", fill: "fill-rose-500" },
  "90+": { tone: "rose", fill: "fill-rose-700 dark:fill-rose-600" },
};

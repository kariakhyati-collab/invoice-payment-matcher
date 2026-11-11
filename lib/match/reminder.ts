import { addDays, formatDate } from "./dates";
import { formatMoney } from "./money";
import type { AgeBucket, InvoiceStatus, IsoDate } from "./types";

export type ReminderTone = "friendly" | "firm" | "urgent" | "final";

export const TONE_BY_BUCKET: Record<Exclude<AgeBucket, "current">, ReminderTone> = {
  "1-30": "friendly",
  "31-60": "firm",
  "61-90": "urgent",
  "90+": "final",
};

export interface ReminderOptions {
  /** Who signs the email. */
  senderName?: string;
  /** Your company, shown in the sign-off. */
  companyName?: string;
  /** "Today" for deadline maths; defaults to the reconciliation date. */
  asOf: IsoDate;
}

export interface ReminderDraft {
  tone: ReminderTone;
  subject: string;
  body: string;
}

/**
 * Draft a payment reminder whose tone escalates with how overdue the invoice
 * is — friendly → firm → urgent → final notice. Pure templating, no AI.
 */
export function draftReminder(status: InvoiceStatus, opts: ReminderOptions): ReminderDraft {
  if (status.bucket === "current" || status.open <= 0) {
    throw new Error(`${status.invoice.invoiceNo} is not overdue`);
  }
  const { invoice, open, paid, daysPastDue } = status;
  const tone = TONE_BY_BUCKET[status.bucket];
  const sender = opts.senderName?.trim() || "Accounts Receivable";
  const company = opts.companyName?.trim();
  const amount = formatMoney(open);
  const due = formatDate(invoice.dueDate);
  const days = `${daysPastDue} day${daysPastDue === 1 ? "" : "s"}`;
  const deadline = (n: number) => formatDate(addDays(opts.asOf, n));
  const partialNote =
    paid > 0
      ? `\n\nThank you for the ${formatMoney(paid)} already received — the figure above is the remaining balance.`
      : "";

  const facts = [
    `  Invoice:      ${invoice.invoiceNo}`,
    `  Issued:       ${formatDate(invoice.invoiceDate)}`,
    `  Due:          ${due}`,
    `  Outstanding:  ${amount}`,
  ].join("\n");

  const copy: Record<ReminderTone, { subject: string; opening: string; ask: string }> = {
    friendly: {
      subject: `Friendly reminder: invoice ${invoice.invoiceNo} (${amount})`,
      opening: `I hope all is well. Just a quick note that the invoice below was due on ${due} and is now ${days} past due.`,
      ask: `If payment is already on its way, please ignore this — and thank you! Otherwise, could you let me know when we can expect it?`,
    },
    firm: {
      subject: `Second reminder: invoice ${invoice.invoiceNo} is ${days} overdue`,
      opening: `We haven't yet received payment for the invoice below, which is now ${days} past its due date of ${due}.`,
      ask: `Please arrange payment by ${deadline(7)}, or reply to let me know if there is a problem with the invoice that we can help resolve.`,
    },
    urgent: {
      subject: `Urgent: invoice ${invoice.invoiceNo} is ${days} past due`,
      opening: `Despite earlier reminders, the invoice below remains unpaid ${days} after its due date of ${due}.`,
      ask: `Please settle the balance or contact me by ${deadline(5)} to agree a payment plan. If we can't resolve this, we may need to place the account on hold.`,
    },
    final: {
      subject: `Final notice: invoice ${invoice.invoiceNo} — ${amount} outstanding`,
      opening: `This is a final notice regarding the invoice below, now ${days} past due.`,
      ask: `Unless we receive payment or hear from you by ${deadline(10)}, we will pause further orders on the account and may refer the balance for collection. I would much rather resolve this directly — please get in touch.`,
    },
  };

  const c = copy[tone];
  const body = [
    `Hi ${invoice.customer} team,`,
    "",
    c.opening,
    "",
    facts + partialNote,
    "",
    c.ask,
    "",
    tone === "friendly" ? "Many thanks," : "Kind regards,",
    sender,
    ...(company ? [company] : []),
  ].join("\n");

  return { tone, subject: c.subject, body };
}

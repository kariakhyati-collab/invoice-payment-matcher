"use client";

import { useEffect, useRef, useState } from "react";
import { draftReminder, type InvoiceStatus } from "@/lib/match";
import { CheckIcon, XIcon } from "../icons";
import { Badge, Button, type Tone } from "../ui";

const TONE: Record<string, { label: string; tone: Tone }> = {
  friendly: { label: "Friendly", tone: "emerald" },
  firm: { label: "Firm", tone: "amber" },
  urgent: { label: "Urgent", tone: "orange" },
  final: { label: "Final notice", tone: "rose" },
};

const input =
  "h-9 w-full rounded-lg border border-stone-300 bg-white px-2.5 text-sm shadow-sm dark:border-stone-700 dark:bg-stone-900";

export function ReminderDialog({
  status,
  asOf,
  onClose,
}: {
  status: InvoiceStatus;
  asOf: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [sender, setSender] = useState("Accounts Receivable");
  const [company, setCompany] = useState("");
  const [copied, setCopied] = useState(false);
  const draft = draftReminder(status, { asOf, senderName: sender, companyName: company });

  // Open as a modal on mount: native <dialog> gives focus trapping and Esc-to-close for free.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const copy = async () => {
    await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="reminder-title"
      className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-xl border border-stone-200 bg-white p-0 text-stone-900 shadow-2xl backdrop:bg-stone-950/40 backdrop:backdrop-blur-sm dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100"
    >
      <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-5 py-4 dark:border-stone-800">
        <div className="min-w-0">
          <h2 id="reminder-title" className="font-semibold tracking-tight">
            Reminder for {status.invoice.invoiceNo}
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
            {status.invoice.customer} · {status.daysPastDue} days overdue
            <Badge tone={TONE[draft.tone].tone}>{TONE[draft.tone].label} tone</Badge>
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800"
          aria-label="Close"
        >
          <XIcon className="size-5" />
        </button>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-stone-500 dark:text-stone-400">Signed by</span>
            <input className={input} value={sender} onChange={(e) => setSender(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-stone-500 dark:text-stone-400">Your company</span>
            <input className={input} value={company} placeholder="Optional" onChange={(e) => setCompany(e.target.value)} />
          </label>
        </div>
        <div>
          <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">Subject</p>
          <p className="mt-1 text-sm font-medium">{draft.subject}</p>
        </div>
        <pre className="max-h-[45vh] overflow-auto rounded-lg border border-stone-200 bg-stone-50 p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap dark:border-stone-800 dark:bg-stone-950">
          {draft.body}
        </pre>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-stone-200 px-5 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-stone-800">
        <p className="text-xs text-stone-500 dark:text-stone-400">Generated from a template — nothing is sent.</p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={copy}>
            {copied ? (
              <>
                <CheckIcon className="size-4" /> Copied
              </>
            ) : (
              "Copy to clipboard"
            )}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

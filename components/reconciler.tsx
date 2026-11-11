"use client";

import { useMemo, useState } from "react";
import {
  ageingReport,
  formatDate,
  guessMapping,
  INVOICE_FIELDS,
  parseCsv,
  PAYMENT_FIELDS,
  readInvoices,
  readPayments,
  reconcile,
  resultToCsv,
  type ColumnMapping,
  type Decision,
  type FieldSpec,
  type InvoiceField,
  type PaymentField,
} from "@/lib/match";
import { DownloadIcon } from "./icons";
import { MappingStep } from "./mapping-step";
import { AgeingChart } from "./results/ageing-chart";
import { ExceptionsQueue } from "./results/exceptions-queue";
import { HIGH_CONFIDENCE, MatchesTable } from "./results/matches-table";
import { OverdueTable } from "./results/overdue-table";
import { ReminderDialog } from "./results/reminder-dialog";
import { SummaryTiles } from "./results/summary-tiles";
import { Button } from "./ui";
import { UploadStep, type LoadedFile } from "./upload-step";

interface Source<F extends string> {
  name: string;
  table: string[][];
  mapping: ColumnMapping<F>;
  /** True when every required column was recognised from the headers. */
  autoMapped: boolean;
}

function toSource<F extends string>(file: LoadedFile, fields: FieldSpec<F>[]): Source<F> {
  const table = parseCsv(file.text);
  const { mapping, complete } = guessMapping(table[0] ?? [], fields);
  return { name: file.name, table, mapping, autoMapped: complete };
}

type Step = "upload" | "mapping" | "results";

export function Reconciler() {
  const [step, setStep] = useState<Step>("upload");
  const [invoiceFile, setInvoiceFile] = useState<LoadedFile>();
  const [paymentFile, setPaymentFile] = useState<LoadedFile>();
  const [invoiceSrc, setInvoiceSrc] = useState<Source<InvoiceField>>();
  const [paymentSrc, setPaymentSrc] = useState<Source<PaymentField>>();
  const [decisions, setDecisions] = useState<Map<string, Decision>>(new Map());
  const [rejected, setRejected] = useState<string[]>([]);
  const [feeTolerance, setFeeTolerance] = useState(3500);
  const [reminderFor, setReminderFor] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);

  const start = (inv: LoadedFile, pay: LoadedFile) => {
    const i = toSource(inv, INVOICE_FIELDS);
    const p = toSource(pay, PAYMENT_FIELDS);
    setInvoiceSrc(i);
    setPaymentSrc(p);
    setDecisions(new Map());
    setRejected([]);
    setStep(i.autoMapped && p.autoMapped ? "results" : "mapping");
  };

  const loadSample = async () => {
    setLoadingSample(true);
    setSampleError(null);
    try {
      const [inv, pay] = await Promise.all(
        ["invoices.csv", "payments.csv"].map(async (name) => {
          const res = await fetch(`/samples/${name}`);
          if (!res.ok) throw new Error(`Could not load ${name}`);
          return { name, text: await res.text() };
        }),
      );
      setInvoiceFile(inv);
      setPaymentFile(pay);
      start(inv, pay);
    } catch (e) {
      setSampleError(e instanceof Error ? e.message : "Could not load the sample data");
    } finally {
      setLoadingSample(false);
    }
  };

  const parsed = useMemo(() => {
    if (!invoiceSrc || !paymentSrc) return null;
    const inv = readInvoices(invoiceSrc.table, invoiceSrc.mapping);
    const pay = readPayments(paymentSrc.table, paymentSrc.mapping);
    return {
      invoices: inv.invoices,
      payments: pay.payments,
      issues: [
        ...inv.issues.map((i) => ({ ...i, file: invoiceSrc.name })),
        ...pay.issues.map((i) => ({ ...i, file: paymentSrc.name })),
      ],
    };
  }, [invoiceSrc, paymentSrc]);

  const result = useMemo(
    () => (parsed && step === "results" ? reconcile(parsed.invoices, parsed.payments, { rejected, feeTolerance }) : null),
    [parsed, step, rejected, feeTolerance],
  );

  const lookups = useMemo(
    () =>
      parsed && result
        ? {
            invoiceById: new Map(parsed.invoices.map((i) => [i.id, i])),
            paymentById: new Map(parsed.payments.map((p) => [p.id, p])),
            statusById: new Map(result.invoices.map((s) => [s.invoice.id, s])),
          }
        : null,
    [parsed, result],
  );

  if (step === "upload" || !invoiceSrc || !paymentSrc) {
    return (
      <>
        <UploadStep
          invoices={invoiceFile}
          payments={paymentFile}
          onInvoices={setInvoiceFile}
          onPayments={setPaymentFile}
          onContinue={() => invoiceFile && paymentFile && start(invoiceFile, paymentFile)}
          onSample={loadSample}
          loadingSample={loadingSample}
        />
        {sampleError && <p className="mt-4 text-sm text-rose-600">{sampleError}</p>}
      </>
    );
  }

  if (step === "mapping" || !result || !parsed || !lookups) {
    return (
      <MappingStep
        invoices={{ ...invoiceSrc, fields: INVOICE_FIELDS }}
        payments={{ ...paymentSrc, fields: PAYMENT_FIELDS }}
        onInvoiceMapping={(mapping) => setInvoiceSrc({ ...invoiceSrc, mapping })}
        onPaymentMapping={(mapping) => setPaymentSrc({ ...paymentSrc, mapping })}
        onBack={() => setStep("upload")}
        onRun={() => {
          setRejected([]);
          setStep("results");
        }}
      />
    );
  }

  const decide = (key: string, d: Decision | null) =>
    setDecisions((prev) => {
      const next = new Map(prev);
      if (d) next.set(key, d);
      else next.delete(key);
      return next;
    });

  const acceptHighConfidence = () =>
    setDecisions((prev) => {
      const next = new Map(prev);
      for (const m of result.matches) if (m.confidence >= HIGH_CONFIDENCE && !next.has(m.key)) next.set(m.key, "accepted");
      return next;
    });

  const exportCsv = () => {
    const all = new Map(decisions);
    for (const key of rejected) all.set(key, "rejected");
    const csv = resultToCsv(result, parsed.invoices, parsed.payments, all);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `reconciliation-${result.asOf}.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const reminderStatus = reminderFor ? lookups.statusById.get(reminderFor) : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Reconciliation</h1>
          <p className="mt-1 truncate text-sm text-stone-500 dark:text-stone-400">
            {invoiceSrc.name} · {paymentSrc.name} · as of {formatDate(result.asOf)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-8 items-center gap-1.5 rounded-lg border border-stone-300 bg-white pl-2.5 text-[13px] shadow-sm dark:border-stone-700 dark:bg-stone-900">
            <span className="text-stone-500 dark:text-stone-400">Fee tolerance $</span>
            <input
              type="number"
              min={0}
              step={1}
              value={feeTolerance / 100}
              onChange={(e) => setFeeTolerance(Math.max(0, Math.round(Number(e.target.value) * 100) || 0))}
              className="tabular h-full w-14 rounded-r-lg bg-transparent pr-2 outline-none"
              aria-label="Bank fee tolerance in dollars"
            />
          </label>
          <Button size="sm" variant="ghost" onClick={() => setStep("mapping")}>
            Columns
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setStep("upload")}>
            Start over
          </Button>
          <Button size="sm" variant="primary" onClick={exportCsv}>
            <DownloadIcon className="size-4" /> Export CSV
          </Button>
        </div>
      </div>

      {parsed.issues.length > 0 && (
        <details className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-500/10 dark:text-amber-200">
          <summary className="cursor-pointer font-medium">
            {parsed.issues.length} row{parsed.issues.length === 1 ? "" : "s"} skipped while reading the files
          </summary>
          <ul className="mt-2 space-y-0.5">
            {parsed.issues.map((i) => (
              <li key={`${i.file}-${i.row}`}>
                {i.file}, line {i.row}: {i.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      <SummaryTiles summary={result.summary} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <AgeingChart rows={ageingReport(result.invoices)} asOf={formatDate(result.asOf)} />
        <ExceptionsQueue
          exceptions={result.exceptions}
          invoiceById={lookups.invoiceById}
          paymentById={lookups.paymentById}
          onDraftReminder={setReminderFor}
        />
      </div>

      <MatchesTable
        matches={result.matches}
        invoiceById={lookups.invoiceById}
        paymentById={lookups.paymentById}
        decisions={decisions}
        onDecide={decide}
        onReject={(key) => setRejected((r) => [...r, key])}
        onAcceptHighConfidence={acceptHighConfidence}
      />

      {rejected.length > 0 && (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          {rejected.length} match{rejected.length === 1 ? "" : "es"} rejected and excluded from re-matching.{" "}
          <button className="font-medium text-emerald-700 hover:underline dark:text-emerald-400" onClick={() => setRejected([])}>
            Restore all
          </button>
        </p>
      )}

      <OverdueTable statuses={result.invoices} onDraftReminder={setReminderFor} />

      {reminderStatus && (
        <ReminderDialog key={reminderStatus.invoice.id} status={reminderStatus} asOf={result.asOf} onClose={() => setReminderFor(null)} />
      )}
    </div>
  );
}

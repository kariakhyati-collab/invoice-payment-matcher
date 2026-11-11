"use client";

import { useId, useState, type DragEvent } from "react";
import { CheckIcon, DownloadIcon, FileIcon, LockIcon, UploadIcon } from "./icons";
import { Button, Card, cx } from "./ui";

export interface LoadedFile {
  name: string;
  text: string;
}

function DropZone({
  title,
  columns,
  file,
  onFile,
}: {
  title: string;
  columns: string;
  file?: LoadedFile;
  onFile: (f: LoadedFile) => void;
}) {
  const id = useId();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = async (f: File | undefined) => {
    if (!f) return;
    if (!/\.(csv|txt|tsv)$/i.test(f.name) && !f.type.includes("csv") && !f.type.startsWith("text/")) {
      setError("Please choose a .csv file.");
      return;
    }
    setError(null);
    onFile({ name: f.name, text: await f.text() });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void read(e.dataTransfer.files[0]);
  };

  return (
    <label
      htmlFor={id}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cx(
        "group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center transition",
        dragging
          ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/5"
          : file
            ? "border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-500/5"
            : "border-stone-300 hover:border-stone-400 hover:bg-stone-50 dark:border-stone-700 dark:hover:border-stone-600 dark:hover:bg-stone-800/40",
      )}
    >
      <span
        className={cx(
          "flex size-10 items-center justify-center rounded-full",
          file
            ? "bg-emerald-600 text-white"
            : "bg-stone-100 text-stone-500 group-hover:text-stone-700 dark:bg-stone-800 dark:text-stone-400",
        )}
      >
        {file ? <CheckIcon className="size-5" /> : <UploadIcon className="size-5" />}
      </span>
      <span>
        <span className="block font-medium">{title}</span>
        {file ? (
          <span className="mt-1 inline-flex max-w-full items-center gap-1 text-sm text-emerald-700 dark:text-emerald-400">
            <FileIcon className="size-4 shrink-0" />
            <span className="truncate">{file.name}</span>
          </span>
        ) : (
          <span className="mt-1 block text-sm text-stone-500 dark:text-stone-400">Drop a CSV or click to browse</span>
        )}
      </span>
      <span className="text-xs text-stone-400 dark:text-stone-500">{columns}</span>
      {error && <span className="text-sm text-rose-600 dark:text-rose-400">{error}</span>}
      <input
        id={id}
        type="file"
        accept=".csv,.tsv,.txt,text/csv"
        className="sr-only"
        onChange={(e) => {
          void read(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </label>
  );
}

const STEPS = [
  ["Exact reference", "Invoice number in the memo, amount equal"],
  ["Amount + name", "Same amount, payer fuzzy-matches the customer"],
  ["Multi-invoice", "One payment settling several invoices"],
  ["Short-pay & fees", "Small differences written off as bank fees"],
  ["Overpayment", "Excess held as unapplied cash"],
  ["Exceptions", "Duplicates, unknown payers, overdue AR"],
];

export function UploadStep({
  invoices,
  payments,
  onInvoices,
  onPayments,
  onContinue,
  onSample,
  loadingSample,
}: {
  invoices?: LoadedFile;
  payments?: LoadedFile;
  onInvoices: (f: LoadedFile) => void;
  onPayments: (f: LoadedFile) => void;
  onContinue: () => void;
  onSample: () => void;
  loadingSample: boolean;
}) {
  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Accounts receivable · cash application</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Match bank payments to open invoices in seconds.
        </h1>
        <p className="mt-3 text-pretty text-stone-600 dark:text-stone-400">
          Upload your open invoices and a bank statement. Reconcile explains every match, flags short-pays,
          overpayments and duplicates, and ages what is still owed.
        </p>
      </div>

      <Card className="p-5 sm:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <DropZone
            title="Open invoices"
            columns="invoice no · customer · invoice date · due date · amount"
            file={invoices}
            onFile={onInvoices}
          />
          <DropZone
            title="Bank payments"
            columns="date · payer · amount · reference / memo"
            file={payments}
            onFile={onPayments}
          />
        </div>
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
            <LockIcon className="size-4 shrink-0" />
            Files are read in your browser and never uploaded anywhere.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={onSample} disabled={loadingSample}>
              {loadingSample ? "Loading…" : "Load sample data"}
            </Button>
            <Button variant="primary" onClick={onContinue} disabled={!invoices || !payments}>
              Continue
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="flex gap-3 rounded-xl border border-stone-200 p-4 dark:border-stone-800">
              <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xs font-semibold text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                {i + 1}
              </span>
              <span>
                <span className="block text-sm font-medium">{title}</span>
                <span className="block text-sm text-stone-500 dark:text-stone-400">{text}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="flex flex-row gap-2 text-sm lg:flex-col">
          <span className="hidden font-medium text-stone-700 lg:block dark:text-stone-300">Sample files</span>
          <a className="inline-flex items-center gap-1.5 text-emerald-700 hover:underline dark:text-emerald-400" href="/samples/invoices.csv" download>
            <DownloadIcon className="size-4" /> invoices.csv
          </a>
          <a className="inline-flex items-center gap-1.5 text-emerald-700 hover:underline dark:text-emerald-400" href="/samples/payments.csv" download>
            <DownloadIcon className="size-4" /> payments.csv
          </a>
        </div>
      </div>
    </div>
  );
}

"use client";

import type { ColumnMapping, FieldSpec } from "@/lib/match";
import { Button, Card, CardHeader, cx } from "./ui";

function MappingCard<F extends string>({
  title,
  fileName,
  table,
  fields,
  mapping,
  onChange,
}: {
  title: string;
  fileName: string;
  table: string[][];
  fields: FieldSpec<F>[];
  mapping: ColumnMapping<F>;
  onChange: (m: ColumnMapping<F>) => void;
}) {
  const headers = table[0] ?? [];
  const sample = table[1] ?? [];
  return (
    <Card>
      <CardHeader title={title} description={`${fileName} · ${Math.max(0, table.length - 1)} rows`} />
      <div className="divide-y divide-stone-100 dark:divide-stone-800">
        {fields.map((f) => {
          const col = mapping[f.key];
          const missing = f.required && col === null;
          return (
            <div key={f.key} className="grid grid-cols-1 gap-2 px-5 py-3 sm:grid-cols-[10rem_1fr] sm:items-center">
              <label htmlFor={`${title}-${f.key}`} className="text-sm">
                <span className="font-medium">{f.label}</span>
                {!f.required && <span className="ml-1 text-stone-400">(optional)</span>}
                {f.hint && <span className="block text-xs text-stone-400">{f.hint}</span>}
              </label>
              <div className="min-w-0">
                <select
                  id={`${title}-${f.key}`}
                  value={col ?? ""}
                  onChange={(e) =>
                    onChange({ ...mapping, [f.key]: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  className={cx(
                    "h-9 w-full rounded-lg border bg-white px-2.5 text-sm shadow-sm dark:bg-stone-900",
                    missing ? "border-rose-400 dark:border-rose-500" : "border-stone-300 dark:border-stone-700",
                  )}
                >
                  <option value="">— not mapped —</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
                <p className="mt-1 truncate text-xs text-stone-400">
                  {col !== null && sample[col] ? <>e.g. “{sample[col]}”</> : missing ? "Required" : " "}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function MappingStep<I extends string, P extends string>(props: {
  invoices: { name: string; table: string[][]; fields: FieldSpec<I>[]; mapping: ColumnMapping<I> };
  payments: { name: string; table: string[][]; fields: FieldSpec<P>[]; mapping: ColumnMapping<P> };
  onInvoiceMapping: (m: ColumnMapping<I>) => void;
  onPaymentMapping: (m: ColumnMapping<P>) => void;
  onBack: () => void;
  onRun: () => void;
}) {
  const { invoices, payments } = props;
  const ready =
    invoices.fields.every((f) => !f.required || invoices.mapping[f.key] !== null) &&
    payments.fields.every((f) => !f.required || payments.mapping[f.key] !== null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Check the column mapping</h1>
        <p className="mt-1 text-stone-600 dark:text-stone-400">
          We guessed which column is which from the headers. Fix anything that looks wrong.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <MappingCard title="Open invoices" fileName={invoices.name} table={invoices.table} fields={invoices.fields} mapping={invoices.mapping} onChange={props.onInvoiceMapping} />
        <MappingCard title="Bank payments" fileName={payments.name} table={payments.table} fields={payments.fields} mapping={payments.mapping} onChange={props.onPaymentMapping} />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={props.onBack}>
          Back
        </Button>
        <Button variant="primary" onClick={props.onRun} disabled={!ready}>
          Run matching
        </Button>
      </div>
    </div>
  );
}

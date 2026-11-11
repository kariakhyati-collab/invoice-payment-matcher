import { formatDate, formatMoney, type Invoice, type Payment, type ReconException } from "@/lib/match";
import { MailIcon } from "../icons";
import { EXCEPTION_META } from "../labels";
import { Badge, Button, Card, CardHeader } from "../ui";

export function ExceptionsQueue({
  exceptions,
  invoiceById,
  paymentById,
  onDraftReminder,
}: {
  exceptions: ReconException[];
  invoiceById: Map<string, Invoice>;
  paymentById: Map<string, Payment>;
  onDraftReminder: (invoiceId: string) => void;
}) {
  const sorted = [...exceptions].sort(
    (a, b) => EXCEPTION_META[a.kind].order - EXCEPTION_META[b.kind].order || b.amount - a.amount,
  );

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Exceptions"
        description={exceptions.length ? `${exceptions.length} items need a human` : "Nothing needs attention"}
      />
      <ul className="max-h-[19rem] lg:max-h-[17.5rem] flex-1 divide-y divide-stone-100 overflow-y-auto dark:divide-stone-800">
        {sorted.map((e) => {
          const meta = EXCEPTION_META[e.kind];
          const p = e.paymentId ? paymentById.get(e.paymentId) : undefined;
          const i = e.invoiceId ? invoiceById.get(e.invoiceId) : undefined;
          return (
            <li key={e.id} className="px-5 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  <p className="mt-1.5 truncate text-sm font-medium">
                    {p ? p.payer || "Unknown payer" : i ? `${i.invoiceNo} · ${i.customer}` : "—"}
                  </p>
                  {p && (
                    <p className="tabular truncate text-xs text-stone-500 dark:text-stone-400">
                      {formatDate(p.date)}
                      {p.reference && <> · {p.reference}</>}
                    </p>
                  )}
                </div>
                <span className="tabular shrink-0 text-sm font-semibold">{formatMoney(e.amount)}</span>
              </div>
              <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">{e.explanation}</p>
              {e.kind === "overdue_invoice" && e.invoiceId && (
                <Button size="sm" variant="ghost" className="-ml-2.5 mt-1" onClick={() => onDraftReminder(e.invoiceId!)}>
                  <MailIcon className="size-4" /> Draft reminder
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

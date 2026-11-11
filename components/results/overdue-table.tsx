import { AGE_BUCKETS, formatDate, formatMoney, type InvoiceStatus } from "@/lib/match";
import { MailIcon } from "../icons";
import { BUCKET_META } from "../labels";
import { Badge, Button, Card, CardHeader, cx, TableScroll, td, th } from "../ui";

const bucketLabel = new Map(AGE_BUCKETS.map((b) => [b.bucket, b.label]));

export function OverdueTable({
  statuses,
  onDraftReminder,
}: {
  statuses: InvoiceStatus[];
  onDraftReminder: (invoiceId: string) => void;
}) {
  const overdue = statuses.filter((s) => s.open > 0 && s.daysPastDue > 0).sort((a, b) => b.daysPastDue - a.daysPastDue);

  return (
    <Card>
      <CardHeader
        title="Overdue invoices"
        description="Reminders escalate from friendly to final notice as an invoice ages."
      />
      <TableScroll>
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-stone-50/80 dark:bg-stone-900/60">
            <tr>
              <th className={th}>Invoice</th>
              <th className={th}>Customer</th>
              <th className={th}>Due</th>
              <th className={th}>Age</th>
              <th className={cx(th, "text-right")}>Open</th>
              <th className={cx(th, "text-right")}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
            {overdue.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-stone-500">
                  No overdue invoices.
                </td>
              </tr>
            )}
            {overdue.map((s) => (
              <tr key={s.invoice.id}>
                <td className={cx(td, "font-medium whitespace-nowrap")}>
                  {s.invoice.invoiceNo}
                  {s.status === "partial" && <span className="ml-2 text-xs font-normal text-stone-500">part-paid</span>}
                </td>
                <td className={td}>{s.invoice.customer}</td>
                <td className={cx(td, "tabular whitespace-nowrap text-stone-600 dark:text-stone-300")}>
                  {formatDate(s.invoice.dueDate)}
                </td>
                <td className={cx(td, "whitespace-nowrap")}>
                  <Badge tone={BUCKET_META[s.bucket].tone}>{bucketLabel.get(s.bucket)}</Badge>
                  <span className="tabular ml-2 text-xs text-stone-500">{s.daysPastDue}d</span>
                </td>
                <td className={cx(td, "tabular text-right font-medium whitespace-nowrap")}>{formatMoney(s.open)}</td>
                <td className={cx(td, "py-2 text-right")}>
                  <Button size="sm" onClick={() => onDraftReminder(s.invoice.id)}>
                    <MailIcon className="size-4" /> Draft reminder
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </Card>
  );
}

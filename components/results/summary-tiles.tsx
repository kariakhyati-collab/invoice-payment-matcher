import { formatMoney, type Summary } from "@/lib/match";
import { cx } from "../ui";

function Tile({
  label,
  value,
  detail,
  accent,
  children,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: "emerald" | "rose";
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-stone-200 bg-white p-4 shadow-sm shadow-stone-900/[0.03] sm:p-5 dark:border-stone-800 dark:bg-stone-900">
      <p className="text-sm text-stone-500 dark:text-stone-400">{label}</p>
      <p
        className={cx(
          "tabular mt-1 truncate text-2xl font-semibold tracking-tight sm:text-[28px]",
          accent === "emerald" && "text-emerald-700 dark:text-emerald-400",
          accent === "rose" && "text-rose-700 dark:text-rose-400",
        )}
      >
        {value}
      </p>
      {children}
      <p className="tabular mt-1.5 truncate text-xs text-stone-500 sm:text-[13px] dark:text-stone-400">{detail}</p>
    </div>
  );
}

export function SummaryTiles({ summary }: { summary: Summary }) {
  const pct = Math.round(summary.matchedRate * 100);
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <Tile label="Payments matched" value={`${pct}%`} detail={`${summary.matchedPaymentCount} of ${summary.paymentCount} payments`} accent="emerald">
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
        </div>
      </Tile>
      <Tile
        label="Cash applied"
        value={formatMoney(summary.cashApplied)}
        detail={`of ${formatMoney(summary.cashReceived)} received`}
      />
      <Tile label="Open AR" value={formatMoney(summary.openAR)} detail={`${formatMoney(summary.overdueAR)} overdue`} />
      <Tile
        label="Exceptions"
        value={String(summary.exceptionCount)}
        detail={`${formatMoney(summary.unappliedCash)} cash not applied`}
        accent={summary.exceptionCount ? "rose" : undefined}
      />
    </div>
  );
}

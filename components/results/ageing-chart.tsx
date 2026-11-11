import { formatMoney, formatMoneyCompact, type AgeingRow } from "@/lib/match";
import { BUCKET_META } from "../labels";
import { Card, CardHeader } from "../ui";

const W = 520;
const H = 200;
const TOP = 26;
const BASE = 140;
const SLOT = W / 5;
const BAR = 54;

export function AgeingChart({ rows, asOf }: { rows: AgeingRow[]; asOf: string }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  const total = rows.reduce((t, r) => t + r.amount, 0);
  const summary = rows.map((r) => `${r.label}: ${formatMoney(r.amount)} (${r.count})`).join("; ");

  return (
    <Card className="flex flex-col">
      <CardHeader title="AR ageing" description={`${formatMoney(total)} open as of ${asOf}`} />
      <div className="flex flex-1 items-center px-3 pt-3 pb-1 sm:px-5">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Open receivables by age. ${summary}`}>
          <line x1="8" x2={W - 8} y1={BASE + 0.5} y2={BASE + 0.5} className="stroke-stone-200 dark:stroke-stone-700" />
          {rows.map((r, i) => {
            const h = r.amount === 0 ? 0 : Math.max(3, ((BASE - TOP) * r.amount) / max);
            const cx = SLOT * i + SLOT / 2;
            return (
              <g key={r.bucket}>
                <title>{`${r.label}: ${formatMoney(r.amount)} across ${r.count} invoice${r.count === 1 ? "" : "s"}`}</title>
                <rect x={cx - BAR / 2} y={BASE - h} width={BAR} height={h} rx="4" className={BUCKET_META[r.bucket].fill} />
                <text x={cx} y={BASE - h - 8} textAnchor="middle" className="tabular fill-stone-800 text-[13px] font-semibold dark:fill-stone-100">
                  {r.amount ? formatMoneyCompact(r.amount) : "—"}
                </text>
                <text x={cx} y={BASE + 22} textAnchor="middle" className="fill-stone-600 text-[13px] dark:fill-stone-300">
                  {r.label}
                </text>
                <text x={cx} y={BASE + 40} textAnchor="middle" className="fill-stone-400 text-xs dark:fill-stone-500">
                  {r.count} invoice{r.count === 1 ? "" : "s"}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </Card>
  );
}

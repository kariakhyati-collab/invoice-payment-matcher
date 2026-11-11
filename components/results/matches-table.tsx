"use client";

import { useState } from "react";
import { formatDate, formatMoney, type Decision, type Invoice, type Match, type Payment } from "@/lib/match";
import { CheckIcon, UndoIcon, XIcon } from "../icons";
import { FLAG_META, RULE_META } from "../labels";
import { Badge, Button, Card, CardHeader, cx, TableScroll, td, th } from "../ui";

type Filter = "all" | "review" | "accepted";

const REVIEW_FLAGS = new Set(["ambiguous", "short_pay", "early_payment", "overpayment"]);
const needsReview = (m: Match) => m.confidence < 0.85 || m.flags.some((f) => REVIEW_FLAGS.has(f));
export const HIGH_CONFIDENCE = 0.9;

function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= HIGH_CONFIDENCE ? "bg-emerald-500" : value >= 0.75 ? "bg-amber-400" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2" title={`${pct}% confidence`}>
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
        <div className={cx("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular text-[13px] text-stone-600 dark:text-stone-300">{pct}%</span>
    </div>
  );
}

export function MatchesTable({
  matches,
  invoiceById,
  paymentById,
  decisions,
  onDecide,
  onReject,
  onAcceptHighConfidence,
}: {
  matches: Match[];
  invoiceById: Map<string, Invoice>;
  paymentById: Map<string, Payment>;
  decisions: ReadonlyMap<string, Decision>;
  onDecide: (key: string, decision: Decision | null) => void;
  onReject: (key: string) => void;
  onAcceptHighConfidence: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const sorted = [...matches].sort((a, b) => {
    const pa = paymentById.get(a.paymentId)!;
    const pb = paymentById.get(b.paymentId)!;
    return pb.date.localeCompare(pa.date) || pb.row - pa.row;
  });
  const counts: Record<Filter, number> = {
    all: matches.length,
    review: matches.filter(needsReview).length,
    accepted: matches.filter((m) => decisions.get(m.key) === "accepted").length,
  };
  const visible = sorted.filter((m) =>
    filter === "review" ? needsReview(m) : filter === "accepted" ? decisions.get(m.key) === "accepted" : true,
  );
  const pendingHigh = matches.filter((m) => m.confidence >= HIGH_CONFIDENCE && !decisions.has(m.key)).length;

  return (
    <Card>
      <CardHeader
        title="Matches"
        description="Every proposed match says which rule fired and why. Accept to confirm, reject to re-run without it."
        actions={
          <Button size="sm" onClick={onAcceptHighConfidence} disabled={pendingHigh === 0}>
            <CheckIcon className="size-4" /> Accept {pendingHigh} ≥ {HIGH_CONFIDENCE * 100}%
          </Button>
        }
      />
      <div className="flex gap-1 border-b border-stone-200 px-4 py-2 dark:border-stone-800" role="tablist">
        {(
          [
            ["all", "All"],
            ["review", "Needs review"],
            ["accepted", "Accepted"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={cx(
              "rounded-md px-2.5 py-1 text-[13px] font-medium transition",
              filter === key
                ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800",
            )}
          >
            {label} <span className="tabular opacity-60">{counts[key]}</span>
          </button>
        ))}
      </div>
      <TableScroll>
        <table className="w-full min-w-[1040px] text-sm">
          <thead className="bg-stone-50/80 dark:bg-stone-900/60">
            <tr>
              <th className={th}>Payment</th>
              <th className={cx(th, "text-right")}>Amount</th>
              <th className={th}>Invoice(s)</th>
              <th className={th}>Rule</th>
              <th className={th}>Confidence</th>
              <th className={th}>Why</th>
              <th className={cx(th, "text-right")}>Decision</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-stone-500">
                  Nothing here yet.
                </td>
              </tr>
            )}
            {visible.map((m) => {
              const p = paymentById.get(m.paymentId)!;
              const invs = m.invoiceIds.map((id) => invoiceById.get(id)!);
              const decision = decisions.get(m.key);
              const rule = RULE_META[m.rule];
              return (
                <tr key={m.key} className={cx(decision === "accepted" && "bg-emerald-50/40 dark:bg-emerald-500/[0.04]")}>
                  <td className={cx(td, "max-w-[15rem]")}>
                    <div className="truncate font-medium" title={p.payer}>{p.payer || "—"}</div>
                    <div className="tabular truncate text-xs text-stone-500 dark:text-stone-400">
                      {formatDate(p.date)}
                      {p.reference && <> · {p.reference}</>}
                    </div>
                  </td>
                  <td className={cx(td, "tabular text-right font-medium whitespace-nowrap")}>{formatMoney(p.amount)}</td>
                  <td className={cx(td, "max-w-[14rem]")}>
                    <div className="truncate font-medium">{invs.map((i) => i.invoiceNo).join(", ")}</div>
                    <div className="truncate text-xs text-stone-500 dark:text-stone-400">{invs[0]?.customer}</div>
                  </td>
                  <td className={cx(td, "whitespace-nowrap")}>
                    <Badge tone={rule.tone}>{rule.label}</Badge>
                  </td>
                  <td className={td}>
                    <Confidence value={m.confidence} />
                  </td>
                  <td className={cx(td, "min-w-[16rem]")}>
                    {m.flags.length > 0 && (
                      <div className="mb-1 flex flex-wrap gap-1">
                        {m.flags.map((f) => (
                          <Badge key={f} tone={FLAG_META[f].tone}>
                            {FLAG_META[f].label}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <p className="line-clamp-2 text-xs text-stone-500 dark:text-stone-400" title={m.explanation}>
                      {m.explanation}
                    </p>
                  </td>
                  <td className={cx(td, "text-right whitespace-nowrap")}>
                    {decision === "accepted" ? (
                      <span className="inline-flex items-center gap-1">
                        <Badge tone="emerald">
                          <CheckIcon className="mr-0.5 size-3.5" /> Accepted
                        </Badge>
                        <button
                          onClick={() => onDecide(m.key, null)}
                          className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                          aria-label={`Undo accept for ${p.payer}`}
                          title="Undo"
                        >
                          <UndoIcon className="size-4" />
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => onReject(m.key)} aria-label={`Reject match for ${p.payer}`}>
                          <XIcon className="size-4" /> Reject
                        </Button>
                        <Button size="sm" onClick={() => onDecide(m.key, "accepted")} aria-label={`Accept match for ${p.payer}`}>
                          <CheckIcon className="size-4" /> Accept
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
    </Card>
  );
}

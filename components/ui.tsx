import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={cx(
        "min-w-0 rounded-xl border border-stone-200 bg-white shadow-sm shadow-stone-900/[0.03] dark:border-stone-800 dark:bg-stone-900 dark:shadow-none",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 px-5 py-4 dark:border-stone-800">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost";

const BUTTON: Record<ButtonVariant, string> = {
  primary:
    "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:outline-emerald-600 disabled:bg-emerald-600/50",
  secondary:
    "border border-stone-300 bg-white text-stone-800 shadow-sm hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800",
  ghost: "text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed",
        size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-10 px-4 text-sm",
        BUTTON[variant],
        className,
      )}
      {...props}
    />
  );
}

export type Tone = "emerald" | "sky" | "violet" | "amber" | "orange" | "rose" | "stone";

const BADGE: Record<Tone, string> = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/20",
  sky: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-400/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20",
  orange: "bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-400/20",
  rose: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20",
  stone: "bg-stone-100 text-stone-700 ring-stone-500/20 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-400/20",
};

export function Badge({ tone = "stone", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        BADGE[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Horizontally scrollable wrapper so wide tables never widen the page. */
export function TableScroll({ children }: { children: ReactNode }) {
  return <div className="relative overflow-x-auto overscroll-x-contain">{children}</div>;
}

export const th =
  "px-4 py-2.5 text-left text-xs font-medium tracking-wide whitespace-nowrap text-stone-500 uppercase dark:text-stone-400";
export const td = "px-4 py-3 align-top";

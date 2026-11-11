import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { GitHubIcon, LogoMark } from "@/components/icons";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const REPO_URL = "https://github.com/kariakhyati-collab/invoice-payment-matcher";

export const metadata: Metadata = {
  title: "Reconcile — invoice → payment matcher",
  description:
    "Match bank payments to open invoices in the browser: exact references, fuzzy customer names, multi-invoice remittances, short-pays and overpayments.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a09" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="flex min-h-dvh flex-col font-sans">
        <header className="border-b border-stone-200/80 bg-white/70 backdrop-blur dark:border-stone-800/80 dark:bg-stone-950/70">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <Link href="/" className="flex min-w-0 items-center gap-2.5">
              <LogoMark className="size-7 shrink-0" />
              <span className="font-semibold tracking-tight">Reconcile</span>
              <span className="truncate text-sm text-stone-500 dark:text-stone-400">by Khyati Karia</span>
            </Link>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
            >
              <GitHubIcon className="size-4" />
              <span className="hidden sm:inline">Source</span>
            </a>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>

        <footer className="border-t border-stone-200/80 dark:border-stone-800/80">
          <p className="mx-auto max-w-6xl px-4 py-6 text-sm text-stone-500 sm:px-6 dark:text-stone-400">
            Demonstrates a deterministic, fully tested multi-pass matching engine in TypeScript — integer-cent money,
            fuzzy name matching and bounded subset-sum search — running entirely in your browser.
          </p>
        </footer>
      </body>
    </html>
  );
}

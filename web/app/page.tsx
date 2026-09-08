import Link from "next/link";

import { NetworkStatusBadge } from "@/components/NetworkStatusBadge";
import { WalletPanel } from "@/components/WalletPanel";
import { NetworkInfoCard } from "@/components/NetworkInfoCard";

const FLOW_STEPS = [
  { label: "Verify", detail: "Cryptographically prove real financial activity" },
  { label: "Negotiate", detail: "Borrower AI and Lender AI agree on terms" },
  { label: "Fund", detail: "Lender funds the agreement on-chain" },
  { label: "Repay", detail: "Borrower repays, collateral is returned" },
];

const HOW_IT_WORKS = [
  "Verify financial activity — a real cross-chain repayment (via Attestcoin) or native CC3 loan history.",
  "Build an evidence-backed profile — VERIFIED, UNVERIFIED, or NOT AVAILABLE. Never a fabricated score.",
  "AI agents negotiate terms — a Borrower AI and Lender AI exchange offers; deterministic code enforces every limit.",
  "Execute the agreement on Creditcoin — a real transaction escrows collateral and funds the loan.",
  "Repay and strengthen the borrower's history — a real on-chain repayment becomes evidence for the next negotiation.",
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16 sm:py-24">
      <div className="w-full max-w-3xl">
        {/* Hero */}
        <header className="mb-12 text-center">
          <div className="flex justify-center">
            <NetworkStatusBadge />
          </div>
          <h1 className="mt-4 text-5xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Acoris
          </h1>
          <p className="mt-2 text-lg font-medium text-zinc-700 dark:text-zinc-300">Credit that proves itself.</p>
          <p className="mx-auto mt-3 max-w-xl text-zinc-600 dark:text-zinc-400">
            AI-powered DeFi credit backed by cryptographically verified financial activity.
          </p>

          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/credit-profile"
              className="w-full rounded-lg bg-black px-5 py-2.5 text-center text-sm font-medium text-white transition hover:bg-zinc-800 sm:w-auto dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Build Credit Profile
            </Link>
            <Link
              href="/negotiation"
              className="w-full rounded-lg border border-black/10 px-5 py-2.5 text-center text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 sm:w-auto dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Request a Loan
            </Link>
          </div>

          {/* Flow */}
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap sm:gap-x-1 sm:gap-y-3">
            {FLOW_STEPS.map((step, i) => (
              <div key={step.label} className="flex flex-col items-center gap-3 sm:flex-row sm:gap-1">
                <div className="flex flex-col items-center px-3">
                  <span className="text-xs font-bold uppercase tracking-wide text-zinc-800 dark:text-zinc-200">
                    {step.label}
                  </span>
                  <span className="mt-0.5 max-w-[9rem] text-center text-[10px] text-zinc-400 dark:text-zinc-600">
                    {step.detail}
                  </span>
                </div>
                {i < FLOW_STEPS.length - 1 && (
                  <span className="text-zinc-300 dark:text-zinc-700">
                    <span className="sm:hidden">↓</span>
                    <span className="hidden sm:inline">→</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </header>

        {/* Problem / Solution */}
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              The Problem
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              DeFi lending often treats users as anonymous wallets with limited financial context.
            </p>
          </section>
          <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              The Solution
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Acoris combines cross-chain verification with AI negotiation to turn verifiable financial history into
              better credit decisions.
            </p>
          </section>
        </div>

        {/* How it works */}
        <section className="mt-4 rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            How It Works
          </h2>
          <ol className="mt-3 space-y-2.5 text-sm text-zinc-700 dark:text-zinc-300">
            {HOW_IT_WORKS.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="shrink-0 font-mono text-zinc-400 dark:text-zinc-600">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Live connectivity proof */}
        <section className="mt-4 rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            This Is Live, Not a Mockup
          </h2>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Connect a wallet on CC3 Testnet below to see a real balance and block number, read straight from the
            chain — no state is simulated anywhere in this product.
          </p>
          <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-center">
            <WalletPanel />
            <NetworkInfoCard />
          </div>
        </section>

        <nav className="mt-8 flex flex-col items-center gap-2 text-sm">
          <Link href="/credit-profile" className="text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
            Acoris Credit Profile →
          </Link>
          <Link href="/attestcoin" className="text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
            Attestcoin cross-chain verification →
          </Link>
          <Link href="/negotiation" className="text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
            AI credit negotiation →
          </Link>
        </nav>
      </div>
    </main>
  );
}

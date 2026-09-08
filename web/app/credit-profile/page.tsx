import Link from "next/link";

import { CreditProfilePanel } from "@/components/credit/CreditProfilePanel";
import { NetworkStatusBadge } from "@/components/NetworkStatusBadge";

export default function CreditProfilePage() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16 sm:py-24">
      <div className="w-full max-w-3xl">
        <header className="mb-10 text-center">
          <div className="flex justify-center">
            <NetworkStatusBadge />
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Acoris Credit Profile
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-zinc-600 dark:text-zinc-400">
            Verified financial activity, not a guess. Bring real evidence — a Sepolia repayment proven cross-chain
            via Attestcoin, or native CC3 loan history — and see exactly what a lender would see.
          </p>
          <Link href="/" className="mt-4 inline-block text-sm text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
            ← Back to Acoris
          </Link>
        </header>

        <div className="flex justify-center">
          <CreditProfilePanel />
        </div>

        <p className="mt-8 text-center text-xs text-zinc-400 dark:text-zinc-600">
          This is the same evidence-resolution path the negotiation engine uses — a profile built here is exactly
          what a negotiation would price against. See docs/ACORIS_NEGOTIATION_ENGINE.md.
        </p>
      </div>
    </main>
  );
}

import Link from "next/link";

import { AttestcoinVerificationPanel } from "@/components/AttestcoinVerificationPanel";

export default function AttestcoinPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16 sm:py-24">
      <div className="w-full max-w-3xl">
        <header className="mb-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Phase 2 — Attestcoin integration
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Attestcoin Verification
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-zinc-600 dark:text-zinc-400">
            One end-to-end cross-chain verification: a real Sepolia transaction, attested and
            proven on Creditcoin CC3 Testnet via the BlockProver precompile, decoded into a
            structured fact a lending decision can consume.
          </p>
          <Link href="/" className="mt-4 inline-block text-sm text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
            ← Back to wallet shell
          </Link>
        </header>

        <div className="flex justify-center">
          <AttestcoinVerificationPanel />
        </div>

        <p className="mt-8 text-center text-xs text-zinc-400 dark:text-zinc-600">
          See docs/ACORIS_ATTESTCOIN_VERIFICATION.md for the exact live flow and this
          environment&apos;s network limitations.
        </p>
      </div>
    </main>
  );
}

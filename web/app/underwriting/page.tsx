import Link from "next/link";

import { NetworkStatusBadge } from "@/components/NetworkStatusBadge";
import { UnderwritingPanel } from "@/components/underwriting/UnderwritingPanel";

export default function UnderwritingPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16 sm:py-24">
      <div className="w-full max-w-3xl">
        <header className="mb-10 text-center">
          <div className="flex justify-center">
            <NetworkStatusBadge />
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            AI Credit Underwriter
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-zinc-600 dark:text-zinc-400">
            See exactly how a lender would price this request from real evidence — the same deterministic formula
            that governs actual negotiations, narrated in plain language. No AI call, no invented confidence score.
          </p>
          <Link href="/" className="mt-4 inline-block text-sm text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
            ← Back to Acoris
          </Link>
        </header>

        <div className="flex justify-center">
          <UnderwritingPanel />
        </div>

        <p className="mt-8 text-center text-xs text-zinc-400 dark:text-zinc-600">
          See lib/negotiation/underwrite.ts and constraints.ts for the exact formulas — this view runs no AI call and
          works even without ANTHROPIC_API_KEY configured.
        </p>
      </div>
    </main>
  );
}

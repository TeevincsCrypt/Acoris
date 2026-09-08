import Link from "next/link";

import { NegotiationConsole } from "@/components/negotiation/NegotiationConsole";
import { NetworkStatusBadge } from "@/components/NetworkStatusBadge";

export default function NegotiationPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16 sm:py-24">
      <div className="w-full max-w-3xl">
        <header className="mb-10 text-center">
          <div className="flex justify-center">
            <NetworkStatusBadge />
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Negotiate a Loan
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-zinc-600 dark:text-zinc-400">
            A Borrower AI and a Lender AI negotiate structured loan terms. Financial
            constraints are enforced by deterministic code — the AI proposes, it never
            enforces. Verified credit history comes only from genuine cryptographic proofs.
          </p>
          <Link href="/" className="mt-4 inline-block text-sm text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
            ← Back to Acoris
          </Link>
        </header>

        <div className="flex justify-center">
          <NegotiationConsole />
        </div>

        <p className="mt-8 text-center text-xs text-zinc-400 dark:text-zinc-600">
          See docs/ACORIS_NEGOTIATION_ENGINE.md for the architecture and this
          environment&apos;s limitations.
        </p>
      </div>
    </main>
  );
}

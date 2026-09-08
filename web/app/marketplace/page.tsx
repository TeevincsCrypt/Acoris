import Link from "next/link";

import { MarketplacePanel } from "@/components/marketplace/MarketplacePanel";
import { NetworkStatusBadge } from "@/components/NetworkStatusBadge";

export default function MarketplacePage() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16 sm:py-24">
      <div className="w-full max-w-3xl">
        <header className="mb-10 text-center">
          <div className="flex justify-center">
            <NetworkStatusBadge />
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Lender Marketplace
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-zinc-600 dark:text-zinc-400">
            Three lenders with different risk postures — Conservative, Balanced, and Aggressive — each independently
            price the same loan request. Pick one to continue negotiating.
          </p>
          <Link href="/" className="mt-4 inline-block text-sm text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
            ← Back to Acoris
          </Link>
        </header>

        <div className="flex justify-center">
          <MarketplacePanel />
        </div>

        <p className="mt-8 text-center text-xs text-zinc-400 dark:text-zinc-600">
          See docs/ACORIS_NEGOTIATION_ENGINE.md for how lender personas derive constraints and how the negotiation
          engine itself is unchanged once a lender is chosen.
        </p>
      </div>
    </main>
  );
}

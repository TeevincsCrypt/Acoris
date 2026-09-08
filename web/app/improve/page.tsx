import Link from "next/link";

import { ImprovementPanel } from "@/components/improve/ImprovementPanel";
import { NetworkStatusBadge } from "@/components/NetworkStatusBadge";

export default function ImprovePage() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16 sm:py-24">
      <div className="w-full max-w-3xl">
        <header className="mb-10 text-center">
          <div className="flex justify-center">
            <NetworkStatusBadge />
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Credit Improvement Simulator
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-zinc-600 dark:text-zinc-400">
            See how specific, real changes to your verified evidence would change your terms — computed by this
            protocol&apos;s actual pricing formula, not a promise.
          </p>
          <Link href="/" className="mt-4 inline-block text-sm text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
            ← Back to Acoris
          </Link>
        </header>

        <div className="flex justify-center">
          <ImprovementPanel />
        </div>

        <p className="mt-8 text-center text-xs text-zinc-400 dark:text-zinc-600">
          See lib/negotiation/improve.ts — every projected number is produced by feeding a concrete hypothetical
          through the same deriveLenderConstraints function that prices real negotiations.
        </p>
      </div>
    </main>
  );
}

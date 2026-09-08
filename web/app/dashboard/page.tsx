import Link from "next/link";

import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { NetworkStatusBadge } from "@/components/NetworkStatusBadge";

export default function DashboardPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16 sm:py-24">
      <div className="w-full max-w-3xl">
        <header className="mb-10 text-center">
          <div className="flex justify-center">
            <NetworkStatusBadge />
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Your Loan Portfolio
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-zinc-600 dark:text-zinc-400">
            Every number here is read directly from AcorisLoanRegistry on CC3 Testnet for your connected wallet —
            no simulated activity, no placeholder history.
          </p>
          <Link href="/" className="mt-4 inline-block text-sm text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
            ← Back to Acoris
          </Link>
        </header>

        <div className="flex justify-center">
          <DashboardPanel />
        </div>
      </div>
    </main>
  );
}

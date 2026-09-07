import Link from "next/link";

import { WalletPanel } from "@/components/WalletPanel";
import { NetworkInfoCard } from "@/components/NetworkInfoCard";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16 sm:py-24">
      <div className="w-full max-w-3xl">
        <header className="mb-12 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Phase 1 — Application shell
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Acoris
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-zinc-600 dark:text-zinc-400">
            An AI-powered DeFi negotiation protocol running on Creditcoin CC3 Testnet.
            Borrower and Lender agents negotiate terms; Attestcoin verifies cross-chain
            financial activity; agreements execute on-chain.
          </p>
        </header>

        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-center">
          <WalletPanel />
          <NetworkInfoCard />
        </div>

        <p className="mt-12 text-center text-xs text-zinc-400 dark:text-zinc-600">
          This panel performs genuine reads against whatever network your wallet is
          connected to — no chain state is simulated. Connect a wallet on CC3 Testnet
          to see a live balance and block number.
        </p>

        <p className="mt-6 text-center text-sm">
          <Link href="/attestcoin" className="text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
            Phase 2: Attestcoin verification →
          </Link>
        </p>
        <p className="mt-2 text-center text-sm">
          <Link href="/negotiation" className="text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
            Phase 3A: AI credit negotiation →
          </Link>
        </p>
      </div>
    </main>
  );
}

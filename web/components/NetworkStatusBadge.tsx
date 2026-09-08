import { CC3_TESTNET_CHAIN_ID } from "@/lib/creditcoin";

/**
 * Signals, everywhere it appears, that this isn't a mockup: real chain,
 * real chain id, read straight from lib/creditcoin.ts (the same constants
 * every real RPC call in this app uses) — never a hardcoded display string
 * that could drift from what the app actually talks to.
 */
export function NetworkStatusBadge({ className = "" }: { className?: string }) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border border-emerald-600/20 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-950 dark:text-emerald-300 ${className}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      Live Testnet · Creditcoin CC3 · Chain {CC3_TESTNET_CHAIN_ID}
    </div>
  );
}

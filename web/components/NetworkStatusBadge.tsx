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
      className={`inline-flex items-center gap-2 rounded-full border border-violet/20 bg-lavender-mist px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-deep ${className}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet" />
      </span>
      Live Testnet · Creditcoin CC3 · Chain {CC3_TESTNET_CHAIN_ID}
    </div>
  );
}

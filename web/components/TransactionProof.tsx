import { CC3_TESTNET_EXPLORER } from "@/lib/creditcoin";

/**
 * Displays a real transaction hash prominently after a real confirmed
 * write. `txHash` must come from an actual transaction result — never
 * pass a placeholder or a hash from a different chain. The explorer link
 * uses the app's own configured CC3_TESTNET_EXPLORER (never invented) —
 * an earlier Blockscout instance this pointed at was decommissioned and
 * replaced with the current one (see lib/creditcoin.ts) — but is still
 * kept secondary and labeled best-effort: this sandbox's own network
 * policy blocks reaching *.blockscout.com, so it can't be independently
 * re-verified from here. The tx hash itself, not the link, is the actual
 * proof shown here.
 */
export function TransactionProof({ txHash, label = "Confirmed on Creditcoin CC3 Testnet" }: { txHash: string; label?: string }) {
  const explorerUrl = `${CC3_TESTNET_EXPLORER}/tx/${txHash}`;
  return (
    <div className="rounded-lg border border-emerald-600/20 bg-emerald-50 p-3 text-xs dark:border-emerald-400/20 dark:bg-emerald-950">
      <p className="font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">{label}</p>
      <p className="mt-1.5 break-all font-mono text-[11px] text-emerald-900 dark:text-emerald-100">{txHash}</p>
      <a
        href={explorerUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-1.5 inline-block text-emerald-700 underline decoration-emerald-700/40 hover:decoration-emerald-700 dark:text-emerald-300 dark:decoration-emerald-300/40 dark:hover:decoration-emerald-300"
      >
        View on CC3 explorer (best-effort link) →
      </a>
    </div>
  );
}

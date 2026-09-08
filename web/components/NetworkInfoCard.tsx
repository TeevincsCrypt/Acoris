import {
  CC3_TESTNET_CHAIN_ID,
  CC3_TESTNET_RPC_HTTP,
  CC3_TESTNET_NATIVE_CURRENCY,
} from "@/lib/creditcoin";

export function NetworkInfoCard() {
  return (
    <div className="w-full max-w-md acoris-card p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Target network
      </h2>
      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-zinc-500 dark:text-zinc-400">Name</dt>
          <dd className="text-zinc-900 dark:text-zinc-100">Creditcoin CC3 Testnet</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-zinc-500 dark:text-zinc-400">Chain ID</dt>
          <dd className="font-mono text-zinc-900 dark:text-zinc-100">{CC3_TESTNET_CHAIN_ID}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="shrink-0 text-zinc-500 dark:text-zinc-400">RPC</dt>
          <dd className="truncate font-mono text-xs text-zinc-900 dark:text-zinc-100">
            {CC3_TESTNET_RPC_HTTP}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-zinc-500 dark:text-zinc-400">Gas token</dt>
          <dd className="text-zinc-900 dark:text-zinc-100">{CC3_TESTNET_NATIVE_CURRENCY.symbol}</dd>
        </div>
      </dl>
    </div>
  );
}

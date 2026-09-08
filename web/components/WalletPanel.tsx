"use client";

import { useWallet, formatTctc, shortAddress } from "@/lib/wallet-context";
import { CC3_TESTNET_CHAIN_ID } from "@/lib/creditcoin";

export function WalletPanel() {
  const { status, address, chainId, reading, error, connect, disconnect, switchToCC3Testnet, refresh } =
    useWallet();

  return (
    <div className="w-full max-w-md acoris-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Wallet
        </h2>
        <StatusBadge status={status} />
      </div>

      {status === "no-wallet" && (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          No EIP-1193 wallet detected. Install MetaMask (or another injected wallet) to connect
          Acoris to CC3 Testnet.
        </p>
      )}

      {(status === "disconnected" || status === "no-wallet") && (
        <button
          onClick={connect}
          disabled={status === "no-wallet"}
          className="mt-4 w-full rounded-lg bg-indigo-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-deep disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Connect Wallet
        </button>
      )}

      {status === "connecting" && (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">Requesting accounts…</p>
      )}

      {(status === "connected" || status === "wrong-network" || status === "error") && address && (
        <div className="mt-4 space-y-3">
          <Row label="Address" value={shortAddress(address)} mono />
          <Row
            label="Chain ID"
            value={chainId === null ? "—" : String(chainId)}
            mono
          />

          {status === "wrong-network" && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <p className="mb-2">
                Connected wallet is on chain {chainId ?? "unknown"}, not CC3 Testnet ({CC3_TESTNET_CHAIN_ID}).
              </p>
              <button
                onClick={switchToCC3Testnet}
                className="rounded-md bg-amber-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 dark:bg-amber-200 dark:text-amber-950"
              >
                Switch to CC3 Testnet
              </button>
            </div>
          )}

          {status === "connected" && reading && (
            <>
              <Row label="Balance" value={`${formatTctc(reading.balanceWei)} tCTC`} mono />
              <Row label="Latest block" value={String(reading.blockNumber)} mono />
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                Read live from your wallet&apos;s RPC connection at{" "}
                {new Date(reading.fetchedAt).toLocaleTimeString()}.
              </p>
              <button
                onClick={refresh}
                className="w-full rounded-lg border border-black/10 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Refresh
              </button>
            </>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          <button
            onClick={disconnect}
            className="w-full rounded-lg px-4 py-2 text-sm font-medium text-zinc-500 transition hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className={mono ? "font-mono text-zinc-900 dark:text-zinc-100" : "text-zinc-900 dark:text-zinc-100"}>
        {value}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    "no-wallet": "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    disconnected: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
    connecting: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    connected: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    "wrong-network": "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    error: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  };

  const labels: Record<string, string> = {
    "no-wallet": "No wallet",
    disconnected: "Disconnected",
    connecting: "Connecting…",
    connected: "Connected",
    "wrong-network": "Wrong network",
    error: "Error",
  };

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[status] ?? styles.disconnected}`}>
      {labels[status] ?? status}
    </span>
  );
}

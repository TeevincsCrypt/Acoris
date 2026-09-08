"use client";

import { useState } from "react";

import { CC3_TESTNET_CHAIN_ID } from "@/lib/creditcoin";
import { shortAddress, useWallet } from "@/lib/wallet-context";

/**
 * The nav's wallet control, shown on every route except the landing page
 * (which carries the full WalletPanel instead). It renders the real wallet
 * state from WalletProvider — there is no cosmetic "connected" state here;
 * every label below is driven by an actual EIP-1193 result.
 */
export function NavWalletButton() {
  const { status, address, chainId, error, connect, disconnect, switchToCC3Testnet } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);

  if (status === "no-wallet") {
    return (
      <span
        title="No EIP-1193 wallet detected. Install MetaMask (or another injected wallet) to connect."
        className="shrink-0 cursor-not-allowed rounded-full border border-ink/10 px-4 py-2 text-[13px] font-medium text-ink-mute"
      >
        No wallet
      </span>
    );
  }

  if (status === "connecting") {
    return (
      <span className="shrink-0 rounded-full bg-ink/5 px-5 py-2 text-[13px] font-medium text-ink-soft">
        Connecting…
      </span>
    );
  }

  if (status === "wrong-network") {
    return (
      <button
        onClick={switchToCC3Testnet}
        title={`Connected to chain ${chainId ?? "unknown"}, not CC3 Testnet (${CC3_TESTNET_CHAIN_ID}).`}
        className="shrink-0 rounded-full bg-amber-500 px-5 py-2 text-[13px] font-medium text-amber-950 transition-colors hover:bg-amber-400"
      >
        Switch network
      </button>
    );
  }

  if (address && (status === "connected" || status === "error")) {
    return (
      <div className="relative shrink-0">
        <button
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className="flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-ink/5"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${status === "error" ? "bg-red-500" : "bg-violet"}`}
            aria-hidden
          />
          <span className="font-mono text-xs">{shortAddress(address)}</span>
        </button>

        {menuOpen && (
          <>
            {/* Click-catcher, so dismissing needs no document-level listener. */}
            <button
              aria-label="Close wallet menu"
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-40 cursor-default"
            />
            <div
              role="menu"
              className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-ink/10 bg-white p-3 shadow-lg"
            >
              <p className="text-[11px] uppercase tracking-wider text-ink-mute">Connected account</p>
              <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-ink">{address}</p>
              <p className="mt-2 text-xs text-ink-soft">
                Chain <span className="font-mono">{chainId ?? "—"}</span>
                {chainId === CC3_TESTNET_CHAIN_ID ? " · CC3 Testnet" : ""}
              </p>
              {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
              <button
                onClick={() => {
                  disconnect();
                  setMenuOpen(false);
                }}
                className="mt-3 w-full rounded-lg border border-ink/10 px-3 py-2 text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5"
              >
                Disconnect
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // "disconnected", or an error that left us without an account.
  return (
    <button onClick={connect} className="acoris-btn shrink-0 px-5 py-2 text-[13px]">
      Connect wallet
    </button>
  );
}

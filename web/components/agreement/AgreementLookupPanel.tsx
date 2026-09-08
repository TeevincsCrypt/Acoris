"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { LoanLifecycle } from "@/components/negotiation/LoanLifecycle";
import { computeLoanHash, isLoanRegistryDeployed, LOAN_REGISTRY_ADDRESS } from "@/lib/loan-contract";

const LOAN_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/** Accepts either the loanHash itself, or the negotiationId it was derived from (same hashing computeLoanHash uses). */
export function resolveLoanHash(input: string): string | null {
  const trimmed = input.trim();
  if (LOAN_HASH_PATTERN.test(trimmed)) return trimmed;
  if (trimmed.length > 0) return computeLoanHash(trimmed);
  return null;
}

/**
 * The one place anyone — borrower or lender, on any device, with no prior
 * app state — can find a specific on-chain agreement and act on it. Before
 * this existed, "review and fund" only worked if the lender happened to be
 * looking at the exact same browser tab the negotiation ran in: negotiationId
 * was never in the URL, and /dashboard only ever queries by the connected
 * wallet as borrower. AcorisLoanRegistry itself is the real source of truth
 * here — this panel does nothing but resolve an id to a loanHash and hand it
 * to LoanLifecycle, which reads the chain directly.
 */
export function AgreementLookupPanel() {
  const searchParams = useSearchParams();
  const fromUrl = searchParams.get("loanHash");

  const [input, setInput] = useState(fromUrl ?? "");
  const [activeLoanHash, setActiveLoanHash] = useState<string | null>(resolveLoanHash(fromUrl ?? ""));

  const deployed = isLoanRegistryDeployed();

  if (!deployed) {
    return (
      <div className="acoris-card w-full max-w-2xl p-6 text-sm text-ink-soft">
        AcorisLoanRegistry is not deployed on CC3 Testnet in this environment (
        <code className="font-mono text-xs">NEXT_PUBLIC_LOAN_REGISTRY_ADDRESS</code> is unset) — there is nothing to
        look up yet. See docs/ACORIS_LOAN_CONTRACT.md.
      </div>
    );
  }

  function handleLookup() {
    setActiveLoanHash(resolveLoanHash(input));
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <section className="acoris-card p-6">
        <h2 className="acoris-eyebrow">Find an agreement</h2>
        <p className="mt-2 text-xs text-ink-soft">
          Paste the loan link a borrower sent you, the loanHash itself, or the negotiationId it came from. Registry
          at <span className="font-mono">{LOAN_REGISTRY_ADDRESS}</span>.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLookup()}
            placeholder="0x… loanHash, or a negotiationId"
            className="flex-1 rounded-lg border border-ink/10 bg-transparent px-3 py-2 font-mono text-xs"
          />
          <button onClick={handleLookup} disabled={input.trim().length === 0} className="acoris-btn px-5 py-2 text-[13px] disabled:cursor-not-allowed disabled:opacity-40">
            Look up
          </button>
        </div>
      </section>

      {activeLoanHash && (
        <section className="acoris-card p-6">
          <h2 className="acoris-eyebrow">Agreement</h2>
          <p className="mt-1 break-all font-mono text-[11px] text-ink-mute">{activeLoanHash}</p>
          <LoanLifecycle loanHash={activeLoanHash} />
        </section>
      )}
    </div>
  );
}

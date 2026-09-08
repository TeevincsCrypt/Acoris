"use client";

import { useEffect, useState } from "react";

import { useWallet } from "@/lib/wallet-context";
import {
  AgreementStatus,
  computeLoanHash,
  getAgreement,
  isLoanRegistryDeployed,
  LOAN_REGISTRY_ADDRESS,
  proposeAgreementOnChain,
} from "@/lib/loan-contract";
import type { LoanTerms } from "@/lib/negotiation/types";
import { TransactionProof } from "@/components/TransactionProof";

import { LoanLifecycle } from "./LoanLifecycle";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

/**
 * Phase 4: executes the negotiated agreement on Creditcoin CC3 Testnet by
 * calling AcorisLoanRegistry.proposeAgreement with the borrower's own
 * connected wallet (see lib/wallet-context.tsx), escrowing collateral and
 * recording the deal on-chain. Genuinely disabled — not just visually —
 * until NEXT_PUBLIC_LOAN_REGISTRY_ADDRESS is actually set to a deployed
 * contract; see docs/ACORIS_LOAN_CONTRACT.md for why that isn't the case
 * in this project's sandbox (no funded deployer key, no network access to
 * CC3 Testnet).
 *
 * Phase 3B follow-up: once a proposal exists on-chain (either just made
 * here, or found on mount — e.g. the page was reloaded but this
 * negotiationId's loanHash was already proposed in an earlier session),
 * control hands off to LoanLifecycle for the rest of the real lifecycle
 * (fund / repay / mark defaulted / cancel), reading the deployed contract
 * directly as the source of truth rather than tracking status locally.
 */
export function ExecuteOnCreditcoin({ negotiationId, finalTerms }: { negotiationId: string; finalTerms: LoanTerms }) {
  const wallet = useWallet();
  const [lenderAddress, setLenderAddress] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [alreadyProposed, setAlreadyProposed] = useState(false);

  const loanHash = computeLoanHash(negotiationId);
  const deployed = isLoanRegistryDeployed();

  useEffect(() => {
    if (!deployed || finalTerms.status !== "accepted" || wallet.status !== "connected") return;
    let cancelled = false;
    void (async () => {
      try {
        const signer = await wallet.getSigner();
        const agreement = await getAgreement(signer, loanHash);
        if (!cancelled && agreement.status !== AgreementStatus.None) {
          setAlreadyProposed(true);
        }
      } catch {
        // Best-effort existence check — on failure, the propose form below remains the fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deployed, finalTerms.status, wallet, loanHash]);

  if (finalTerms.status !== "accepted") {
    return (
      <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-600">
        Nothing to execute — this negotiation ended as {finalTerms.status.toUpperCase()}, not an accepted agreement.
      </p>
    );
  }

  if (!deployed) {
    return (
      <button
        disabled
        title="Phase 4: AcorisLoanRegistry is not deployed on CC3 Testnet in this environment (no funded key, no network access — see docs/ACORIS_LOAN_CONTRACT.md)"
        className="mt-4 w-full cursor-not-allowed rounded-lg border border-black/10 px-4 py-2.5 text-sm font-medium text-zinc-400 dark:border-white/10 dark:text-zinc-600"
      >
        Execute on Creditcoin — not yet executable (Phase 4: contract not deployed)
      </button>
    );
  }

  if (state === "success" || alreadyProposed) {
    return (
      <div className="mt-4 space-y-2">
        {state === "success" && txHash && <TransactionProof txHash={txHash} label="Proposed on-chain — collateral escrowed" />}
        <LoanLifecycle loanHash={loanHash} />
      </div>
    );
  }

  const walletReady = wallet.status === "connected";
  const validLender = ADDRESS_PATTERN.test(lenderAddress);
  const canExecute = walletReady && validLender && state !== "submitting";

  async function handleExecute() {
    setState("submitting");
    setErrorMessage(null);
    try {
      const signer = await wallet.getSigner();
      const tx = await proposeAgreementOnChain(signer, {
        loanHash,
        lenderAddress,
        principalDealUnits: finalTerms.amount,
        collateralDealUnits: finalTerms.collateral,
        aprPercent: finalTerms.apr,
        durationDays: finalTerms.duration,
      });
      const receipt = await tx.wait();
      setTxHash(receipt?.hash ?? tx.hash);
      setState("success");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Transaction failed");
      setState("error");
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-600">
        Borrower → requests credit
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Registry deployed at <span className="font-mono">{LOAN_REGISTRY_ADDRESS}</span>. Proposing escrows your
        collateral on-chain from your connected wallet.
      </p>
      {!walletReady && (
        <p className="text-xs text-amber-600 dark:text-amber-400">Connect a wallet on CC3 Testnet to execute.</p>
      )}
      <label className="block text-xs text-zinc-500 dark:text-zinc-400">
        Lender wallet address — the account that will review and fund this loan
      </label>
      <input
        value={lenderAddress}
        onChange={(e) => setLenderAddress(e.target.value)}
        placeholder="0x…"
        className="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 font-mono text-xs dark:border-white/10"
      />
      <button
        onClick={handleExecute}
        disabled={!canExecute}
        className="w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        {state === "submitting" ? "Submitting…" : "Propose Agreement On-Chain"}
      </button>
      {state === "error" && (
        <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

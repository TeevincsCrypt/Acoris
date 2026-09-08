"use client";

import { isLoanRegistryDeployed } from "@/lib/loan-contract";
import { useWallet } from "@/lib/wallet-context";

export type EvidenceMode = "none" | "unverified" | "verify" | "onchain";

export const MAX_TX_HASHES = 10;
export const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

/** True once the current selection has everything it needs to actually resolve evidence server-side. */
export function canResolveEvidence(input: { mode: EvidenceMode; borrowerAddress: string }): boolean {
  if (input.mode !== "onchain") return true;
  return isLoanRegistryDeployed() && ADDRESS_PATTERN.test(input.borrowerAddress.trim());
}

interface EvidenceModeSelectorProps {
  mode: EvidenceMode;
  onModeChange: (mode: EvidenceMode) => void;
  txHashes: string[];
  onTxHashesChange: (hashes: string[]) => void;
  claimedSummary: string;
  onClaimedSummaryChange: (v: string) => void;
  borrowerAddress: string;
  onBorrowerAddressChange: (v: string) => void;
}

/**
 * The one place a caller picks how the server should resolve verified
 * evidence: real Sepolia repayments (via Phase 2's Attestcoin pipeline),
 * real native CC3 on-chain loan history, an explicitly-unverified
 * self-reported claim, or none at all. Shared between the negotiation
 * console and the standalone credit profile — both send the exact same
 * `financialEvidence` shape to the server, which independently re-derives
 * evidence from it; nothing "verified" is ever accepted from the client.
 */
export function EvidenceModeSelector({
  mode,
  onModeChange,
  txHashes,
  onTxHashesChange,
  claimedSummary,
  onClaimedSummaryChange,
  borrowerAddress,
  onBorrowerAddressChange,
}: EvidenceModeSelectorProps) {
  const wallet = useWallet();

  function updateTxHash(index: number, value: string) {
    onTxHashesChange(txHashes.map((h, i) => (i === index ? value : h)));
  }
  function addTxHashField() {
    if (txHashes.length >= MAX_TX_HASHES) return;
    onTxHashesChange([...txHashes, ""]);
  }
  function removeTxHashField(index: number) {
    if (txHashes.length <= 1) return;
    onTxHashesChange(txHashes.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <label className="flex items-center gap-2">
        <input type="radio" checked={mode === "verify"} onChange={() => onModeChange("verify")} />
        Verify real Sepolia repayment transaction(s) via Attestcoin
      </label>
      {mode === "verify" && (
        <div className="ml-6 flex flex-col gap-1.5">
          {txHashes.map((hash, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={hash}
                onChange={(e) => updateTxHash(i, e.target.value)}
                className="flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-1.5 font-mono text-xs dark:border-white/10"
                placeholder="0x… Sepolia transaction hash"
              />
              {txHashes.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeTxHashField(i)}
                  className="text-xs text-zinc-400 hover:text-red-500"
                  aria-label="Remove transaction hash"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {txHashes.length < MAX_TX_HASHES && (
            <button
              type="button"
              onClick={addTxHashField}
              className="self-start text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              + Add another transaction
            </button>
          )}
        </div>
      )}

      <label className="flex items-center gap-2">
        <input type="radio" checked={mode === "onchain"} onChange={() => onModeChange("onchain")} />
        Use native CC3 on-chain loan history (AcorisLoanRegistry)
      </label>
      {mode === "onchain" && (
        <div className="ml-6 flex flex-col gap-1.5">
          {!isLoanRegistryDeployed() ? (
            <p className="text-xs text-zinc-400 dark:text-zinc-600">
              AcorisLoanRegistry is not deployed on CC3 Testnet in this environment (see
              docs/ACORIS_LOAN_CONTRACT.md) — this evidence source has nothing to read yet.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <input
                  value={borrowerAddress}
                  onChange={(e) => onBorrowerAddressChange(e.target.value)}
                  className="flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-1.5 font-mono text-xs dark:border-white/10"
                  placeholder="0x… borrower wallet address"
                />
                {wallet.status === "connected" && wallet.address && (
                  <button
                    type="button"
                    onClick={() => onBorrowerAddressChange(wallet.address as string)}
                    className="whitespace-nowrap text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    Use connected wallet
                  </button>
                )}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Reads this borrower&apos;s repaid/defaulted agreements directly from CC3 Testnet — due dates and
                on-time repayment are computed from real on-chain timestamps, not just one transaction.
              </p>
            </>
          )}
        </div>
      )}

      <label className="flex items-center gap-2">
        <input type="radio" checked={mode === "unverified"} onChange={() => onModeChange("unverified")} />
        Self-reported claim only (not verified)
      </label>
      {mode === "unverified" && (
        <input
          value={claimedSummary}
          onChange={(e) => onClaimedSummaryChange(e.target.value)}
          className="ml-6 rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-xs dark:border-white/10"
          placeholder="e.g. I've repaid loans before (unverified)"
        />
      )}
      <label className="flex items-center gap-2">
        <input type="radio" checked={mode === "none"} onChange={() => onModeChange("none")} />
        No financial evidence
      </label>
    </div>
  );
}

/** Builds the exact `financialEvidence` request body the server expects from the current selection. */
export function buildFinancialEvidence(input: {
  mode: EvidenceMode;
  txHashes: string[];
  claimedSummary: string;
  borrowerAddress: string;
}) {
  if (input.mode === "verify") {
    return { mode: "verify" as const, transactionHashes: input.txHashes.map((h) => h.trim()).filter((h) => h.length > 0) };
  }
  if (input.mode === "unverified") {
    return { mode: "unverified" as const, claimedSummary: input.claimedSummary.trim() || undefined };
  }
  if (input.mode === "onchain") {
    return { mode: "onchain" as const, borrowerAddress: input.borrowerAddress.trim() };
  }
  return { mode: "none" as const };
}

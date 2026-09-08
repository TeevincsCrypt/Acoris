"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatEther } from "ethers";

import { useWallet } from "@/lib/wallet-context";
import {
  AgreementStatus,
  cancelProposalOnChain,
  fundAgreementOnChain,
  getAgreement,
  getRepaymentAmountOnChain,
  markDefaultedOnChain,
  repayOnChain,
  type OnChainAgreement,
} from "@/lib/loan-contract";
import { TransactionProof } from "@/components/TransactionProof";
import type { VerifiedFinancialProfile } from "@/lib/negotiation/types";
import { LifecycleStepper, type LifecycleStage } from "./LifecycleStepper";

async function fetchCreditProfile(borrowerAddress: string): Promise<VerifiedFinancialProfile | null> {
  try {
    const res = await fetch("/api/credit-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ financialEvidence: { mode: "onchain", borrowerAddress } }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data as { profile: VerifiedFinancialProfile }).profile;
  } catch {
    return null;
  }
}

function successfulRepaymentsOf(profile: VerifiedFinancialProfile | null): number {
  return profile?.status === "verified" ? profile.successfulRepaymentCount : 0;
}

function verifiedVolumeOf(profile: VerifiedFinancialProfile | null): bigint {
  return profile?.status === "verified" ? BigInt(profile.verifiedRepaymentVolume) : BigInt(0);
}

/** Polling interval while the agreement is still in a non-terminal state — picks up actions taken by the counterparty in another browser. */
const POLL_MS = 20000;

const STATUS_LABEL: Record<AgreementStatus, string> = {
  [AgreementStatus.None]: "NOT FOUND",
  [AgreementStatus.Proposed]: "PROPOSED",
  [AgreementStatus.Funded]: "FUNDED",
  [AgreementStatus.Repaid]: "REPAID",
  [AgreementStatus.Defaulted]: "DEFAULTED",
  [AgreementStatus.Cancelled]: "CANCELLED",
};

const STATUS_STYLE: Record<AgreementStatus, string> = {
  [AgreementStatus.None]: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  [AgreementStatus.Proposed]: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  [AgreementStatus.Funded]: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  [AgreementStatus.Repaid]: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  [AgreementStatus.Defaulted]: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  [AgreementStatus.Cancelled]: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a) && Boolean(b) && a!.toLowerCase() === b!.toLowerCase();
}

function toLifecycleStage(status: AgreementStatus): LifecycleStage | null {
  switch (status) {
    case AgreementStatus.Proposed:
      return "proposed";
    case AgreementStatus.Funded:
      return "funded";
    case AgreementStatus.Repaid:
      return "repaid";
    case AgreementStatus.Cancelled:
      return "cancelled";
    case AgreementStatus.Defaulted:
      return "defaulted";
    default:
      return null;
  }
}

/**
 * Tracks and drives one on-chain agreement's real lifecycle
 * (Proposed -> Funded -> Repaid/Defaulted, or Proposed -> Cancelled) by
 * reading AcorisLoanRegistry directly and exposing exactly the actions the
 * connected wallet is actually entitled to take next. Every action is a
 * real transaction against the deployed contract — no simulated state
 * transitions; a genuine on-chain read (getAgreement) is always the source
 * of truth for what's shown.
 */
export function LoanLifecycle({ loanHash }: { loanHash: string }) {
  const wallet = useWallet();
  const [agreement, setAgreement] = useState<OnChainAgreement | null>(null);
  const [repaymentOwed, setRepaymentOwed] = useState<bigint | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<"idle" | "submitting" | "error">("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [creditBefore, setCreditBefore] = useState<VerifiedFinancialProfile | null>(null);
  const [creditAfter, setCreditAfter] = useState<VerifiedFinancialProfile | null>(null);
  const [repaidAmountWei, setRepaidAmountWei] = useState<bigint | null>(null);
  const [creditSnapshotTaken, setCreditSnapshotTaken] = useState(false);
  const creditSnapshotStarted = useRef(false);

  const load = useCallback(async () => {
    if (wallet.status !== "connected") return;
    try {
      const signer = await wallet.getSigner();
      const a = await getAgreement(signer, loanHash);
      setAgreement(a);
      setLoadError(null);
      if (a.status === AgreementStatus.Funded) {
        setRepaymentOwed(await getRepaymentAmountOnChain(signer, loanHash));
      } else {
        setRepaymentOwed(null);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to read agreement from chain");
    }
  }, [wallet, loanHash]);

  useEffect(() => {
    if (wallet.status !== "connected") return;
    let cancelled = false;
    void (async () => {
      try {
        const signer = await wallet.getSigner();
        const a = await getAgreement(signer, loanHash);
        if (cancelled) return;
        setAgreement(a);
        setLoadError(null);
        if (a.status === AgreementStatus.Funded) {
          const owed = await getRepaymentAmountOnChain(signer, loanHash);
          if (!cancelled) setRepaymentOwed(owed);
        } else {
          setRepaymentOwed(null);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to read agreement from chain");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet, loanHash]);

  useEffect(() => {
    if (!agreement) return;
    if (agreement.status === AgreementStatus.Repaid || agreement.status === AgreementStatus.Defaulted || agreement.status === AgreementStatus.Cancelled) {
      return;
    }
    const interval = setInterval(() => {
      setNow(Date.now());
      void load();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [agreement, load]);

  // One-time real snapshot of the borrower's verified credit profile, taken
  // as soon as the agreement (and the connected wallet's role) is known —
  // this is what "before" gets compared against once a real repayment
  // actually completes below. Never re-taken after the first successful
  // read, so it stays a genuine "before" baseline rather than drifting.
  useEffect(() => {
    if (!agreement || creditSnapshotTaken || creditSnapshotStarted.current) return;
    if (!sameAddress(wallet.address, agreement.borrower)) return;
    creditSnapshotStarted.current = true;
    void (async () => {
      const profile = await fetchCreditProfile(agreement.borrower);
      setCreditSnapshotTaken(true);
      setCreditBefore(profile);
    })();
  }, [agreement, wallet.address, creditSnapshotTaken]);

  async function runAction(action: () => Promise<{ wait: () => Promise<{ hash: string } | null>; hash: string }>): Promise<boolean> {
    setActionState("submitting");
    setActionError(null);
    try {
      const tx = await action();
      const receipt = await tx.wait();
      setLastTxHash(receipt?.hash ?? tx.hash);
      setActionState("idle");
      await load();
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Transaction failed");
      setActionState("error");
      return false;
    }
  }

  async function handleRepay() {
    const amountBeingRepaid = repaymentOwed;
    const success = await runAction(async () => repayOnChain(await wallet.getSigner(), loanHash));
    if (success && agreement) {
      setRepaidAmountWei(amountBeingRepaid);
      const after = await fetchCreditProfile(agreement.borrower);
      setCreditAfter(after);
    }
  }

  if (wallet.status !== "connected") {
    return (
      <p className="mt-4 text-xs text-amber-600 dark:text-amber-400">
        Connect a wallet on CC3 Testnet to view and manage this agreement&apos;s on-chain status.
      </p>
    );
  }

  if (loadError) {
    return (
      <div className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
        Could not read this agreement from CC3 Testnet: {loadError}
      </div>
    );
  }

  if (!agreement || agreement.status === AgreementStatus.None) {
    return (
      <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-600">
        No on-chain agreement found for loanHash <span className="font-mono">{loanHash}</span> yet.
      </p>
    );
  }

  const isBorrower = sameAddress(wallet.address, agreement.borrower);
  const isLender = sameAddress(wallet.address, agreement.lender);
  const dueAt = agreement.fundedAt > 0 ? (agreement.fundedAt + agreement.durationSeconds) * 1000 : null;
  const isPastDue = dueAt !== null && now >= dueAt;
  const submitting = actionState === "submitting";

  const lifecycleStage = toLifecycleStage(agreement.status);

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          On-Chain Status
        </span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[agreement.status]}`}>
          {STATUS_LABEL[agreement.status]}
        </span>
      </div>

      {lifecycleStage && <LifecycleStepper current={lifecycleStage} />}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <Row label="Borrower" value={shorten(agreement.borrower)} you={isBorrower} role="requests credit, repays" />
        <Row label="Lender" value={shorten(agreement.lender)} you={isLender} role="reviews and funds" />
        <Row label="Principal" value={`${formatEther(agreement.principal)} tCTC`} />
        <Row label="Collateral" value={`${formatEther(agreement.collateral)} tCTC`} />
        <Row label="APR" value={`${(agreement.aprBps / 100).toFixed(2)}%`} />
        <Row label="Duration" value={`${Math.round(agreement.durationSeconds / 86400)} days`} />
        {dueAt !== null && <Row label="Due" value={`${new Date(dueAt).toLocaleString()}${isPastDue ? " (overdue)" : ""}`} />}
        {repaymentOwed !== null && <Row label="Owed to repay" value={`${formatEther(repaymentOwed)} tCTC`} />}
      </dl>

      {isBorrower && isLender && (
        <p className="text-xs text-zinc-400 dark:text-zinc-600">
          This wallet is acting as both borrower and lender (a single-wallet demo run) — in a real deal these would
          be two separate connected wallets.
        </p>
      )}
      {!isBorrower && !isLender && (
        <p className="text-xs text-zinc-400 dark:text-zinc-600">
          Connected wallet is neither the borrower nor the lender on this agreement — read-only.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {agreement.status === AgreementStatus.Proposed && isBorrower && (
          <ActionButton
            label="Cancel Proposal"
            disabled={submitting}
            onClick={() => runAction(async () => cancelProposalOnChain(await wallet.getSigner(), loanHash))}
          />
        )}
        {agreement.status === AgreementStatus.Proposed && isLender && (
          <ActionButton
            label={submitting ? "Funding…" : "Fund Agreement"}
            disabled={submitting}
            onClick={() => runAction(async () => fundAgreementOnChain(await wallet.getSigner(), loanHash, agreement.principal))}
          />
        )}
        {agreement.status === AgreementStatus.Funded && isBorrower && (
          <ActionButton label={submitting ? "Repaying…" : "Repay"} disabled={submitting} onClick={() => handleRepay()} />
        )}
        {agreement.status === AgreementStatus.Funded && isLender && isPastDue && (
          <ActionButton
            label={submitting ? "Claiming…" : "Mark Defaulted (claim collateral)"}
            disabled={submitting}
            onClick={() => runAction(async () => markDefaultedOnChain(await wallet.getSigner(), loanHash))}
          />
        )}
        <button
          type="button"
          onClick={() => void load()}
          disabled={submitting}
          className="rounded-lg border border-black/10 px-3 py-1.5 text-xs text-zinc-600 hover:bg-black/5 disabled:opacity-40 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/5"
        >
          Refresh
        </button>
      </div>

      {actionState === "error" && actionError && (
        <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{actionError}</p>
      )}
      {lastTxHash && actionState !== "error" && <TransactionProof txHash={lastTxHash} />}

      {agreement.status === AgreementStatus.Repaid && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          Repaid in full. Lender received principal + interest, borrower&apos;s collateral was returned.
        </p>
      )}

      {creditAfter && (
        <div className="rounded-lg border border-emerald-600/20 bg-emerald-50 p-3 text-xs dark:border-emerald-400/20 dark:bg-emerald-950">
          <p className="text-sm font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Loan repaid ✓
          </p>
          <dl className="mt-2 space-y-1 text-emerald-900 dark:text-emerald-100">
            <div className="flex justify-between">
              <dt>Borrowed</dt>
              <dd className="font-mono">{formatEther(agreement.principal)} tCTC</dd>
            </div>
            {repaidAmountWei !== null && (
              <div className="flex justify-between">
                <dt>Repaid (principal + interest)</dt>
                <dd className="font-mono">{formatEther(repaidAmountWei)} tCTC</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt>Duration</dt>
              <dd className="font-mono">{Math.round(agreement.durationSeconds / 86400)} days</dd>
            </div>
          </dl>
          <p className="mt-3 font-semibold text-emerald-700 dark:text-emerald-300">
            Your verified credit history has been updated.
          </p>
          <dl className="mt-1 space-y-1 text-emerald-900 dark:text-emerald-100">
            <div className="flex justify-between">
              <dt>Successful repayments</dt>
              <dd className="font-mono">
                {successfulRepaymentsOf(creditBefore)} → {successfulRepaymentsOf(creditAfter)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Verified repayment volume</dt>
              <dd className="font-mono">
                {formatEther(verifiedVolumeOf(creditBefore))} → {formatEther(verifiedVolumeOf(creditAfter))} tCTC
              </dd>
            </div>
          </dl>
        </div>
      )}
      {agreement.status === AgreementStatus.Defaulted && (
        <p className="text-xs text-red-600 dark:text-red-400">
          Defaulted — the lender claimed the borrower&apos;s escrowed collateral after the due date passed.
        </p>
      )}
      {agreement.status === AgreementStatus.Cancelled && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Proposal was cancelled before funding; collateral was returned to the borrower.
        </p>
      )}
    </div>
  );
}

function ActionButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg bg-indigo-ink px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-deep disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
    >
      {label}
    </button>
  );
}

function Row({ label, value, you, role }: { label: string; value: string; you?: boolean; role?: string }) {
  return (
    <>
      <dt className="text-zinc-500 dark:text-zinc-400">
        {label}
        {role && <span className="block font-sans text-[10px] normal-case text-zinc-400 dark:text-zinc-600">{role}</span>}
      </dt>
      <dd className="text-right font-mono text-zinc-900 dark:text-zinc-100">
        {value}
        {you && <span className="ml-1 font-sans text-zinc-400 dark:text-zinc-600">(you)</span>}
      </dd>
    </>
  );
}

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

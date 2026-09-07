/**
 * Builds a VerifiedFinancialProfile strictly from genuine verified evidence.
 * Never invents numbers: only evidence that was actually cryptographically
 * or on-chain verified is aggregated. No evidence at all (from any source)
 * yields `{status: "not-available"}`.
 *
 * Two evidence sources exist so far:
 *   - evidenceFromAttestcoinResults: cross-chain (e.g. Sepolia) repayments,
 *     verified via Phase 2's Attestcoin pipeline (lib/attestcoin.ts). Its
 *     fact shape carries no due-date, so this evidence always has
 *     `onTime: null`.
 *   - evidenceFromOnChainTimelines (lib/negotiation/onchain-history.ts):
 *     native CC3 AcorisLoanRegistry history, read directly from CC3 state
 *     (same-chain, no cross-chain proof needed). This evidence has a real
 *     `onTime` boolean whenever the loan has both a funded-at and a
 *     repaid-at timestamp.
 *
 * buildVerifiedFinancialProfile aggregates whatever evidence it's given —
 * from one source or merged from several — into one profile.
 */

import type { AttestcoinVerificationResult } from "@/lib/attestcoin";
import type { VerificationEvidenceRef, VerifiedFinancialProfile } from "./types";

export function evidenceFromAttestcoinResults(
  results: AttestcoinVerificationResult[] | undefined | null,
): VerificationEvidenceRef[] {
  const genuine = (results ?? []).filter(
    (r): r is AttestcoinVerificationResult & { fact: NonNullable<AttestcoinVerificationResult["fact"]> } =>
      r.ok === true && r.fact != null && r.sourceChain != null && r.sourceBlockHeight != null,
  );

  return genuine.map((r) => ({
    sourceChain: r.sourceChain!.chainName,
    transactionHash: r.transactionHash,
    blockHeight: r.sourceBlockHeight!,
    verified: true,
    amountWei: r.fact.loanEvent.amountWei,
    status: r.fact.transactionStatus,
    // The Attestcoin fact shape (lib/attestcoin.ts VerifiedRepayLoanFact) carries
    // no due-date, so on-time-ness isn't derivable from it — null, never invented.
    onTime: null,
  }));
}

export function buildVerifiedFinancialProfile(evidence: VerificationEvidenceRef[]): VerifiedFinancialProfile {
  if (evidence.length === 0) {
    return { status: "not-available" };
  }

  const successfulRepaymentCount = evidence.filter((e) => e.status === "success").length;
  const failedRepaymentCount = evidence.filter((e) => e.status === "failed").length;

  const totalVolume = evidence.reduce((sum, e) => sum + BigInt(e.amountWei), BigInt(0));

  const mostRecent = evidence.reduce((latest, e) => (e.blockHeight > latest.blockHeight ? e : latest));

  const determinedOnTime = evidence.filter((e) => e.onTime !== null);
  const onTimeRepaymentRate =
    determinedOnTime.length === 0
      ? null
      : determinedOnTime.filter((e) => e.onTime === true).length / determinedOnTime.length;

  return {
    status: "verified",
    verifiedRepaymentCount: evidence.length,
    verifiedRepaymentVolume: totalVolume.toString(),
    successfulRepaymentCount,
    failedRepaymentCount,
    onTimeRepaymentRate,
    mostRecentVerifiedActivity: `${mostRecent.sourceChain} block ${mostRecent.blockHeight}`,
    sourceChains: Array.from(new Set(evidence.map((e) => e.sourceChain))),
    verificationEvidence: evidence,
  };
}

/** Convenience: builds a profile directly from Phase 2 Attestcoin results, as before this refactor. */
export function buildVerifiedFinancialProfileFromAttestcoin(
  results: AttestcoinVerificationResult[] | undefined | null,
): VerifiedFinancialProfile {
  return buildVerifiedFinancialProfile(evidenceFromAttestcoinResults(results));
}

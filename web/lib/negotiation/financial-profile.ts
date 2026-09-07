/**
 * Builds a VerifiedFinancialProfile strictly from genuine Phase 2 Attestcoin
 * verification results (lib/attestcoin.ts). Never invents numbers: a result
 * only counts as evidence when `ok === true` and it carries a decoded
 * `fact` — i.e. BlockProver actually verified the proof on-chain. Anything
 * else (no results supplied, or results that stopped short of verification)
 * yields `{status: "not-available"}`.
 */

import type { AttestcoinVerificationResult } from "@/lib/attestcoin";
import type { VerificationEvidenceRef, VerifiedFinancialProfile } from "./types";

export function buildVerifiedFinancialProfile(
  results: AttestcoinVerificationResult[] | undefined | null,
): VerifiedFinancialProfile {
  const genuine = (results ?? []).filter(
    (r): r is AttestcoinVerificationResult & { fact: NonNullable<AttestcoinVerificationResult["fact"]> } =>
      r.ok === true && r.fact != null && r.sourceChain != null && r.sourceBlockHeight != null,
  );

  if (genuine.length === 0) {
    return { status: "not-available" };
  }

  const evidence: VerificationEvidenceRef[] = genuine.map((r) => ({
    sourceChain: r.sourceChain!.chainName,
    transactionHash: r.transactionHash,
    blockHeight: r.sourceBlockHeight!,
    verified: true,
    amountWei: r.fact.loanEvent.amountWei,
    status: r.fact.transactionStatus,
  }));

  const successfulRepaymentCount = evidence.filter((e) => e.status === "success").length;
  const failedRepaymentCount = evidence.filter((e) => e.status === "failed").length;

  const totalVolume = evidence.reduce((sum, e) => sum + BigInt(e.amountWei), BigInt(0));

  const mostRecent = evidence.reduce((latest, e) => (e.blockHeight > latest.blockHeight ? e : latest));

  return {
    status: "verified",
    verifiedRepaymentCount: evidence.length,
    verifiedRepaymentVolume: totalVolume.toString(),
    successfulRepaymentCount,
    failedRepaymentCount,
    // The current Attestcoin fact shape (lib/attestcoin.ts VerifiedRepayLoanFact)
    // carries no due-date, so on-time-ness isn't derivable from it yet — null,
    // never invented. Populating this needs a due-date field added to the
    // verified fact itself in a future phase.
    onTimeRepaymentRate: null,
    mostRecentVerifiedActivity: `${mostRecent.sourceChain} block ${mostRecent.blockHeight}`,
    sourceChains: Array.from(new Set(evidence.map((e) => e.sourceChain))),
    verificationEvidence: evidence,
  };
}

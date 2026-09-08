/**
 * Derives human-readable "why these terms" explanations strictly from the
 * negotiation's own already-computed state (constraints.ts's derived
 * BorrowerConstraints/LenderConstraints, the VerifiedFinancialProfile that
 * actually priced the loan, and the real accepted round). Nothing here is
 * invented text — every sentence is built from a real number already
 * computed elsewhere and shown alongside the term it explains, so a reader
 * can check the explanation against the raw values themselves.
 *
 * Pure, no network, no LLM — unit-tested in tests/explain.unit.test.ts.
 */

import type { BorrowerConstraints, LenderConstraints, LoanTerms, NegotiationRound, VerifiedFinancialProfile } from "./types";

export interface TermExplanation {
  field: "amount" | "collateral" | "apr" | "duration";
  label: string;
  value: string;
  reason: string;
}

export interface NegotiationExplanation {
  /** Empty when finalTerms.status !== "accepted" — nothing to explain about terms that were never agreed. */
  terms: TermExplanation[];
  /** The real reasoning text from whichever round actually became the final terms — quoted verbatim, not paraphrased. */
  decidingRoundReasoning: string | null;
}

const EPSILON = 1e-6;

function explainApr(finalTerms: LoanTerms, lenderConstraints: LenderConstraints, financialProfile: VerifiedFinancialProfile): string {
  const atLenderFloor = finalTerms.apr <= lenderConstraints.minApr + EPSILON;

  if (financialProfile.status === "verified") {
    const evidenceNote = `${financialProfile.verifiedRepaymentCount} verified repayment${financialProfile.verifiedRepaymentCount === 1 ? "" : "s"}`;
    if (atLenderFloor) {
      return `Verified repayment history (${evidenceNote}) supported the lender's risk-adjusted minimum APR of ${lenderConstraints.minApr.toFixed(2)}% — the loan priced right at that floor.`;
    }
    return `Priced above the lender's risk-adjusted minimum of ${lenderConstraints.minApr.toFixed(2)}% (based on ${evidenceNote}); negotiated up from there during the exchange.`;
  }

  const statusNote = financialProfile.status === "unverified" ? "an unverified, self-reported claim (never treated as proof)" : "no financial evidence";
  if (atLenderFloor) {
    return `No verified financial history was available (${statusNote}), so the lender priced at its conservative baseline minimum APR of ${lenderConstraints.minApr.toFixed(2)}% for an unknown borrower.`;
  }
  return `Negotiated above the lender's conservative baseline minimum of ${lenderConstraints.minApr.toFixed(2)}% (no verified history was available — ${statusNote}).`;
}

function explainCollateral(finalTerms: LoanTerms, lenderConstraints: LenderConstraints): string {
  const ratio = finalTerms.amount > 0 ? finalTerms.collateral / finalTerms.amount : 0;
  const atLenderFloor = ratio <= lenderConstraints.minCollateralRatio + EPSILON;
  const requiredNote = `The lender required at least a ${lenderConstraints.minCollateralRatio.toFixed(2)}x collateral ratio for this principal and duration.`;
  if (atLenderFloor) {
    return `${requiredNote} The agreed collateral of ${finalTerms.collateral} is exactly ${ratio.toFixed(2)}x the ${finalTerms.amount} principal.`;
  }
  return `${requiredNote} The agreed collateral of ${finalTerms.collateral} is ${ratio.toFixed(2)}x the principal — above that floor.`;
}

function explainDuration(borrowerConstraints: BorrowerConstraints, lenderConstraints: LenderConstraints): string {
  return `Within the borrower's requested range of ${borrowerConstraints.minDurationDays}–${borrowerConstraints.maxDurationDays} days and the lender's maximum of ${lenderConstraints.maxDurationDays} days.`;
}

function explainAmount(finalTerms: LoanTerms, borrowerConstraints: BorrowerConstraints, lenderConstraints: LenderConstraints): string {
  const atLenderCap = finalTerms.amount >= lenderConstraints.maxAmount - EPSILON;
  if (atLenderCap) {
    return `At the lender's maximum for this deal (${lenderConstraints.maxAmount}), within the borrower's minimum acceptable amount of ${borrowerConstraints.minAmount}.`;
  }
  return `Within both the borrower's minimum acceptable amount (${borrowerConstraints.minAmount}) and the lender's maximum for this deal (${lenderConstraints.maxAmount}).`;
}

export function explainNegotiation(input: {
  finalTerms: LoanTerms;
  borrowerConstraints: BorrowerConstraints;
  lenderConstraints: LenderConstraints;
  financialProfileUsed: VerifiedFinancialProfile;
  rounds: NegotiationRound[];
}): NegotiationExplanation {
  if (input.finalTerms.status !== "accepted") {
    return { terms: [], decidingRoundReasoning: null };
  }

  const { finalTerms, borrowerConstraints, lenderConstraints, financialProfileUsed, rounds } = input;

  const terms: TermExplanation[] = [
    {
      field: "apr",
      label: "APR",
      value: `${finalTerms.apr}%`,
      reason: explainApr(finalTerms, lenderConstraints, financialProfileUsed),
    },
    {
      field: "collateral",
      label: "Collateral",
      value: String(finalTerms.collateral),
      reason: explainCollateral(finalTerms, lenderConstraints),
    },
    {
      field: "duration",
      label: "Duration",
      value: `${finalTerms.duration} days`,
      reason: explainDuration(borrowerConstraints, lenderConstraints),
    },
    {
      field: "amount",
      label: "Loan amount",
      value: String(finalTerms.amount),
      reason: explainAmount(finalTerms, borrowerConstraints, lenderConstraints),
    },
  ];

  const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : undefined;
  const decidingRoundReasoning = lastRound?.action === "ACCEPT" ? lastRound.reasoning : null;

  return { terms, decidingRoundReasoning };
}

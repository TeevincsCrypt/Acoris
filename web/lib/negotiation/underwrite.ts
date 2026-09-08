/**
 * The AI Credit Underwriter view's backing logic — pure, no LLM call.
 *
 * This is deliberately NOT an AI-generated "credit decision" with an
 * invented confidence score. Every number here is the same deterministic
 * math that already governs real loan pricing in constraints.ts
 * (deriveLenderConstraints / computeRiskDiscount), just narrated in plain
 * language so a borrower can see exactly why a lender would price them the
 * way it does. There is no field here that isn't either a direct input
 * (the evidence) or a real, reproducible function of that input — nothing
 * is estimated or guessed. If a number can't be honestly derived from real
 * evidence, it's simply not included (see the `null` cases below), rather
 * than filled in with a plausible-looking placeholder.
 */

import {
  computeRiskDiscount,
  DEFAULT_LENDER_RISK_POLICY,
  deriveLenderConstraints,
  type LenderRiskPolicy,
} from "./constraints";
import type { LenderConstraints, LoanRequest, VerifiedFinancialProfile } from "./types";

export interface UnderwritingReport {
  policyName: string;
  evidenceStatus: VerifiedFinancialProfile["status"];
  /** 0 (baseline pricing) .. 1 (best-case pricing) — always defined, 0 when there's nothing verified to discount from. */
  riskDiscount: number;
  /** Only present when evidenceStatus is "verified" — the two real, bounded scores riskDiscount is the product of. */
  scoreBreakdown: { countScore: number; reliabilityScore: number } | null;
  constraints: LenderConstraints;
  /** Ordered, plain-language lines, each citing a real number computed above — never a vague or invented claim. */
  reasoning: string[];
}

export function buildUnderwritingReport(input: {
  loanRequest: LoanRequest;
  financialProfile: VerifiedFinancialProfile;
  policy?: LenderRiskPolicy;
  policyName?: string;
}): UnderwritingReport {
  const policy = input.policy ?? DEFAULT_LENDER_RISK_POLICY;
  const policyName = input.policyName ?? "Default lender policy";
  const { financialProfile, loanRequest } = input;

  const { riskDiscount, countScore, reliabilityScore } = computeRiskDiscount(financialProfile);
  const constraints = deriveLenderConstraints(loanRequest, financialProfile, policy);

  const reasoning: string[] = [];

  if (financialProfile.status === "not-available") {
    reasoning.push("No verified financial evidence was supplied — priced at this lender's baseline, the same as any unknown borrower.");
  } else if (financialProfile.status === "unverified") {
    reasoning.push(
      "Only a self-reported, unverified claim was supplied. Unverified claims are never treated as evidence — priced at this lender's baseline exactly as if nothing had been supplied.",
    );
  } else {
    const total = financialProfile.successfulRepaymentCount + financialProfile.failedRepaymentCount;
    reasoning.push(
      `${financialProfile.verifiedRepaymentCount} verified repayment(s) on record (${financialProfile.successfulRepaymentCount} successful, ${financialProfile.failedRepaymentCount} failed).`,
    );
    reasoning.push(
      `Count score = min(${financialProfile.verifiedRepaymentCount} / 5, 1) = ${countScore!.toFixed(2)} — this score saturates at 5 verified repayments; more history beyond that doesn't earn further discount.`,
    );
    reasoning.push(
      total > 0
        ? `Reliability score = 1 − (${financialProfile.failedRepaymentCount} failed / ${total} total) = ${reliabilityScore!.toFixed(2)}.`
        : `Reliability score = ${reliabilityScore!.toFixed(2)} (no completed repayments to measure failure rate against yet).`,
    );
    reasoning.push(
      `Risk discount = count score × reliability score = ${riskDiscount.toFixed(2)} (0 = baseline pricing, 1 = this lender's best-case pricing).`,
    );
  }

  reasoning.push(
    `Minimum APR: ${policy.baseMinApr}% (baseline) moved toward ${policy.bestCaseMinApr}% (best case) by the risk discount → ${constraints.minApr.toFixed(2)}%.`,
  );
  reasoning.push(
    `Minimum collateral ratio: ${policy.baseMinCollateralRatio} (baseline) moved toward ${policy.bestCaseMinCollateralRatio} (best case) by the risk discount → ${constraints.minCollateralRatio.toFixed(3)}.`,
  );
  reasoning.push(
    `Maximum loan amount this lender would extend for this request: ${constraints.maxAmount} (the lesser of this lender's own cap and twice the requested amount).`,
  );

  return {
    policyName,
    evidenceStatus: financialProfile.status,
    riskDiscount,
    scoreBreakdown:
      financialProfile.status === "verified" ? { countScore: countScore!, reliabilityScore: reliabilityScore! } : null,
    constraints,
    reasoning,
  };
}

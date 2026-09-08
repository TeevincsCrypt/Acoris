/**
 * Credit Improvement Simulator — pure, no LLM call.
 *
 * Answers "how would my terms change?" using the exact same deterministic
 * pricing formula real negotiations use (constraints.ts's
 * deriveLenderConstraints / computeRiskDiscount) — never a fabricated
 * "future APR". Every projected number here is produced by feeding a
 * concrete, clearly-labeled hypothetical VerifiedFinancialProfile through
 * that real, unmodified function — the same computation a real negotiation
 * would run if that evidence actually existed. If a suggestion has nothing
 * useful to project (e.g. the borrower is already at best-case pricing),
 * it's presented with no projected numbers rather than an invented one.
 */

import {
  computeRiskDiscount,
  DEFAULT_LENDER_RISK_POLICY,
  deriveLenderConstraints,
  type LenderRiskPolicy,
} from "./constraints";
import type { LenderConstraints, LoanRequest, VerifiedFinancialProfile, VerifiedProfile } from "./types";

export interface ImprovementSuggestion {
  title: string;
  detail: string;
  /**
   * Only present when this suggestion supports a concrete hypothetical —
   * the real deriveLenderConstraints output for a specific, stated
   * hypothetical evidence change. Never present as a guess.
   */
  projected?: {
    hypothesis: string;
    constraints: LenderConstraints;
    riskDiscount: number;
  };
}

function projectVerified(
  loanRequest: LoanRequest,
  base: VerifiedProfile,
  overrides: Partial<Pick<VerifiedProfile, "verifiedRepaymentCount" | "successfulRepaymentCount" | "failedRepaymentCount">>,
  policy: LenderRiskPolicy,
): { constraints: LenderConstraints; riskDiscount: number } {
  const hypothetical: VerifiedProfile = { ...base, ...overrides };
  const { riskDiscount } = computeRiskDiscount(hypothetical);
  const constraints = deriveLenderConstraints(loanRequest, hypothetical, policy);
  return { constraints, riskDiscount };
}

export function buildImprovementSuggestions(input: {
  loanRequest: LoanRequest;
  financialProfile: VerifiedFinancialProfile;
  policy?: LenderRiskPolicy;
}): ImprovementSuggestion[] {
  const { loanRequest, financialProfile } = input;
  const policy = input.policy ?? DEFAULT_LENDER_RISK_POLICY;
  const suggestions: ImprovementSuggestion[] = [];

  if (financialProfile.status === "not-available") {
    const hypothetical: VerifiedProfile = {
      status: "verified",
      verifiedRepaymentCount: 1,
      verifiedRepaymentVolume: "0",
      successfulRepaymentCount: 1,
      failedRepaymentCount: 0,
      onTimeRepaymentRate: null,
      mostRecentVerifiedActivity: "hypothetical",
      sourceChains: [],
      verificationEvidence: [],
    };
    const { constraints, riskDiscount } = projectVerified(loanRequest, hypothetical, {}, policy);
    suggestions.push({
      title: "Verify a real repayment",
      detail:
        "No financial evidence has been supplied yet, so pricing sits at this lender's baseline. Verifying even one real, successful repayment (via Attestcoin, or native CC3 loan history) moves pricing off the baseline.",
      projected: {
        hypothesis: "If you verify exactly 1 successful repayment (0 failed):",
        constraints,
        riskDiscount,
      },
    });
    return suggestions;
  }

  if (financialProfile.status === "unverified") {
    suggestions.push({
      title: "Convert your claim into verified evidence",
      detail:
        "A self-reported claim is never priced as verified history, by design — it's treated exactly like having no evidence at all. Bring a real transaction hash or on-chain history instead; the server independently re-verifies it before it can affect pricing.",
    });
    return suggestions;
  }

  // status === "verified"
  const { riskDiscount, countScore, reliabilityScore } = computeRiskDiscount(financialProfile);
  const total = financialProfile.successfulRepaymentCount + financialProfile.failedRepaymentCount;

  if (financialProfile.failedRepaymentCount > 0) {
    const { constraints, riskDiscount: projectedDiscount } = projectVerified(
      loanRequest,
      financialProfile,
      { failedRepaymentCount: 0, verifiedRepaymentCount: financialProfile.successfulRepaymentCount },
      policy,
    );
    suggestions.push({
      title: "Reduce failed repayments",
      detail: `${financialProfile.failedRepaymentCount} of your ${total} verified repayment(s) are recorded as failed, which lowers your reliability score below 1.0.`,
      projected: {
        hypothesis: `If all ${financialProfile.successfulRepaymentCount} of your verified repayments had succeeded (0 failed):`,
        constraints,
        riskDiscount: projectedDiscount,
      },
    });
  }

  if (countScore !== null && countScore < 1) {
    const additionalNeeded = Math.max(0, 5 - financialProfile.verifiedRepaymentCount);
    const { constraints, riskDiscount: projectedDiscount } = projectVerified(
      loanRequest,
      financialProfile,
      {
        verifiedRepaymentCount: financialProfile.verifiedRepaymentCount + additionalNeeded,
        successfulRepaymentCount: financialProfile.successfulRepaymentCount + additionalNeeded,
      },
      policy,
    );
    suggestions.push({
      title: "Complete more verified repayments",
      detail: `Your count score (${countScore.toFixed(2)}) saturates at 5 verified repayments; you currently have ${financialProfile.verifiedRepaymentCount}.`,
      projected: {
        hypothesis: `If you complete ${additionalNeeded} more successful verified repayment(s) (reaching 5 total, same reliability):`,
        constraints,
        riskDiscount: projectedDiscount,
      },
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      title: "Already at best-case pricing",
      detail: `Your risk discount is already ${(riskDiscount * 100).toFixed(0)}% (maximum) with this lender's policy — count and reliability scores are both at their ceiling (reliability ${reliabilityScore?.toFixed(2)}). There's no further improvement this formula can project.`,
    });
  }

  return suggestions;
}

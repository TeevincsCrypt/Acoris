/**
 * Deterministic tests for the Credit Improvement Simulator's pure logic —
 * no network, no LLM. Every "projected" number must come from the real
 * deriveLenderConstraints/computeRiskDiscount functions (constraints.ts)
 * fed a concrete hypothetical, never an invented value.
 *
 * Run with: npx tsx --test tests/improve.unit.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_LENDER_RISK_POLICY, deriveLenderConstraints } from "../lib/negotiation/constraints";
import { buildImprovementSuggestions } from "../lib/negotiation/improve";
import type { LoanRequest, VerifiedFinancialProfile } from "../lib/negotiation/types";

const loanRequest: LoanRequest = { amount: 10000, collateralValue: 17000, durationDays: 30, maxApr: 9 };

const notAvailable: VerifiedFinancialProfile = { status: "not-available" };
const unverified: VerifiedFinancialProfile = { status: "unverified", claimedSummary: "trust me" };
function verified(overrides: Partial<Extract<VerifiedFinancialProfile, { status: "verified" }>> = {}): VerifiedFinancialProfile {
  return {
    status: "verified",
    verifiedRepaymentCount: 2,
    verifiedRepaymentVolume: "1000000000000000000",
    successfulRepaymentCount: 2,
    failedRepaymentCount: 0,
    onTimeRepaymentRate: 1,
    mostRecentVerifiedActivity: "test",
    sourceChains: ["cc3-testnet"],
    verificationEvidence: [],
    ...overrides,
  };
}

test("not-available evidence: one suggestion, with a real projected constraint set for 1 hypothetical repayment", () => {
  const suggestions = buildImprovementSuggestions({ loanRequest, financialProfile: notAvailable });
  assert.equal(suggestions.length, 1);
  assert.ok(suggestions[0].projected);
  const expected = deriveLenderConstraints(
    loanRequest,
    {
      status: "verified",
      verifiedRepaymentCount: 1,
      verifiedRepaymentVolume: "0",
      successfulRepaymentCount: 1,
      failedRepaymentCount: 0,
      onTimeRepaymentRate: null,
      mostRecentVerifiedActivity: "x",
      sourceChains: [],
      verificationEvidence: [],
    },
    DEFAULT_LENDER_RISK_POLICY,
  );
  assert.deepEqual(suggestions[0].projected!.constraints, expected);
});

test("unverified evidence: one suggestion with no projected numbers (can't honestly project from an unverified claim)", () => {
  const suggestions = buildImprovementSuggestions({ loanRequest, financialProfile: unverified });
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].projected, undefined);
});

test("verified with failures: suggests reducing failures, with a real projected 0-failure constraint set", () => {
  const profile = verified({ verifiedRepaymentCount: 4, successfulRepaymentCount: 3, failedRepaymentCount: 1 });
  const suggestions = buildImprovementSuggestions({ loanRequest, financialProfile: profile });
  const failureSuggestion = suggestions.find((s) => s.title.includes("failed repayments"));
  assert.ok(failureSuggestion?.projected);
  const expected = deriveLenderConstraints(
    loanRequest,
    { ...profile, status: "verified", failedRepaymentCount: 0, verifiedRepaymentCount: 3 } as VerifiedFinancialProfile,
    DEFAULT_LENDER_RISK_POLICY,
  );
  assert.deepEqual(failureSuggestion!.projected!.constraints, expected);
});

test("verified below saturation: suggests completing more repayments, projecting exactly reaching 5", () => {
  const profile = verified({ verifiedRepaymentCount: 2, successfulRepaymentCount: 2, failedRepaymentCount: 0 });
  const suggestions = buildImprovementSuggestions({ loanRequest, financialProfile: profile });
  const countSuggestion = suggestions.find((s) => s.title.includes("more verified repayments"));
  assert.ok(countSuggestion?.projected);
  assert.match(countSuggestion!.projected!.hypothesis, /3 more/);
  assert.equal(countSuggestion!.projected!.riskDiscount, 1);
});

test("verified at max risk discount with no failures: single honest 'already best-case' suggestion, no projected numbers", () => {
  const profile = verified({ verifiedRepaymentCount: 5, successfulRepaymentCount: 5, failedRepaymentCount: 0 });
  const suggestions = buildImprovementSuggestions({ loanRequest, financialProfile: profile });
  assert.equal(suggestions.length, 1);
  assert.match(suggestions[0].title, /best-case/i);
  assert.equal(suggestions[0].projected, undefined);
});

test("a named lender persona's policy changes the projected constraints", () => {
  const alpha = { ...DEFAULT_LENDER_RISK_POLICY, baseMinApr: 8, bestCaseMinApr: 5 };
  const suggestions = buildImprovementSuggestions({ loanRequest, financialProfile: notAvailable, policy: alpha });
  assert.equal(suggestions[0].projected!.constraints.minApr <= alpha.baseMinApr, true);
});

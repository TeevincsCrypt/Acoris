/**
 * Deterministic tests for the AI Credit Underwriter's pure report builder —
 * no network, no LLM (buildUnderwritingReport never calls one).
 *
 * Run with: npx tsx --test tests/underwrite.unit.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_LENDER_RISK_POLICY, LENDER_PERSONAS } from "../lib/negotiation/constraints";
import { buildUnderwritingReport } from "../lib/negotiation/underwrite";
import type { LoanRequest, VerifiedFinancialProfile } from "../lib/negotiation/types";

const loanRequest: LoanRequest = { amount: 10000, collateralValue: 17000, durationDays: 30, maxApr: 9 };

const notAvailable: VerifiedFinancialProfile = { status: "not-available" };
const unverified: VerifiedFinancialProfile = { status: "unverified", claimedSummary: "trust me" };
function verified(overrides: Partial<Extract<VerifiedFinancialProfile, { status: "verified" }>> = {}): VerifiedFinancialProfile {
  return {
    status: "verified",
    verifiedRepaymentCount: 5,
    verifiedRepaymentVolume: "1000000000000000000",
    successfulRepaymentCount: 5,
    failedRepaymentCount: 0,
    onTimeRepaymentRate: 1,
    mostRecentVerifiedActivity: "test",
    sourceChains: ["cc3-testnet"],
    verificationEvidence: [],
    ...overrides,
  };
}

test("not-available evidence: riskDiscount is 0, scoreBreakdown is null, reasoning says why", () => {
  const report = buildUnderwritingReport({ loanRequest, financialProfile: notAvailable });
  assert.equal(report.riskDiscount, 0);
  assert.equal(report.scoreBreakdown, null);
  assert.equal(report.constraints.minApr, DEFAULT_LENDER_RISK_POLICY.baseMinApr);
  assert.ok(report.reasoning.some((r) => /no verified financial evidence/i.test(r)));
});

test("unverified (self-reported) evidence is priced exactly like not-available — never treated as verified", () => {
  const reportUnverified = buildUnderwritingReport({ loanRequest, financialProfile: unverified });
  const reportNone = buildUnderwritingReport({ loanRequest, financialProfile: notAvailable });
  assert.equal(reportUnverified.riskDiscount, reportNone.riskDiscount);
  assert.deepEqual(reportUnverified.constraints, reportNone.constraints);
  assert.ok(reportUnverified.reasoning.some((r) => /self-reported|unverified/i.test(r)));
});

test("verified evidence with 5 successful, 0 failed repayments earns the maximum risk discount (1.0)", () => {
  const report = buildUnderwritingReport({ loanRequest, financialProfile: verified() });
  assert.equal(report.riskDiscount, 1);
  assert.deepEqual(report.scoreBreakdown, { countScore: 1, reliabilityScore: 1 });
  assert.equal(report.constraints.minApr, DEFAULT_LENDER_RISK_POLICY.bestCaseMinApr);
});

test("verified evidence with fewer than 5 repayments earns a proportional, not maximal, discount", () => {
  const report = buildUnderwritingReport({
    loanRequest,
    financialProfile: verified({ verifiedRepaymentCount: 2, successfulRepaymentCount: 2, failedRepaymentCount: 0 }),
  });
  assert.equal(report.scoreBreakdown?.countScore, 0.4);
  assert.ok(report.riskDiscount > 0 && report.riskDiscount < 1);
});

test("verified evidence with failures reduces the reliability score below 1", () => {
  const report = buildUnderwritingReport({
    loanRequest,
    financialProfile: verified({ verifiedRepaymentCount: 4, successfulRepaymentCount: 3, failedRepaymentCount: 1 }),
  });
  assert.equal(report.scoreBreakdown?.reliabilityScore, 0.75);
});

test("every reasoning line cites a real number already present in the report — no vague filler-only lines", () => {
  const report = buildUnderwritingReport({ loanRequest, financialProfile: verified() });
  assert.ok(report.reasoning.length >= 3);
  const numericLines = report.reasoning.filter((r) => /\d/.test(r));
  assert.equal(numericLines.length, report.reasoning.length, "every reasoning line should cite a concrete number");
});

test("passing a named lender persona's policy changes the resulting constraints and is reflected in policyName", () => {
  const alpha = LENDER_PERSONAS.find((p) => p.id === "alpha")!;
  const report = buildUnderwritingReport({
    loanRequest,
    financialProfile: notAvailable,
    policy: alpha,
    policyName: alpha.name,
  });
  assert.equal(report.policyName, "Lender Alpha");
  assert.equal(report.constraints.minApr, alpha.baseMinApr);
});

test("defaults to DEFAULT_LENDER_RISK_POLICY and a generic policyName when no persona is given", () => {
  const report = buildUnderwritingReport({ loanRequest, financialProfile: notAvailable });
  assert.equal(report.constraints.minApr, DEFAULT_LENDER_RISK_POLICY.baseMinApr);
  assert.equal(report.policyName, "Default lender policy");
});

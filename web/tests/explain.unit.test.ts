/**
 * Deterministic tests for lib/negotiation/explain.ts — no network, no LLM.
 * Every explanation string is checked against the actual numeric inputs
 * that produced it, not just "does it render something."
 *
 * Run with: npx tsx --test tests/explain.unit.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { explainNegotiation } from "../lib/negotiation/explain";
import type { BorrowerConstraints, LenderConstraints, LoanTerms, NegotiationRound } from "../lib/negotiation/types";

const BORROWER_CONSTRAINTS: BorrowerConstraints = {
  maxApr: 9,
  minAmount: 8000,
  maxCollateral: 17000,
  minDurationDays: 30,
  maxDurationDays: 90,
};

const LENDER_CONSTRAINTS: LenderConstraints = {
  minApr: 9,
  maxAmount: 20000,
  minCollateralRatio: 1.5,
  maxDurationDays: 60,
};

const ACCEPTED_TERMS: LoanTerms = {
  amount: 10000,
  collateral: 15000,
  apr: 9,
  duration: 30,
  status: "accepted",
};

function acceptRound(overrides: Partial<NegotiationRound> = {}): NegotiationRound {
  return {
    round: 3,
    agent: "borrower",
    action: "ACCEPT",
    amount: ACCEPTED_TERMS.amount,
    collateral: ACCEPTED_TERMS.collateral,
    apr: ACCEPTED_TERMS.apr,
    durationDays: ACCEPTED_TERMS.duration,
    reasoning: "The lender's offer is within our limits, accepting.",
    status: "accepted",
    wasClamped: false,
    ...overrides,
  };
}

test("returns no explanation when the negotiation did not reach 'accepted'", () => {
  const result = explainNegotiation({
    finalTerms: { amount: 0, collateral: 0, apr: 0, duration: 0, status: "no-agreement" },
    borrowerConstraints: BORROWER_CONSTRAINTS,
    lenderConstraints: LENDER_CONSTRAINTS,
    financialProfileUsed: { status: "not-available" },
    rounds: [],
  });
  assert.deepEqual(result.terms, []);
  assert.equal(result.decidingRoundReasoning, null);
});

test("explains all four terms for an accepted negotiation", () => {
  const result = explainNegotiation({
    finalTerms: ACCEPTED_TERMS,
    borrowerConstraints: BORROWER_CONSTRAINTS,
    lenderConstraints: LENDER_CONSTRAINTS,
    financialProfileUsed: { status: "not-available" },
    rounds: [acceptRound()],
  });
  const fields = result.terms.map((t) => t.field);
  assert.deepEqual(fields.sort(), ["amount", "apr", "collateral", "duration"]);
});

test("APR reason cites verified evidence count when priced at the lender's floor with a verified profile", () => {
  const result = explainNegotiation({
    finalTerms: { ...ACCEPTED_TERMS, apr: 9 }, // exactly at lender's minApr
    borrowerConstraints: BORROWER_CONSTRAINTS,
    lenderConstraints: LENDER_CONSTRAINTS,
    financialProfileUsed: {
      status: "verified",
      verifiedRepaymentCount: 3,
      verifiedRepaymentVolume: "3000000000000000000",
      successfulRepaymentCount: 3,
      failedRepaymentCount: 0,
      onTimeRepaymentRate: 1,
      mostRecentVerifiedActivity: "sepolia block 100",
      sourceChains: ["sepolia"],
      verificationEvidence: [],
    },
    rounds: [acceptRound()],
  });
  const aprExplanation = result.terms.find((t) => t.field === "apr");
  assert.ok(aprExplanation);
  assert.match(aprExplanation!.reason, /3 verified repayments/);
  assert.match(aprExplanation!.reason, /9\.00%/);
});

test("APR reason cites baseline/no-evidence pricing when financial profile is not-available", () => {
  const result = explainNegotiation({
    finalTerms: { ...ACCEPTED_TERMS, apr: 9 },
    borrowerConstraints: BORROWER_CONSTRAINTS,
    lenderConstraints: LENDER_CONSTRAINTS,
    financialProfileUsed: { status: "not-available" },
    rounds: [acceptRound()],
  });
  const aprExplanation = result.terms.find((t) => t.field === "apr");
  assert.match(aprExplanation!.reason, /no financial evidence/i);
  assert.match(aprExplanation!.reason, /baseline minimum APR/i);
});

test("APR reason never claims verified evidence when profile is unverified (self-reported only)", () => {
  const result = explainNegotiation({
    finalTerms: { ...ACCEPTED_TERMS, apr: 9 },
    borrowerConstraints: BORROWER_CONSTRAINTS,
    lenderConstraints: LENDER_CONSTRAINTS,
    financialProfileUsed: { status: "unverified", claimedSummary: "I always repay" },
    rounds: [acceptRound()],
  });
  const aprExplanation = result.terms.find((t) => t.field === "apr");
  assert.match(aprExplanation!.reason, /unverified, self-reported claim/i);
  assert.doesNotMatch(aprExplanation!.reason, /verified repayments/i);
});

test("collateral reason computes the real ratio from finalTerms, not an invented number", () => {
  const result = explainNegotiation({
    finalTerms: { ...ACCEPTED_TERMS, amount: 10000, collateral: 20000 }, // exactly 2.0x
    borrowerConstraints: BORROWER_CONSTRAINTS,
    lenderConstraints: LENDER_CONSTRAINTS,
    financialProfileUsed: { status: "not-available" },
    rounds: [acceptRound()],
  });
  const collateralExplanation = result.terms.find((t) => t.field === "collateral");
  assert.match(collateralExplanation!.reason, /2\.00x/);
  assert.match(collateralExplanation!.reason, /1\.50x collateral ratio/);
});

test("duration reason cites the real borrower range and lender maximum", () => {
  const result = explainNegotiation({
    finalTerms: ACCEPTED_TERMS,
    borrowerConstraints: BORROWER_CONSTRAINTS,
    lenderConstraints: LENDER_CONSTRAINTS,
    financialProfileUsed: { status: "not-available" },
    rounds: [acceptRound()],
  });
  const durationExplanation = result.terms.find((t) => t.field === "duration");
  assert.match(durationExplanation!.reason, /30–90 days/);
  assert.match(durationExplanation!.reason, /60 days/);
});

test("decidingRoundReasoning quotes the real ACCEPT round's reasoning verbatim", () => {
  const result = explainNegotiation({
    finalTerms: ACCEPTED_TERMS,
    borrowerConstraints: BORROWER_CONSTRAINTS,
    lenderConstraints: LENDER_CONSTRAINTS,
    financialProfileUsed: { status: "not-available" },
    rounds: [acceptRound({ reasoning: "This exact text must be quoted verbatim." })],
  });
  assert.equal(result.decidingRoundReasoning, "This exact text must be quoted verbatim.");
});

test("decidingRoundReasoning is null if the last round somehow isn't an ACCEPT (defensive, shouldn't happen for status accepted)", () => {
  const result = explainNegotiation({
    finalTerms: ACCEPTED_TERMS,
    borrowerConstraints: BORROWER_CONSTRAINTS,
    lenderConstraints: LENDER_CONSTRAINTS,
    financialProfileUsed: { status: "not-available" },
    rounds: [acceptRound({ action: "COUNTER", status: "in-progress" })],
  });
  assert.equal(result.decidingRoundReasoning, null);
});

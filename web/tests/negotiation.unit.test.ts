/**
 * Deterministic tests for the Acoris negotiation engine's enforcement
 * layer — no LLM calls, no network. Everything here is a pure function of
 * its inputs (constraints.ts, financial-profile.ts, round-logic.ts).
 *
 * Run with: npx tsx --test tests/negotiation.unit.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_LENDER_RISK_POLICY,
  MAX_NEGOTIATION_ROUNDS,
  clampToBorrowerConstraints,
  clampToLenderConstraints,
  deriveBorrowerConstraints,
  deriveLenderConstraints,
  validateBorrowerOffer,
  validateLenderOffer,
} from "../lib/negotiation/constraints";
import { buildVerifiedFinancialProfile } from "../lib/negotiation/financial-profile";
import { deriveFinalTerms, enforceAndBuildRound } from "../lib/negotiation/round-logic";
import type {
  BorrowerConstraints,
  LenderConstraints,
  LoanRequest,
  NegotiationRound,
} from "../lib/negotiation/types";
import type { AttestcoinVerificationResult } from "../lib/attestcoin";

const SAMPLE_REQUEST: LoanRequest = {
  amount: 10000,
  collateralValue: 17000,
  durationDays: 30,
  maxApr: 9,
};

// ---------------------------------------------------------------------------
// Constraint validation — basic pass/fail
// ---------------------------------------------------------------------------

test("validateBorrowerOffer accepts terms within all borrower limits", () => {
  const constraints = deriveBorrowerConstraints(SAMPLE_REQUEST);
  const result = validateBorrowerOffer({ amount: 10000, collateral: 17000, apr: 8, durationDays: 30 }, constraints);
  assert.equal(result.valid, true);
  assert.deepEqual(result.violations, []);
});

test("validateLenderOffer accepts terms within all lender limits", () => {
  const constraints: LenderConstraints = { minApr: 5, maxAmount: 20000, minCollateralRatio: 1.2, maxDurationDays: 60 };
  const result = validateLenderOffer({ amount: 10000, collateral: 12000, apr: 7, durationDays: 30 }, constraints);
  assert.equal(result.valid, true);
});

// ---------------------------------------------------------------------------
// Invalid lender offers
// ---------------------------------------------------------------------------

test("validateLenderOffer rejects an APR below the lender's floor", () => {
  const constraints: LenderConstraints = { minApr: 6, maxAmount: 20000, minCollateralRatio: 1.2, maxDurationDays: 60 };
  const result = validateLenderOffer({ amount: 10000, collateral: 12000, apr: 3, durationDays: 30 }, constraints);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some((v) => v.includes("apr")));
});

test("validateLenderOffer rejects an amount above the lender's cap", () => {
  const constraints: LenderConstraints = { minApr: 5, maxAmount: 15000, minCollateralRatio: 1.2, maxDurationDays: 60 };
  const result = validateLenderOffer({ amount: 20000, collateral: 25000, apr: 7, durationDays: 30 }, constraints);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some((v) => v.includes("amount")));
});

test("validateLenderOffer rejects insufficient collateral ratio", () => {
  const constraints: LenderConstraints = { minApr: 5, maxAmount: 20000, minCollateralRatio: 1.5, maxDurationDays: 60 };
  // 10000 loan with only 11000 collateral -> ratio 1.1, below the 1.5 floor.
  const result = validateLenderOffer({ amount: 10000, collateral: 11000, apr: 7, durationDays: 30 }, constraints);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some((v) => v.includes("collateral ratio")));
});

test("validateLenderOffer rejects a duration beyond the lender's ceiling", () => {
  const constraints: LenderConstraints = { minApr: 5, maxAmount: 20000, minCollateralRatio: 1.2, maxDurationDays: 60 };
  const result = validateLenderOffer({ amount: 10000, collateral: 12000, apr: 7, durationDays: 90 }, constraints);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some((v) => v.includes("durationDays")));
});

// ---------------------------------------------------------------------------
// Invalid borrower offers
// ---------------------------------------------------------------------------

test("validateBorrowerOffer rejects an APR above the borrower's ceiling", () => {
  const constraints = deriveBorrowerConstraints(SAMPLE_REQUEST); // maxApr = 9
  const result = validateBorrowerOffer({ amount: 10000, collateral: 15000, apr: 15, durationDays: 30 }, constraints);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some((v) => v.includes("maximum acceptable APR")));
});

test("validateBorrowerOffer rejects an amount below the borrower's minimum", () => {
  const constraints = deriveBorrowerConstraints(SAMPLE_REQUEST); // minAmount = 8000 (0.8 * 10000)
  const result = validateBorrowerOffer({ amount: 5000, collateral: 15000, apr: 8, durationDays: 30 }, constraints);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some((v) => v.includes("minimum acceptable amount")));
});

test("validateBorrowerOffer rejects collateral beyond what the borrower has", () => {
  const constraints = deriveBorrowerConstraints(SAMPLE_REQUEST); // maxCollateral = 17000
  const result = validateBorrowerOffer({ amount: 10000, collateral: 25000, apr: 8, durationDays: 30 }, constraints);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some((v) => v.includes("available collateral")));
});

test("validateBorrowerOffer rejects a duration shorter than requested", () => {
  const constraints = deriveBorrowerConstraints(SAMPLE_REQUEST); // minDurationDays = 30
  const result = validateBorrowerOffer({ amount: 10000, collateral: 15000, apr: 8, durationDays: 10 }, constraints);
  assert.equal(result.valid, false);
  assert.ok(result.violations.some((v) => v.includes("minimum required duration")));
});

// ---------------------------------------------------------------------------
// APR limits — risk-adjusted lender pricing
// ---------------------------------------------------------------------------

test("deriveLenderConstraints uses the conservative baseline APR floor with no verified evidence", () => {
  const constraints = deriveLenderConstraints(SAMPLE_REQUEST, { status: "not-available" });
  assert.equal(constraints.minApr, DEFAULT_LENDER_RISK_POLICY.baseMinApr);
});

test("deriveLenderConstraints never discounts APR for an unverified (self-reported) claim", () => {
  const constraints = deriveLenderConstraints(SAMPLE_REQUEST, {
    status: "unverified",
    claimedSummary: "I always pay back my loans, trust me",
  });
  assert.equal(
    constraints.minApr,
    DEFAULT_LENDER_RISK_POLICY.baseMinApr,
    "an unverified claim must never move pricing away from the baseline",
  );
});

test("deriveLenderConstraints lowers the APR floor for a strong verified repayment history", () => {
  const strongProfile = {
    status: "verified" as const,
    verifiedRepaymentCount: 5,
    verifiedRepaymentVolume: "5000000000000000000",
    successfulRepaymentCount: 5,
    failedRepaymentCount: 0,
    onTimeRepaymentRate: null,
    mostRecentVerifiedActivity: "sepolia block 100",
    sourceChains: ["sepolia"],
    verificationEvidence: [],
  };
  const constraints = deriveLenderConstraints(SAMPLE_REQUEST, strongProfile);
  assert.ok(
    constraints.minApr < DEFAULT_LENDER_RISK_POLICY.baseMinApr,
    "verified history should lower the APR floor below baseline",
  );
  assert.ok(
    constraints.minApr >= DEFAULT_LENDER_RISK_POLICY.bestCaseMinApr,
    "APR floor should never drop below the policy's absolute best case",
  );
});

test("deriveLenderConstraints does not fully discount APR when verified history includes failures", () => {
  const mixedProfile = {
    status: "verified" as const,
    verifiedRepaymentCount: 4,
    verifiedRepaymentVolume: "4000000000000000000",
    successfulRepaymentCount: 2,
    failedRepaymentCount: 2,
    onTimeRepaymentRate: null,
    mostRecentVerifiedActivity: "sepolia block 100",
    sourceChains: ["sepolia"],
    verificationEvidence: [],
  };
  const strongProfile = {
    status: "verified" as const,
    verifiedRepaymentCount: 4,
    verifiedRepaymentVolume: "4000000000000000000",
    successfulRepaymentCount: 4,
    failedRepaymentCount: 0,
    onTimeRepaymentRate: null,
    mostRecentVerifiedActivity: "sepolia block 100",
    sourceChains: ["sepolia"],
    verificationEvidence: [],
  };
  const mixedConstraints = deriveLenderConstraints(SAMPLE_REQUEST, mixedProfile);
  const strongConstraints = deriveLenderConstraints(SAMPLE_REQUEST, strongProfile);
  assert.ok(
    mixedConstraints.minApr > strongConstraints.minApr,
    "a history with failures should price worse than an equally-sized clean history",
  );
});

test("clampToBorrowerConstraints caps a proposed APR at the borrower's ceiling", () => {
  const constraints = deriveBorrowerConstraints(SAMPLE_REQUEST); // maxApr = 9
  const { terms, wasClamped } = clampToBorrowerConstraints(
    { amount: 10000, collateral: 15000, apr: 20, durationDays: 30 },
    constraints,
  );
  assert.equal(terms.apr, 9);
  assert.equal(wasClamped, true);
});

test("clampToLenderConstraints raises a proposed APR up to the lender's floor", () => {
  const constraints: LenderConstraints = { minApr: 6, maxAmount: 20000, minCollateralRatio: 1.2, maxDurationDays: 60 };
  const { terms, wasClamped } = clampToLenderConstraints({ amount: 10000, collateral: 12000, apr: 2, durationDays: 30 }, constraints);
  assert.equal(terms.apr, 6);
  assert.equal(wasClamped, true);
});

// ---------------------------------------------------------------------------
// Collateral requirements
// ---------------------------------------------------------------------------

test("clampToLenderConstraints raises collateral to meet the minimum ratio when it's short", () => {
  const constraints: LenderConstraints = { minApr: 5, maxAmount: 20000, minCollateralRatio: 1.5, maxDurationDays: 60 };
  const { terms, wasClamped } = clampToLenderConstraints(
    { amount: 10000, collateral: 11000, apr: 7, durationDays: 30 },
    constraints,
  );
  assert.equal(terms.collateral, 15000); // 10000 * 1.5
  assert.equal(wasClamped, true);
});

test("clampToLenderConstraints leaves collateral untouched when it already exceeds the minimum ratio", () => {
  const constraints: LenderConstraints = { minApr: 5, maxAmount: 20000, minCollateralRatio: 1.2, maxDurationDays: 60 };
  const { terms, wasClamped } = clampToLenderConstraints(
    { amount: 10000, collateral: 17000, apr: 7, durationDays: 30 },
    constraints,
  );
  assert.equal(terms.collateral, 17000);
  assert.equal(wasClamped, false);
});

test("deriveLenderConstraints requires less collateral ratio for a strong verified history, never below the policy floor", () => {
  const strongProfile = {
    status: "verified" as const,
    verifiedRepaymentCount: 10,
    verifiedRepaymentVolume: "1",
    successfulRepaymentCount: 10,
    failedRepaymentCount: 0,
    onTimeRepaymentRate: null,
    mostRecentVerifiedActivity: "sepolia block 1",
    sourceChains: ["sepolia"],
    verificationEvidence: [],
  };
  const constraints = deriveLenderConstraints(SAMPLE_REQUEST, strongProfile);
  assert.ok(constraints.minCollateralRatio < DEFAULT_LENDER_RISK_POLICY.baseMinCollateralRatio);
  assert.ok(constraints.minCollateralRatio >= DEFAULT_LENDER_RISK_POLICY.bestCaseMinCollateralRatio);
});

// ---------------------------------------------------------------------------
// Negotiation termination
// ---------------------------------------------------------------------------

function borrowerConstraints(): BorrowerConstraints {
  return deriveBorrowerConstraints(SAMPLE_REQUEST);
}
function lenderConstraints(): LenderConstraints {
  return { minApr: 5, maxAmount: 20000, minCollateralRatio: 1.2, maxDurationDays: 60 };
}

test("enforceAndBuildRound forces round 1 to be an OFFER regardless of the proposed action", () => {
  const round = enforceAndBuildRound({
    agent: "borrower",
    roundNumber: 1,
    decision: { action: "ACCEPT", amount: 10000, collateral: 15000, apr: 8, durationDays: 30, reasoning: "test" },
    borrowerConstraints: borrowerConstraints(),
    lenderConstraints: lenderConstraints(),
    history: [],
    isFirstRound: true,
    isLastAllowedRound: false,
  });
  assert.equal(round.action, "OFFER");
  assert.equal(round.status, "in-progress");
});

test("enforceAndBuildRound on the last allowed round without accept/reject reports max-rounds-reached", () => {
  const round = enforceAndBuildRound({
    agent: "lender",
    roundNumber: MAX_NEGOTIATION_ROUNDS,
    decision: { action: "COUNTER", amount: 10000, collateral: 15000, apr: 7, durationDays: 30, reasoning: "test" },
    borrowerConstraints: borrowerConstraints(),
    lenderConstraints: lenderConstraints(),
    history: [{ round: 1, agent: "borrower", action: "OFFER", amount: 10000, collateral: 15000, apr: 8, durationDays: 30, reasoning: "x", status: "in-progress", wasClamped: false }],
    isFirstRound: false,
    isLastAllowedRound: true,
  });
  assert.equal(round.status, "max-rounds-reached");
});

test("enforceAndBuildRound ACCEPT adopts the counterpart's exact last offer, not the accepting agent's own numbers", () => {
  const lastOffer: NegotiationRound = {
    round: 2,
    agent: "lender",
    action: "COUNTER",
    amount: 10000,
    collateral: 15000,
    apr: 7,
    durationDays: 30,
    reasoning: "lender counter",
    status: "in-progress",
    wasClamped: false,
  };
  const round = enforceAndBuildRound({
    agent: "borrower",
    roundNumber: 3,
    // Model hallucinates different numbers while "accepting" — must be ignored.
    decision: { action: "ACCEPT", amount: 999, collateral: 1, apr: 0.1, durationDays: 1, reasoning: "sounds good" },
    borrowerConstraints: borrowerConstraints(),
    lenderConstraints: lenderConstraints(),
    history: [lastOffer],
    isFirstRound: false,
    isLastAllowedRound: false,
  });
  assert.equal(round.action, "ACCEPT");
  assert.equal(round.status, "accepted");
  assert.equal(round.amount, 10000);
  assert.equal(round.collateral, 15000);
  assert.equal(round.apr, 7);
});

test("enforceAndBuildRound REJECT ends the negotiation with status rejected", () => {
  const round = enforceAndBuildRound({
    agent: "lender",
    roundNumber: 2,
    decision: { action: "REJECT", amount: 10000, collateral: 15000, apr: 8, durationDays: 30, reasoning: "too risky" },
    borrowerConstraints: borrowerConstraints(),
    lenderConstraints: lenderConstraints(),
    history: [{ round: 1, agent: "borrower", action: "OFFER", amount: 10000, collateral: 15000, apr: 8, durationDays: 30, reasoning: "x", status: "in-progress", wasClamped: false }],
    isFirstRound: false,
    isLastAllowedRound: false,
  });
  assert.equal(round.status, "rejected");
});

// ---------------------------------------------------------------------------
// Agreement generation
// ---------------------------------------------------------------------------

test("deriveFinalTerms produces accepted terms matching the accepted round", () => {
  const history: NegotiationRound[] = [
    { round: 1, agent: "borrower", action: "OFFER", amount: 10000, collateral: 17000, apr: 9, durationDays: 30, reasoning: "x", status: "in-progress", wasClamped: false },
    { round: 2, agent: "lender", action: "COUNTER", amount: 10000, collateral: 15000, apr: 7, durationDays: 30, reasoning: "y", status: "in-progress", wasClamped: false },
    { round: 3, agent: "borrower", action: "ACCEPT", amount: 10000, collateral: 15000, apr: 7, durationDays: 30, reasoning: "z", status: "accepted", wasClamped: false },
  ];
  const terms = deriveFinalTerms(history);
  assert.deepEqual(terms, { amount: 10000, collateral: 15000, apr: 7, duration: 30, status: "accepted" });
});

test("deriveFinalTerms produces no-agreement terms (zeroed) when rounds run out without accept/reject", () => {
  const history: NegotiationRound[] = [
    { round: 1, agent: "borrower", action: "OFFER", amount: 10000, collateral: 17000, apr: 9, durationDays: 30, reasoning: "x", status: "in-progress", wasClamped: false },
    { round: 2, agent: "lender", action: "COUNTER", amount: 9500, collateral: 15000, apr: 8, durationDays: 30, reasoning: "y", status: "max-rounds-reached", wasClamped: false },
  ];
  const terms = deriveFinalTerms(history);
  assert.equal(terms.status, "no-agreement");
});

test("deriveFinalTerms handles an empty history as no-agreement", () => {
  const terms = deriveFinalTerms([]);
  assert.equal(terms.status, "no-agreement");
});

// ---------------------------------------------------------------------------
// Absence of verified evidence
// ---------------------------------------------------------------------------

test("buildVerifiedFinancialProfile with no results is explicitly not-available", () => {
  const profile = buildVerifiedFinancialProfile([]);
  assert.deepEqual(profile, { status: "not-available" });
});

test("buildVerifiedFinancialProfile with undefined input is explicitly not-available", () => {
  const profile = buildVerifiedFinancialProfile(undefined);
  assert.deepEqual(profile, { status: "not-available" });
});

test("buildVerifiedFinancialProfile ignores results that never actually verified (ok: false)", () => {
  const blockedResult: AttestcoinVerificationResult = {
    stage: "resolving-source-chain",
    ok: false,
    networkBlocked: true,
    transactionHash: "0x" + "a".repeat(64),
    error: "Host not in allowlist",
  };
  const profile = buildVerifiedFinancialProfile([blockedResult]);
  assert.equal(profile.status, "not-available", "a blocked/failed verification attempt must never count as evidence");
});

test("buildVerifiedFinancialProfile aggregates real verified evidence correctly", () => {
  const verified: AttestcoinVerificationResult = {
    stage: "complete",
    ok: true,
    networkBlocked: false,
    transactionHash: "0x202b9b1d689578cf7dd7b279b3c9cb02f47cef7b44b6fa1650ab67977f86cb11",
    sourceChain: { chainKey: 7, chainId: 11155111, chainName: "sepolia" },
    sourceBlockHeight: 9000000,
    attested: true,
    proofVerified: true,
    fact: {
      kind: "sepolia-loan-repayment",
      transactionStatus: "success",
      transactionFrom: "0x2FabAFfC7F6426C1beEdec22cc150A7dBE6667FB",
      transactionTo: "0x39DE412201f2446b3606C93dFB799EdE6a721b13",
      loanEvent: {
        contract: "0x39DE412201f2446b3606C93dFB799EdE6a721b13",
        loanHash: "0xaf840a790d0056fa2c551a54a9b845e8f427107fe6570c41d89ecfe396d32f98",
        lender: "0x1111111111111111111111111111111111111111",
        borrower: "0x2222222222222222222222222222222222222222",
        amountWei: "1000000000000000000",
      },
      transferEvent: {
        contract: "0x296077f69435a073f7A6E0CBAEf8C1877633832E",
        from: "0x2FabAFfC7F6426C1beEdec22cc150A7dBE6667FB",
        to: "0x1111111111111111111111111111111111111111",
        valueWei: "1000000000000000000",
      },
    },
  };
  const profile = buildVerifiedFinancialProfile([verified]);
  assert.equal(profile.status, "verified");
  if (profile.status === "verified") {
    assert.equal(profile.verifiedRepaymentCount, 1);
    assert.equal(profile.successfulRepaymentCount, 1);
    assert.equal(profile.failedRepaymentCount, 0);
    assert.equal(profile.verifiedRepaymentVolume, "1000000000000000000");
    assert.equal(profile.mostRecentVerifiedActivity, "sepolia block 9000000");
    assert.deepEqual(profile.sourceChains, ["sepolia"]);
  }
});

test("deriveLenderConstraints treats not-available and unverified identically (both baseline)", () => {
  const notAvailable = deriveLenderConstraints(SAMPLE_REQUEST, { status: "not-available" });
  const unverified = deriveLenderConstraints(SAMPLE_REQUEST, { status: "unverified" });
  assert.deepEqual(notAvailable, unverified);
});

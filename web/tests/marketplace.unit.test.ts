/**
 * Deterministic tests for the lender marketplace's pure pieces — no
 * network, no LLM. lib/negotiation/marketplace.ts (which calls the AI
 * agents) is not exercised here; only LENDER_PERSONAS (constraints.ts) and
 * selectBestOffer (marketplace-compare.ts).
 *
 * Run with: npx tsx --test tests/marketplace.unit.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_LENDER_RISK_POLICY, LENDER_PERSONAS } from "../lib/negotiation/constraints";
import { selectBestOffer, type LenderOffer } from "../lib/negotiation/marketplace-compare";

function offer(overrides: Partial<LenderOffer> & { personaId: string }): LenderOffer {
  return {
    personaName: `Lender ${overrides.personaId}`,
    personaStyle: "Balanced",
    amount: 10000,
    collateral: 15000,
    apr: 9,
    durationDays: 30,
    reasoning: "test",
    wasClamped: false,
    ...overrides,
  };
}

test("LENDER_PERSONAS has exactly three distinct personas with distinct risk tradeoffs", () => {
  assert.equal(LENDER_PERSONAS.length, 3);
  const ids = LENDER_PERSONAS.map((p) => p.id);
  assert.deepEqual(new Set(ids).size, 3, "persona ids must be unique");

  const alpha = LENDER_PERSONAS.find((p) => p.id === "alpha")!;
  const gamma = LENDER_PERSONAS.find((p) => p.id === "gamma")!;
  // The conservative persona demands strictly more collateral and offers a strictly lower base rate
  // than the aggressive one — a real tradeoff, not three copies of the same policy.
  assert.ok(alpha.baseMinCollateralRatio > gamma.baseMinCollateralRatio);
  assert.ok(alpha.baseMinApr < gamma.baseMinApr);
});

test("Lender Beta's policy matches DEFAULT_LENDER_RISK_POLICY exactly (single-lender flow unaffected)", () => {
  const beta = LENDER_PERSONAS.find((p) => p.id === "beta")!;
  assert.equal(beta.baseMinApr, DEFAULT_LENDER_RISK_POLICY.baseMinApr);
  assert.equal(beta.bestCaseMinApr, DEFAULT_LENDER_RISK_POLICY.bestCaseMinApr);
  assert.equal(beta.baseMinCollateralRatio, DEFAULT_LENDER_RISK_POLICY.baseMinCollateralRatio);
  assert.equal(beta.bestCaseMinCollateralRatio, DEFAULT_LENDER_RISK_POLICY.bestCaseMinCollateralRatio);
});

test("selectBestOffer picks the lowest APR among offers the borrower can actually afford", () => {
  const offers = [
    offer({ personaId: "alpha", apr: 8.2, collateral: 15500 }),
    offer({ personaId: "beta", apr: 8.7, collateral: 14500 }),
    offer({ personaId: "gamma", apr: 9.0, collateral: 13500 }),
  ];
  const result = selectBestOffer(offers, 17000);
  assert.equal(result.chosen?.personaId, "alpha");
  assert.match(result.reasoning, /8\.2%/);
});

test("selectBestOffer excludes offers whose collateral the borrower cannot afford, even if cheapest", () => {
  const offers = [
    offer({ personaId: "alpha", apr: 8.2, collateral: 20000 }), // cheapest APR but unaffordable collateral
    offer({ personaId: "beta", apr: 8.7, collateral: 14500 }),
    offer({ personaId: "gamma", apr: 9.0, collateral: 13500 }),
  ];
  const result = selectBestOffer(offers, 17000);
  assert.equal(result.chosen?.personaId, "beta");
});

test("selectBestOffer returns null (honest no-match) when nothing is affordable", () => {
  const offers = [offer({ personaId: "alpha", collateral: 50000 })];
  const result = selectBestOffer(offers, 17000);
  assert.equal(result.chosen, null);
  assert.match(result.reasoning, /did not fit|None of the/i);
});

test("selectBestOffer breaks APR ties by lower required collateral", () => {
  const offers = [
    offer({ personaId: "alpha", apr: 9, collateral: 16000 }),
    offer({ personaId: "beta", apr: 9, collateral: 14000 }),
  ];
  const result = selectBestOffer(offers, 17000);
  assert.equal(result.chosen?.personaId, "beta");
});

test("selectBestOffer on an empty offer list is an honest no-match, not a crash", () => {
  const result = selectBestOffer([], 17000);
  assert.equal(result.chosen, null);
  assert.match(result.reasoning, /no lender offers/i);
});

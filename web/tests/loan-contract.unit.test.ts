/**
 * Deterministic tests for lib/loan-contract's pure helpers — no network, no
 * wallet. The contract's own logic (escrow, funding, repayment interest,
 * defaults, access control) is tested with real EVM execution in
 * contracts/test/AcorisLoanRegistry.ts (20 passing tests) — not duplicated
 * here.
 *
 * Run with: npx tsx --test tests/loan-contract.unit.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  aprToBps,
  cancelProposalOnChain,
  computeLoanHash,
  dealUnitsToWei,
  estimateTotalRepayment,
  fundAgreementOnChain,
  getLoanRegistryContract,
  getRepaymentAmountOnChain,
  isLoanRegistryDeployed,
  LoanRegistryNotDeployedError,
  markDefaultedOnChain,
  repayOnChain,
} from "../lib/loan-contract";

test("computeLoanHash is deterministic for the same negotiation id", () => {
  const a = computeLoanHash("negotiation-123");
  const b = computeLoanHash("negotiation-123");
  assert.equal(a, b);
  assert.match(a, /^0x[0-9a-f]{64}$/);
});

test("computeLoanHash differs for different negotiation ids", () => {
  const a = computeLoanHash("negotiation-123");
  const b = computeLoanHash("negotiation-456");
  assert.notEqual(a, b);
});

test("aprToBps converts percent to basis points", () => {
  assert.equal(aprToBps(9), 900);
  assert.equal(aprToBps(7.5), 750);
  assert.equal(aprToBps(0.01), 1);
});

test("dealUnitsToWei converts whole units to wei via 18 decimals", () => {
  assert.equal(dealUnitsToWei(1).toString(), "1000000000000000000");
  assert.equal(dealUnitsToWei(10000).toString(), (BigInt(10000) * BigInt(10) ** BigInt(18)).toString());
});

test("estimateTotalRepayment matches the contract's own simple-interest formula exactly", () => {
  // AcorisLoanRegistry.sol: principal * aprBps * durationSeconds / (365 days * 10000)
  const principal = 1;
  const aprPercent = 8;
  const durationDays = 60;
  const aprBps = aprToBps(aprPercent);
  const durationSeconds = durationDays * 24 * 60 * 60;
  const contractInterest = (principal * aprBps * durationSeconds) / (365 * 24 * 60 * 60 * 10000);
  const expected = principal + contractInterest;
  assert.ok(Math.abs(estimateTotalRepayment(principal, aprPercent, durationDays) - expected) < 1e-9);
});

test("estimateTotalRepayment matches the real live example (1 tCTC, 8% APR, 60 days -> 1.013150684931506849)", () => {
  const total = estimateTotalRepayment(1, 8, 60);
  assert.ok(Math.abs(total - 1.0131506849315068) < 1e-9);
});

test("estimateTotalRepayment with zero APR returns exactly the principal", () => {
  assert.equal(estimateTotalRepayment(500, 0, 30), 500);
});

test("isLoanRegistryDeployed is false when NEXT_PUBLIC_LOAN_REGISTRY_ADDRESS is unset", () => {
  // This project's sandbox has no deployed contract (see docs/ACORIS_LOAN_CONTRACT.md) —
  // asserting the honest, current state rather than a hypothetical one.
  assert.equal(process.env.NEXT_PUBLIC_LOAN_REGISTRY_ADDRESS, undefined);
  assert.equal(isLoanRegistryDeployed(), false);
});

test("getLoanRegistryContract throws LoanRegistryNotDeployedError rather than pointing at a fabricated address", () => {
  assert.throws(() => getLoanRegistryContract({} as never), LoanRegistryNotDeployedError);
});

// ---------------------------------------------------------------------------
// Phase 3B lifecycle actions (fund/repay/cancel/markDefaulted/repaymentAmount)
// all route through getLoanRegistryContract, so they fail the same honest
// way — not deployed here means a real, typed error, never a fabricated
// transaction or reading.
// ---------------------------------------------------------------------------

test("fundAgreementOnChain rejects with LoanRegistryNotDeployedError when not deployed", async () => {
  await assert.rejects(() => fundAgreementOnChain({} as never, computeLoanHash("x"), BigInt(1)), LoanRegistryNotDeployedError);
});

test("cancelProposalOnChain rejects with LoanRegistryNotDeployedError when not deployed", async () => {
  await assert.rejects(() => cancelProposalOnChain({} as never, computeLoanHash("x")), LoanRegistryNotDeployedError);
});

test("repayOnChain rejects with LoanRegistryNotDeployedError when not deployed", async () => {
  await assert.rejects(() => repayOnChain({} as never, computeLoanHash("x")), LoanRegistryNotDeployedError);
});

test("markDefaultedOnChain rejects with LoanRegistryNotDeployedError when not deployed", async () => {
  await assert.rejects(() => markDefaultedOnChain({} as never, computeLoanHash("x")), LoanRegistryNotDeployedError);
});

test("getRepaymentAmountOnChain rejects with LoanRegistryNotDeployedError when not deployed", async () => {
  await assert.rejects(() => getRepaymentAmountOnChain({} as never, computeLoanHash("x")), LoanRegistryNotDeployedError);
});

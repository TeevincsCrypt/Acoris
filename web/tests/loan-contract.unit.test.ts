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
  computeLoanHash,
  dealUnitsToWei,
  isLoanRegistryDeployed,
  LoanRegistryNotDeployedError,
  getLoanRegistryContract,
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

test("isLoanRegistryDeployed is false when NEXT_PUBLIC_LOAN_REGISTRY_ADDRESS is unset", () => {
  // This project's sandbox has no deployed contract (see docs/ACORIS_LOAN_CONTRACT.md) —
  // asserting the honest, current state rather than a hypothetical one.
  assert.equal(process.env.NEXT_PUBLIC_LOAN_REGISTRY_ADDRESS, undefined);
  assert.equal(isLoanRegistryDeployed(), false);
});

test("getLoanRegistryContract throws LoanRegistryNotDeployedError rather than pointing at a fabricated address", () => {
  assert.throws(() => getLoanRegistryContract({} as never), LoanRegistryNotDeployedError);
});

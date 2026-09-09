/**
 * Deterministic tests for lib/assistant/summarize-wallet-activity.ts — no
 * network, no AI call. Every string checked here is a real formatting
 * result of the synthetic input, never a placeholder.
 *
 * Run with: npx tsx --test tests/summarize-wallet-activity.unit.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { summarizeWalletActivity } from "../lib/assistant/summarize-wallet-activity";
import type { LoanTimelineDto } from "../lib/dashboard";

const ADDRESS = "0x2222222222222222222222222222222222222222";

function timeline(overrides: Partial<LoanTimelineDto> & { loanHash: string }): LoanTimelineDto {
  return {
    borrower: ADDRESS,
    lender: "0x1111111111111111111111111111111111111111",
    principalWei: "1000000000000000000",
    collateralWei: "1500000000000000000",
    aprBps: 800,
    durationSeconds: 30 * 86400,
    proposedAt: 1000,
    proposeTxHash: `0xpropose-${overrides.loanHash}`,
    fundedAt: null,
    dueAt: null,
    repaidAt: null,
    repayTxHash: null,
    defaultedAt: null,
    onTime: null,
    outcome: "pending",
    ...overrides,
  };
}

test("summarizeWalletActivity: empty history says so plainly", () => {
  const out = summarizeWalletActivity(ADDRESS, "borrower", []);
  assert.match(out, /no agreements found/);
  assert.match(out, new RegExp(ADDRESS));
});

test("summarizeWalletActivity: reports real principal, APR and collateral in tCTC", () => {
  const out = summarizeWalletActivity(ADDRESS, "borrower", [timeline({ loanHash: "0xa", aprBps: 950 })]);
  assert.match(out, /1\.0 tCTC principal|1 tCTC principal/);
  assert.match(out, /9\.50% APR/);
  assert.match(out, /collateral 1\.5 tCTC/);
});

test("summarizeWalletActivity: repaid-on-time loan is reported as such", () => {
  const out = summarizeWalletActivity(ADDRESS, "borrower", [
    timeline({ loanHash: "0xb", outcome: "repaid", fundedAt: 1000, dueAt: 2000, repaidAt: 1500, onTime: true }),
  ]);
  assert.match(out, /status: repaid/);
  assert.match(out, /repaid on time/);
});

test("summarizeWalletActivity: repaid-late loan is reported as such, not silently dropped", () => {
  const out = summarizeWalletActivity(ADDRESS, "borrower", [
    timeline({ loanHash: "0xc", outcome: "repaid", fundedAt: 1000, dueAt: 2000, repaidAt: 2500, onTime: false }),
  ]);
  assert.match(out, /repaid late/);
});

test("summarizeWalletActivity: funded (active) loan surfaces its real due date", () => {
  const out = summarizeWalletActivity(ADDRESS, "borrower", [
    timeline({ loanHash: "0xd", outcome: "funded", fundedAt: 1000, dueAt: 3600000 }),
  ]);
  assert.match(out, /status: funded \(active\)/);
  assert.match(out, /due at unix 3600000/);
});

test("summarizeWalletActivity: outcome counts in the header match the real mix", () => {
  const out = summarizeWalletActivity(ADDRESS, "lender", [
    timeline({ loanHash: "0xe", outcome: "repaid", onTime: true }),
    timeline({ loanHash: "0xf", outcome: "repaid", onTime: true }),
    timeline({ loanHash: "0xg", outcome: "pending" }),
  ]);
  assert.match(out, /3 agreements total/);
  assert.match(out, /2 repaid/);
  assert.match(out, /1 pending/);
});

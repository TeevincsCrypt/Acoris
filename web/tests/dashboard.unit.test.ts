/**
 * Deterministic tests for lib/dashboard.ts's pure aggregation over
 * LoanTimelineDto[] — no network, no wall-clock reads (nowSeconds is
 * always passed explicitly). Every number checked here is a real
 * arithmetic result of the synthetic input, never a placeholder.
 *
 * Run with: npx tsx --test tests/dashboard.unit.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildActivityFeed, computeActiveLoans, computeDashboardStats, timeAgo, type LoanTimelineDto } from "../lib/dashboard";

const DAY = 86400;

function timeline(overrides: Partial<LoanTimelineDto> & { loanHash: string }): LoanTimelineDto {
  return {
    borrower: "0x2222222222222222222222222222222222222222",
    lender: "0x1111111111111111111111111111111111111111",
    principalWei: "1000000000000000000",
    collateralWei: "1500000000000000000",
    aprBps: 800,
    durationSeconds: 30 * DAY,
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

test("computeDashboardStats sums principal across every timeline regardless of outcome", () => {
  const stats = computeDashboardStats([
    timeline({ loanHash: "a", principalWei: "1000000000000000000", outcome: "repaid" }),
    timeline({ loanHash: "b", principalWei: "2000000000000000000", outcome: "funded" }),
    timeline({ loanHash: "c", principalWei: "500000000000000000", outcome: "pending" }),
  ]);
  assert.equal(stats.totalCreditActivityWei, BigInt("3500000000000000000"));
});

test("computeDashboardStats buckets by real outcome, not invented categories", () => {
  const stats = computeDashboardStats([
    timeline({ loanHash: "a", outcome: "repaid" }),
    timeline({ loanHash: "b", outcome: "repaid" }),
    timeline({ loanHash: "c", outcome: "funded" }),
    timeline({ loanHash: "d", outcome: "defaulted" }),
    timeline({ loanHash: "e", outcome: "cancelled" }),
    timeline({ loanHash: "f", outcome: "pending" }),
  ]);
  assert.equal(stats.repaidCount, 2);
  assert.equal(stats.activeLoans, 1);
  assert.equal(stats.defaultedCount, 1);
  assert.equal(stats.cancelledCount, 1);
  assert.equal(stats.pendingCount, 1);
});

test("computeDashboardStats on an empty history is all zeros, not fabricated activity", () => {
  const stats = computeDashboardStats([]);
  assert.equal(stats.totalCreditActivityWei, BigInt(0));
  assert.equal(stats.activeLoans, 0);
  assert.equal(stats.repaidCount, 0);
});

test("computeActiveLoans only includes funded loans, computing real progress from fundedAt/dueAt", () => {
  const fundedAt = 1000;
  const dueAt = fundedAt + 30 * DAY;
  const now = fundedAt + 15 * DAY; // halfway through
  const loans = computeActiveLoans(
    [
      timeline({ loanHash: "active", outcome: "funded", fundedAt, dueAt }),
      timeline({ loanHash: "repaid", outcome: "repaid", fundedAt, dueAt, repaidAt: dueAt - DAY }),
      timeline({ loanHash: "pending", outcome: "pending" }),
    ],
    now,
  );
  assert.equal(loans.length, 1);
  assert.equal(loans[0].loanHash, "active");
  assert.ok(Math.abs(loans[0].progressPercent - 50) < 0.01);
  assert.equal(loans[0].isOverdue, false);
  assert.equal(loans[0].daysRemaining, 15);
});

test("computeActiveLoans flags a loan past its due date as overdue with negative days remaining", () => {
  const fundedAt = 1000;
  const dueAt = fundedAt + 30 * DAY;
  const now = dueAt + 5 * DAY;
  const loans = computeActiveLoans([timeline({ loanHash: "overdue", outcome: "funded", fundedAt, dueAt })], now);
  assert.equal(loans[0].isOverdue, true);
  assert.equal(loans[0].progressPercent, 100);
  assert.equal(loans[0].daysRemaining, -5);
});

test("buildActivityFeed emits one event per real transition and sorts newest first", () => {
  const events = buildActivityFeed([
    timeline({
      loanHash: "x",
      outcome: "repaid",
      proposedAt: 100,
      fundedAt: 200,
      repaidAt: 300,
      repayTxHash: "0xrepay-x",
    }),
  ]);
  assert.deepEqual(
    events.map((e) => e.type),
    ["repaid", "funded", "proposed"],
  );
  assert.equal(events[0].timestamp, 300);
  assert.equal(events[0].txHash, "0xrepay-x");
});

test("buildActivityFeed never invents a funded/repaid event for a loan that was never funded", () => {
  const events = buildActivityFeed([timeline({ loanHash: "never-funded", outcome: "pending" })]);
  assert.deepEqual(
    events.map((e) => e.type),
    ["proposed"],
  );
});

test("buildActivityFeed emits both the real proposal and the real cancellation for a cancelled proposal", () => {
  const events = buildActivityFeed([timeline({ loanHash: "c", outcome: "cancelled" })]);
  assert.deepEqual(
    events.map((e) => e.type).sort(),
    ["cancelled", "proposed"],
  );
});

test("timeAgo formats real elapsed time in increasing units", () => {
  assert.equal(timeAgo(1000, 1000), "just now");
  assert.equal(timeAgo(1000, 1000 + 30), "just now");
  assert.equal(timeAgo(1000, 1000 + 120), "2m ago");
  assert.equal(timeAgo(1000, 1000 + 2 * 3600), "2h ago");
  assert.equal(timeAgo(1000, 1000 + 3 * 86400), "3d ago");
});

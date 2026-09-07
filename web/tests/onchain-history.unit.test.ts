/**
 * Deterministic tests for lib/negotiation/onchain-history.ts's pure timeline
 * reconstruction — no network, synthetic-but-realistic AcorisLoanRegistry
 * event data (same shapes fetchOnChainLoanHistory would build from real
 * queryFilter() results). The real network boundary (fetchOnChainLoanHistory
 * itself) isn't reachable from this sandbox — see docs/ACORIS_LOAN_CONTRACT.md
 * — so it isn't exercised here.
 *
 * Run with: npx tsx --test tests/onchain-history.unit.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeOnTimeRepaymentRate,
  evidenceFromOnChainTimelines,
  reconstructLoanTimelines,
  type AmountEvent,
  type DefaultedEvent,
  type OnChainLoanEventBase,
  type ProposedEvent,
} from "../lib/negotiation/onchain-history";

const BORROWER = "0x2222222222222222222222222222222222222222";
const LENDER = "0x1111111111111111111111111111111111111111";
const DAY = 24 * 60 * 60;

function proposed(overrides: Partial<ProposedEvent> & { loanHash: string; blockTimestamp: number }): ProposedEvent {
  return {
    borrower: BORROWER,
    lender: LENDER,
    principal: BigInt(1000),
    collateral: BigInt(1700),
    aprBps: 900,
    durationSeconds: 30 * DAY,
    blockNumber: 1,
    transactionHash: `0xpropose-${overrides.loanHash}`,
    ...overrides,
  };
}

function amountEvent(loanHash: string, blockTimestamp: number, txHash: string): AmountEvent {
  return {
    loanHash,
    lender: LENDER,
    borrower: BORROWER,
    amount: BigInt(1000),
    blockNumber: 2,
    blockTimestamp,
    transactionHash: txHash,
  };
}

test("reconstructLoanTimelines: repaid before the due date is onTime", () => {
  const loanHash = "0xa1";
  const fundedAt = 1000;
  const durationSeconds = 30 * DAY;
  const timelines = reconstructLoanTimelines({
    proposed: [proposed({ loanHash, blockTimestamp: 900, durationSeconds })],
    funded: [amountEvent(loanHash, fundedAt, "0xfund-a1")],
    repaid: [amountEvent(loanHash, fundedAt + durationSeconds - 1, "0xrepay-a1")],
    defaulted: [],
    cancelled: [],
  });

  assert.equal(timelines.length, 1);
  const t = timelines[0];
  assert.equal(t.outcome, "repaid");
  assert.equal(t.onTime, true);
  assert.equal(t.dueAt, fundedAt + durationSeconds);
  assert.equal(t.repayTxHash, "0xrepay-a1");
});

test("reconstructLoanTimelines: repaid after the due date is NOT onTime", () => {
  const loanHash = "0xa2";
  const fundedAt = 1000;
  const durationSeconds = 30 * DAY;
  const timelines = reconstructLoanTimelines({
    proposed: [proposed({ loanHash, blockTimestamp: 900, durationSeconds })],
    funded: [amountEvent(loanHash, fundedAt, "0xfund-a2")],
    repaid: [amountEvent(loanHash, fundedAt + durationSeconds + 1, "0xrepay-a2")],
    defaulted: [],
    cancelled: [],
  });

  assert.equal(timelines[0].outcome, "repaid");
  assert.equal(timelines[0].onTime, false);
});

test("reconstructLoanTimelines: repaid exactly at the due date counts as onTime (inclusive)", () => {
  const loanHash = "0xa3";
  const fundedAt = 1000;
  const durationSeconds = 30 * DAY;
  const timelines = reconstructLoanTimelines({
    proposed: [proposed({ loanHash, blockTimestamp: 900, durationSeconds })],
    funded: [amountEvent(loanHash, fundedAt, "0xfund-a3")],
    repaid: [amountEvent(loanHash, fundedAt + durationSeconds, "0xrepay-a3")],
    defaulted: [],
    cancelled: [],
  });
  assert.equal(timelines[0].onTime, true);
});

test("reconstructLoanTimelines: defaulted loan has a determined (false) onTime only if it was ever funded", () => {
  const loanHash = "0xa4";
  const fundedAt = 1000;
  const durationSeconds = 30 * DAY;
  const defaultedEvent: DefaultedEvent = {
    loanHash,
    collateralSeized: BigInt(1700),
    blockNumber: 3,
    blockTimestamp: fundedAt + durationSeconds + 10,
    transactionHash: "0xdefault-a4",
  };
  const timelines = reconstructLoanTimelines({
    proposed: [proposed({ loanHash, blockTimestamp: 900, durationSeconds })],
    funded: [amountEvent(loanHash, fundedAt, "0xfund-a4")],
    repaid: [],
    defaulted: [defaultedEvent],
    cancelled: [],
  });
  assert.equal(timelines[0].outcome, "defaulted");
  // Never repaid, so repaidAt is null — onTime is not derivable (null), not falsely "false".
  assert.equal(timelines[0].onTime, null);
});

test("reconstructLoanTimelines: a merely-proposed loan (never funded) is pending with no onTime", () => {
  const loanHash = "0xa5";
  const timelines = reconstructLoanTimelines({
    proposed: [proposed({ loanHash, blockTimestamp: 900 })],
    funded: [],
    repaid: [],
    defaulted: [],
    cancelled: [],
  });
  assert.equal(timelines[0].outcome, "pending");
  assert.equal(timelines[0].fundedAt, null);
  assert.equal(timelines[0].dueAt, null);
  assert.equal(timelines[0].onTime, null);
});

test("reconstructLoanTimelines: a funded-but-not-yet-repaid loan is 'funded'", () => {
  const loanHash = "0xa6";
  const timelines = reconstructLoanTimelines({
    proposed: [proposed({ loanHash, blockTimestamp: 900 })],
    funded: [amountEvent(loanHash, 1000, "0xfund-a6")],
    repaid: [],
    defaulted: [],
    cancelled: [],
  });
  assert.equal(timelines[0].outcome, "funded");
  assert.equal(timelines[0].onTime, null);
});

test("reconstructLoanTimelines: a cancelled proposal is 'cancelled' even if (impossibly) other events exist", () => {
  const loanHash = "0xa7";
  const cancelledEvent: OnChainLoanEventBase = {
    loanHash,
    blockNumber: 2,
    blockTimestamp: 950,
    transactionHash: "0xcancel-a7",
  };
  const timelines = reconstructLoanTimelines({
    proposed: [proposed({ loanHash, blockTimestamp: 900 })],
    funded: [],
    repaid: [],
    defaulted: [],
    cancelled: [cancelledEvent],
  });
  assert.equal(timelines[0].outcome, "cancelled");
});

test("computeOnTimeRepaymentRate averages only determined outcomes", () => {
  const durationSeconds = 30 * DAY;
  const timelines = reconstructLoanTimelines({
    proposed: [
      proposed({ loanHash: "0xb1", blockTimestamp: 0, durationSeconds }),
      proposed({ loanHash: "0xb2", blockTimestamp: 0, durationSeconds }),
      proposed({ loanHash: "0xb3", blockTimestamp: 0, durationSeconds }),
    ],
    funded: [
      amountEvent("0xb1", 1000, "0xfund-b1"),
      amountEvent("0xb2", 1000, "0xfund-b2"),
      amountEvent("0xb3", 1000, "0xfund-b3"),
    ],
    repaid: [
      amountEvent("0xb1", 1000 + durationSeconds - 1, "0xrepay-b1"), // on time
      amountEvent("0xb2", 1000 + durationSeconds + 1, "0xrepay-b2"), // late
    ],
    // b3 stays funded (pending repayment) — must not count in the rate.
    defaulted: [],
    cancelled: [],
  });

  assert.equal(computeOnTimeRepaymentRate(timelines), 0.5);
});

test("computeOnTimeRepaymentRate is null when nothing has a determined outcome", () => {
  const timelines = reconstructLoanTimelines({
    proposed: [proposed({ loanHash: "0xc1", blockTimestamp: 0 })],
    funded: [],
    repaid: [],
    defaulted: [],
    cancelled: [],
  });
  assert.equal(computeOnTimeRepaymentRate(timelines), null);
});

test("evidenceFromOnChainTimelines only includes repaid/defaulted outcomes, carrying the real onTime", () => {
  const durationSeconds = 30 * DAY;
  const timelines = reconstructLoanTimelines({
    proposed: [
      proposed({ loanHash: "0xd1", blockTimestamp: 0, durationSeconds }),
      proposed({ loanHash: "0xd2", blockTimestamp: 0, durationSeconds }),
      proposed({ loanHash: "0xd3", blockTimestamp: 0, durationSeconds }),
    ],
    funded: [
      amountEvent("0xd1", 1000, "0xfund-d1"),
      amountEvent("0xd2", 1000, "0xfund-d2"),
      // d3 never funded — stays pending.
    ],
    repaid: [amountEvent("0xd1", 1000 + durationSeconds - 1, "0xrepay-d1")],
    defaulted: [
      { loanHash: "0xd2", collateralSeized: BigInt(1700), blockNumber: 4, blockTimestamp: 1000 + durationSeconds + 100, transactionHash: "0xdefault-d2" },
    ],
    cancelled: [],
  });

  const evidence = evidenceFromOnChainTimelines(timelines);
  assert.equal(evidence.length, 2, "pending d3 must not appear as evidence");

  const repaidEvidence = evidence.find((e) => e.transactionHash === "0xrepay-d1");
  assert.ok(repaidEvidence);
  assert.equal(repaidEvidence?.status, "success");
  assert.equal(repaidEvidence?.onTime, true);
  assert.equal(repaidEvidence?.sourceChain, "cc3-testnet");

  const defaultedEvidence = evidence.find((e) => e.transactionHash === "0xpropose-0xd2");
  assert.ok(defaultedEvidence, "a defaulted loan with no repay tx falls back to its propose tx hash");
  assert.equal(defaultedEvidence?.status, "failed");
});

/**
 * Deterministic, non-network unit tests for lib/attestcoin.ts.
 *
 * These do NOT hit any network — Sepolia/CC3 RPC access is blocked in this
 * sandbox (see docs/ACORIS_TECHNICAL_FOUNDATION_REPORT.md, Phase 2 network
 * notes). Instead they validate our own byte-decoding and chain-key
 * resolution logic directly, using real on-chain values captured from
 * @gluwa/usc-sdk's own shipped test fixture
 * (node_modules/@gluwa/usc-sdk/tests/smoke/query.builder.test.ts, the
 * "Build query from transactions with multiple events" test) for the
 * EXAMPLE_SEPOLIA_TX_HASH transaction. Those word values are asserted
 * verbatim in that upstream test file, so decoding them correctly here is a
 * genuine regression check against real on-chain data, not fabricated data
 * — only the lender/borrower/amount words are clearly-labeled synthetic
 * placeholders (the upstream test doesn't assert those specific values).
 *
 * Run with: npx tsx --test tests/attestcoin.unit.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { concat, zeroPadValue, toBeHex } from "ethers";

import {
  resolveSepoliaChainKey,
  SepoliaNotSupportedError,
  fieldToAddress,
  fieldToUint,
  extractRepayLoanFact,
  isLikelyNetworkBlocked,
  type FieldPlanEntry,
  type SourceChain,
} from "../lib/attestcoin";

// ---------------------------------------------------------------------------
// resolveSepoliaChainKey
// ---------------------------------------------------------------------------

test("resolveSepoliaChainKey finds Sepolia by chainId, never assumes a fixed chainKey", () => {
  const chains: SourceChain[] = [
    { chainKey: 1, chainId: 1, chainName: "ethereum" },
    { chainKey: 7, chainId: 11155111, chainName: "sepolia" },
    { chainKey: 3, chainId: 97, chainName: "bsc-testnet" },
  ];
  assert.equal(resolveSepoliaChainKey(chains), 7);
});

test("resolveSepoliaChainKey works regardless of chainKey ordering/value (not hardcoded)", () => {
  // Same logical chain list, but Sepolia's chainKey is a totally different
  // number here — proves we resolve by chainId, not by an assumed constant.
  const chains: SourceChain[] = [{ chainKey: 42, chainId: 11155111, chainName: "sepolia" }];
  assert.equal(resolveSepoliaChainKey(chains), 42);
});

test("resolveSepoliaChainKey throws SepoliaNotSupportedError when Sepolia isn't in the live list", () => {
  const chains: SourceChain[] = [{ chainKey: 1, chainId: 1, chainName: "ethereum" }];
  assert.throws(() => resolveSepoliaChainKey(chains), SepoliaNotSupportedError);
});

// ---------------------------------------------------------------------------
// fieldToAddress / fieldToUint — validated against real captured tx bytes
// ---------------------------------------------------------------------------

// Real 32-byte words, copied verbatim from the assertions in
// @gluwa/usc-sdk's tests/smoke/query.builder.test.ts for transaction
// 0x202b9b1d689578cf7dd7b279b3c9cb02f47cef7b44b6fa1650ab67977f86cb11.
const REAL_WORDS = {
  rxStatus: "0x0000000000000000000000000000000000000000000000000000000000000001",
  txFrom: "0x0000000000000000000000002fabaffc7f6426c1beedec22cc150a7dbe6667fb",
  txTo: "0x00000000000000000000000039de412201f2446b3606c93dfb799ede6a721b13",
  loanEventAddress: "0x00000000000000000000000039de412201f2446b3606c93dfb799ede6a721b13",
  loanEventSignature: "0x573e759e6d2d7f0706fd825699c62290a3b275b297dc5cda4a96856a251d00a0",
  loanHash: "0xaf840a790d0056fa2c551a54a9b845e8f427107fe6570c41d89ecfe396d32f98",
  transferEventAddress: "0x000000000000000000000000296077f69435a073f7a6e0cbaef8c1877633832e",
  transferEventSignature: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  transferFrom: "0x0000000000000000000000002fabaffc7f6426c1beedec22cc150a7dbe6667fb",
  transferTo: "0x0000000000000000000000001c2ade017a8af7229ebab076f5c3db41a63fe422",
  transferValue: "0x0000000000000000000000000000000000000000000000000de0b7ffe3ae3825",
} as const;

test("fieldToAddress recovers the correct checksummed address from a real padded word (TxFrom)", () => {
  const field: FieldPlanEntry = { offset: 0, size: 32 };
  assert.equal(fieldToAddress(REAL_WORDS.txFrom, field), "0x2FabAFfC7F6426C1beEdec22cc150A7dBE6667FB");
});

test("fieldToAddress recovers the loan contract address (TxTo == loan event emitter)", () => {
  const field: FieldPlanEntry = { offset: 0, size: 32 };
  assert.equal(fieldToAddress(REAL_WORDS.txTo, field), fieldToAddress(REAL_WORDS.loanEventAddress, field));
  assert.equal(fieldToAddress(REAL_WORDS.txTo, field), "0x39DE412201f2446b3606C93dFB799EdE6a721b13");
});

test("fieldToAddress recovers the Transfer recipient address", () => {
  const field: FieldPlanEntry = { offset: 0, size: 32 };
  assert.equal(fieldToAddress(REAL_WORDS.transferTo, field), "0x1c2ADe017a8AF7229EbAb076f5C3DB41A63fE422");
});

test("fieldToUint decodes the real RxStatus word as 1n (success)", () => {
  const field: FieldPlanEntry = { offset: 0, size: 32 };
  assert.equal(fieldToUint(REAL_WORDS.rxStatus, field), BigInt(1));
});

test("fieldToUint decodes the real Transfer value word correctly", () => {
  const field: FieldPlanEntry = { offset: 0, size: 32 };
  assert.equal(fieldToUint(REAL_WORDS.transferValue, field), BigInt("0xde0b7ffe3ae3825"));
});

test("fieldToAddress reads at a non-zero offset inside a larger buffer", () => {
  // Two real words concatenated; make sure offset math is right, not just
  // offset-0 special-cased.
  const buffer = concat([REAL_WORDS.txFrom, REAL_WORDS.txTo]);
  const first: FieldPlanEntry = { offset: 0, size: 32 };
  const second: FieldPlanEntry = { offset: 32, size: 32 };
  assert.equal(fieldToAddress(buffer, first), "0x2FabAFfC7F6426C1beEdec22cc150A7dBE6667FB");
  assert.equal(fieldToAddress(buffer, second), "0x39DE412201f2446b3606C93dFB799EdE6a721b13");
});

// ---------------------------------------------------------------------------
// extractRepayLoanFact — full 14-field plan against a synthetic buffer built
// from the real words above (+ 3 clearly-labeled synthetic placeholders for
// lender/borrower/amount, which the upstream test doesn't assert values for)
// ---------------------------------------------------------------------------

test("extractRepayLoanFact decodes a full field plan into a structured fact", () => {
  const PLACEHOLDER_LENDER = zeroPadValue("0x1111111111111111111111111111111111111111", 32);
  const PLACEHOLDER_BORROWER = zeroPadValue("0x2222222222222222222222222222222222222222", 32);
  const PLACEHOLDER_AMOUNT = toBeHex(BigInt("1000000000000000000"), 32); // 1e18, a round placeholder

  const words = [
    REAL_WORDS.rxStatus, // 0
    REAL_WORDS.txFrom, // 1
    REAL_WORDS.txTo, // 2
    REAL_WORDS.loanEventAddress, // 3
    REAL_WORDS.loanEventSignature, // 4
    REAL_WORDS.loanHash, // 5
    PLACEHOLDER_LENDER, // 6 (synthetic — not asserted by upstream test)
    PLACEHOLDER_BORROWER, // 7 (synthetic)
    PLACEHOLDER_AMOUNT, // 8 (synthetic)
    REAL_WORDS.transferEventAddress, // 9
    REAL_WORDS.transferEventSignature, // 10
    REAL_WORDS.transferFrom, // 11
    REAL_WORDS.transferTo, // 12
    REAL_WORDS.transferValue, // 13
  ];

  const txBytesHex = concat(words);
  const fields: FieldPlanEntry[] = words.map((_, i) => ({ offset: i * 32, size: 32 }));

  const fact = extractRepayLoanFact(txBytesHex, fields);

  assert.equal(fact.kind, "sepolia-loan-repayment");
  assert.equal(fact.transactionStatus, "success");
  assert.equal(fact.transactionFrom, "0x2FabAFfC7F6426C1beEdec22cc150A7dBE6667FB");
  assert.equal(fact.transactionTo, "0x39DE412201f2446b3606C93dFB799EdE6a721b13");

  assert.equal(fact.loanEvent.contract, "0x39DE412201f2446b3606C93dFB799EdE6a721b13");
  assert.equal(fact.loanEvent.loanHash, "0xaf840a790d0056fa2c551a54a9b845e8f427107fe6570c41d89ecfe396d32f98");
  assert.equal(fact.loanEvent.lender, "0x1111111111111111111111111111111111111111");
  assert.equal(fact.loanEvent.borrower, "0x2222222222222222222222222222222222222222");
  assert.equal(fact.loanEvent.amountWei, "1000000000000000000");

  assert.equal(fact.transferEvent.contract, "0x296077f69435a073f7A6E0CBAEf8C1877633832E");
  assert.equal(fact.transferEvent.from, "0x2FabAFfC7F6426C1beEdec22cc150A7dBE6667FB");
  assert.equal(fact.transferEvent.to, "0x1c2ADe017a8AF7229EbAb076f5C3DB41A63fE422");
  assert.equal(fact.transferEvent.valueWei, BigInt("0xde0b7ffe3ae3825").toString());
});

test("extractRepayLoanFact rejects a field plan that isn't exactly 14 entries", () => {
  assert.throws(() => extractRepayLoanFact("0x00", []), /expected 14 fields/);
});

// ---------------------------------------------------------------------------
// isLikelyNetworkBlocked
// ---------------------------------------------------------------------------

test("isLikelyNetworkBlocked recognizes common Node connectivity error codes", () => {
  assert.equal(isLikelyNetworkBlocked(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })), true);
  assert.equal(isLikelyNetworkBlocked(Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" })), true);
  assert.equal(isLikelyNetworkBlocked(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), true);
});

test("isLikelyNetworkBlocked recognizes an axios-style 403 response", () => {
  assert.equal(isLikelyNetworkBlocked({ message: "Request failed", response: { status: 403 } }), true);
});

test("isLikelyNetworkBlocked does not flag a genuine application error", () => {
  assert.equal(isLikelyNetworkBlocked(new Error("transaction 0xabc not found on Sepolia")), false);
  assert.equal(isLikelyNetworkBlocked(new Error("could not find an event")), false);
});

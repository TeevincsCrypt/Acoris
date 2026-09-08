/**
 * Deterministic tests for resolveLoanHash — the input-resolution logic
 * behind the /agreement lookup page, which has to accept either a raw
 * loanHash or the negotiationId it was derived from, and treat them
 * identically to computeLoanHash so a shared /agreement?loanHash=... link
 * and a pasted negotiationId both resolve to the same on-chain agreement.
 *
 * Run with: npx tsx --test tests/agreement-lookup.unit.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveLoanHash } from "../components/agreement/AgreementLookupPanel";
import { computeLoanHash } from "../lib/loan-contract";

test("a well-formed loanHash is returned as-is", () => {
  const hash = computeLoanHash("negotiation-abc");
  assert.equal(resolveLoanHash(hash), hash);
});

test("a negotiationId is hashed the same way computeLoanHash does, not treated as a hash", () => {
  const negotiationId = "negotiation-abc";
  assert.equal(resolveLoanHash(negotiationId), computeLoanHash(negotiationId));
});

test("surrounding whitespace is trimmed before either check", () => {
  const hash = computeLoanHash("negotiation-abc");
  assert.equal(resolveLoanHash(`  ${hash}  `), hash);
  assert.equal(resolveLoanHash("  negotiation-abc  "), computeLoanHash("negotiation-abc"));
});

test("empty or whitespace-only input resolves to null rather than hashing an empty string", () => {
  assert.equal(resolveLoanHash(""), null);
  assert.equal(resolveLoanHash("   "), null);
});

test("a too-short or malformed 0x string is treated as a negotiationId, not rejected", () => {
  // Anything that isn't exactly a 0x + 64 hex chars falls through to being
  // hashed as an id — this is deliberate: a borrower could plausibly send a
  // negotiationId that happens to start with "0x" as a label, and this
  // should still resolve rather than silently produce nothing.
  const looksHashLike = "0x1234";
  assert.equal(resolveLoanHash(looksHashLike), computeLoanHash(looksHashLike));
});

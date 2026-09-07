/**
 * Deterministic tests for lib/wallet-context.tsx's provider-error-code
 * walker — no browser, no network. Written after a live Rabby wallet
 * session reported a real "could not coalesce error" wrapping 4902 two
 * levels deeper than the shape this code originally assumed (MetaMask's
 * `err.error.code`); this locks in support for both real shapes plus the
 * simplest unwrapped one.
 *
 * Run with: npx tsx --test tests/wallet-context.unit.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { hasProviderErrorCode } from "../lib/wallet-context";

test("finds the code when it's directly on the error (raw EIP-1193 provider)", () => {
  assert.equal(hasProviderErrorCode({ code: 4902, message: "Unrecognized chain" }, 4902), true);
});

test("finds the code one level down, under .error (MetaMask via ethers' BrowserProvider wrap)", () => {
  const err = { code: "UNKNOWN_ERROR", error: { code: 4902, message: "Unrecognized chain" } };
  assert.equal(hasProviderErrorCode(err, 4902), true);
});

test("finds the code nested under .error.data.originalError (real Rabby wallet shape)", () => {
  const err = {
    code: "UNKNOWN_ERROR",
    error: {
      code: -32603,
      data: {
        originalError: {
          code: 4902,
          message: 'Unrecognized chain ID "0x18e8f". Try adding the chain using wallet_switchEthereumChain first.',
        },
      },
      message: 'Unrecognized chain ID "0x18e8f". Try adding the chain using wallet_switchEthereumChain first.',
    },
    payload: { id: 2, jsonrpc: "2.0", method: "wallet_switchEthereumChain" },
  };
  assert.equal(hasProviderErrorCode(err, 4902), true);
});

test("returns false when the code genuinely isn't 4902 anywhere in the chain", () => {
  const err = { code: "UNKNOWN_ERROR", error: { code: -32603, message: "Some other internal error" } };
  assert.equal(hasProviderErrorCode(err, 4902), false);
});

test("returns false for a plain Error with no code at all", () => {
  assert.equal(hasProviderErrorCode(new Error("Unrelated failure"), 4902), false);
});

test("returns false for non-object / nullish input without throwing", () => {
  assert.equal(hasProviderErrorCode(null, 4902), false);
  assert.equal(hasProviderErrorCode(undefined, 4902), false);
  assert.equal(hasProviderErrorCode("some string error", 4902), false);
});

test("does not infinite-loop on a cyclic error object", () => {
  const err: Record<string, unknown> = { code: -32603 };
  err.error = err; // self-reference
  assert.equal(hasProviderErrorCode(err, 4902), false);
});

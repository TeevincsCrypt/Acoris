# Acoris AI Credit Negotiation Engine — Phase 3A + 3B

A structured negotiation state machine between a Borrower AI and a Lender AI,
not a chatbot. Every round is machine-readable data. Financial constraints
are enforced by deterministic application code — the LLM proposes, it is
never trusted to enforce a limit.

## Architecture

```
web/lib/negotiation/
  types.ts           Shared types: LoanRequest, VerifiedFinancialProfile,
                      NegotiationRound, LoanTerms, constraints. No side effects.
  constraints.ts      Pure, deterministic: derives Borrower/Lender constraints,
                      validates offers, clamps out-of-bounds proposals.
  financial-profile.ts Builds a VerifiedFinancialProfile strictly from
                      VerificationEvidenceRef[] — never invents numbers.
                      Two evidence *sources* feed it (see "Evidence sources"
                      below): evidenceFromAttestcoinResults (Phase 2,
                      cross-chain) and evidenceFromOnChainTimelines (Phase 3B,
                      native CC3). Evidence from either or both can be merged
                      before aggregation.
  onchain-history.ts  Phase 3B. Reads AcorisLoanRegistry's own event log
                      directly from CC3 Testnet (same-chain, no cross-chain
                      proof needed) and reconstructs each agreement's real
                      timeline — proposedAt/fundedAt/dueAt/repaidAt — so
                      `onTimeRepaymentRate` can be a real computed boolean
                      instead of always null.
  round-logic.ts      Pure state-transition logic (one round in, one
                      NegotiationRound out) + final-terms derivation. No LLM,
                      no network — this is what makes negotiation termination
                      and agreement generation unit-testable.
  ai-agent.ts         Server-only. Calls Claude (Anthropic API) for one
                      structured decision per turn. Proposes only — never
                      enforces.
  engine.ts           Server-only. Orchestrates: alternates agents, calls
                      ai-agent.ts, runs the result through round-logic.ts.
                      Phase 3B: takes an optional `onRound` callback, invoked
                      synchronously right after each round is recorded, so a
                      caller can stream progress live.

web/app/api/negotiation/run/route.ts   POST endpoint: resolves the financial
                                        profile (fast-fail JSON on validation
                                        / evidence / AI-availability errors),
                                        then streams the negotiation as
                                        newline-delimited JSON.
web/components/negotiation/NegotiationConsole.tsx   UI.
web/app/negotiation/page.tsx                        Page.
```

### Why `round-logic.ts` is separate from `engine.ts`

`engine.ts` and `ai-agent.ts` both `import "server-only"`. That package's
`default` export condition is a module that unconditionally throws — it only
resolves to a no-op under the `react-server` condition Next.js sets during
its own server bundling. Outside that (a plain Node test runner, for
instance), importing either file throws immediately. Pulling the pure
round/termination logic into `round-logic.ts` (no `server-only`, no LLM
calls) is what makes it possible to unit-test negotiation termination and
agreement generation without a live AI call — confirmed by actually hitting
this while writing the tests, not assumed in advance.

## Deterministic enforcement (what the LLM can't override)

`ai-agent.ts` asks Claude for a candidate `{action, amount, collateral, apr,
durationDays, reasoning}` via structured outputs. `round-logic.ts`'s
`enforceAndBuildRound` then:

- Forces round 1 to be `OFFER` regardless of what was proposed (there's
  nothing to accept/reject/counter yet).
- On `ACCEPT`, adopts the **counterpart's exact last-offered terms** — never
  the accepting agent's own (possibly drifted) numbers — and re-clamps them
  to the accepting agent's own constraints as a defense-in-depth check.
- On `OFFER`/`COUNTER`, always runs the proposed numbers through
  `clampToBorrowerConstraints` / `clampToLenderConstraints` (`constraints.ts`)
  before they're recorded. A clamped round is flagged `wasClamped: true` and
  shown as such in the UI.
- Caps total rounds at `MAX_NEGOTIATION_ROUNDS` (8); reaching it without an
  accept/reject yields `status: "max-rounds-reached"` and final terms
  `status: "no-agreement"`.

None of this is prompted-around — it's plain arithmetic in `constraints.ts`,
independent of anything the model says.

## Verified financial profile — never fabricated

`VerifiedFinancialProfile` is a three-way discriminated union:

- `{status: "not-available"}` — no evidence submitted or attempted.
- `{status: "unverified", claimedSummary?}` — a borrower's self-reported
  claim, explicitly **not** backed by proof.
- `{status: "verified", verifiedRepaymentCount, ..., verificationEvidence}` —
  built only from genuine, `ok: true` Phase 2 `AttestcoinVerificationResult`s.

`deriveLenderConstraints` (`constraints.ts`) is the one place verified
history is allowed to affect pricing, and it only ever reads the `"verified"`
branch — `"unverified"` and `"not-available"` both get the identical,
conservative baseline (`DEFAULT_LENDER_RISK_POLICY.baseMinApr` /
`baseMinCollateralRatio`). This is enforced in code
(`tests/negotiation.unit.test.ts` asserts `deriveLenderConstraints(request,
{status: "not-available"})` and `deriveLenderConstraints(request,
{status: "unverified"})` produce identical constraints), not just requested
in the prompt — though the prompt also tells the Lender AI never to treat
unverified claims as verified.

`onTimeRepaymentRate` is computed only from evidence entries whose `onTime`
is genuinely known (`VerificationEvidenceRef.onTime: boolean | null`), never
invented for entries that don't support it. The two evidence sources differ
here:

- **Phase 2, Attestcoin (cross-chain, e.g. Sepolia)** — the current
  `VerifiedRepayLoanFact` shape (`lib/attestcoin.ts`) carries no due-date, so
  `onTime` is always `null` for this source.
- **Phase 3B, native CC3 on-chain history** (`onchain-history.ts`) — computes
  a real boolean: `dueAt = fundedAt + durationSeconds` (both real block
  timestamps read from CC3), `onTime = repaidAt <= dueAt`.

If a profile is built purely from Sepolia-via-Attestcoin evidence,
`onTimeRepaymentRate` stays `null` (no entries have a determined `onTime`,
same as Phase 3A). If it includes any on-chain-history evidence, the rate is
computed across whichever entries have a determined `onTime`.

### Evidence sources: how they reach the negotiation

`POST /api/negotiation/run` accepts `financialEvidence` in one of four
shapes — critically, a client can only ever supply **raw inputs to
independently re-derive evidence from** (transaction hashes, a borrower
address), never a "verified" result directly:

```ts
{ mode: "none" }
{ mode: "unverified", claimedSummary?: string }
{ mode: "verify", transactionHashes: string[] }      // up to 10 Sepolia txs;
                                                        // server independently
                                                        // re-runs Phase 2's
                                                        // runAttestcoinVerification
                                                        // for each hash
{ mode: "onchain", borrowerAddress: string }          // Phase 3B: reads
                                                        // AcorisLoanRegistry's
                                                        // real event log for
                                                        // this borrower
                                                        // directly from CC3
```

- `"verify"` calls `runAttestcoinVerification` (Phase 2, unmodified) for
  every hash, turns genuine successes into evidence via
  `evidenceFromAttestcoinResults`, then aggregates with
  `buildVerifiedFinancialProfile`. A blocked or failed verification simply
  yields no evidence for that hash — it never falls back to trusting the
  claim.
- `"onchain"` is genuinely disabled — not just visually, in both the UI and
  the API route — until `NEXT_PUBLIC_LOAN_REGISTRY_ADDRESS` is actually set
  to a deployed AcorisLoanRegistry (same gate `lib/loan-contract.ts` uses for
  the "Execute on Creditcoin" button; see `docs/ACORIS_LOAN_CONTRACT.md` for
  why nothing is deployed in this sandbox). When deployed, the route opens a
  `JsonRpcProvider` against CC3 Testnet, calls `fetchOnChainLoanHistory`, and
  aggregates the resulting evidence the same way. Not deployed → an honest
  `502` naming exactly why, never fabricated history.

## Streaming (Phase 3B)

`POST /api/negotiation/run` no longer waits for the whole negotiation before
responding. Once the loan request validates, the financial profile resolves,
and `ANTHROPIC_API_KEY` is confirmed present (`isAIConfigured()` — a cheap
synchronous check so this stays a fast-fail plain JSON response, not a
stream, when the AI truly can't run), the route opens a `ReadableStream` and
runs `runNegotiation({ ..., onRound })`, where `onRound` writes one
newline-delimited JSON message per round as it's decided:

```
{"type":"round","round":{...}}
{"type":"round","round":{...}}
{"type":"complete","result":{...}}
```

(or a single `{"type":"error","error":"...","code":"..."}` if the AI call
fails mid-negotiation, e.g. a rate limit on round 3). Content-Type is
`application/x-ndjson`. The client (`NegotiationConsole.tsx`) consumes this
with `res.body.getReader()`, decoding and appending each round to the UI as
it actually arrives — there is no more client-side `setInterval` reveal
timer standing in for real progress.

Validation errors (400), evidence-resolution failures (502), and
AI-not-configured (503) are all still single plain JSON responses returned
*before* the stream opens, so the client can tell a fast-fail from a stream
by status code / `Content-Type` without needing to speculatively parse
partial NDJSON.

## AI provider

`@anthropic-ai/sdk` (structured outputs via `client.messages.parse()` +
`zodOutputFormat`), model `claude-opus-5`. Verified against the installed
package source before writing any code — `node_modules/@anthropic-ai/sdk/src/helpers/zod.ts`
and `resources/messages/messages.d.ts` — not assumed from memory. Both agent
prompts (`proposeBorrowerAction`, `proposeLenderAction` in `ai-agent.ts`)
explicitly instruct the model that constraints are enforced elsewhere, so it
should focus on a well-reasoned negotiating position rather than trying to
game its own limits.

`ai-agent.ts` reads `ANTHROPIC_API_KEY` from the server environment only
(`new Anthropic()`, zero-arg — never passed to or read by the client). If
unset, `getClient()` throws `AIUnavailableError` immediately — there is no
silent fallback that fabricates a plausible-looking response. The API route
maps this to `503 {code: "ai-unavailable"}`, and the UI shows that
explicitly rather than a fake negotiation.

## What was and wasn't verified live in this sandbox

This sandbox has no `ANTHROPIC_API_KEY` configured (confirmed: `env | grep
-i anthropic` finds nothing, no `ant` CLI present for an OAuth profile
either). `api.anthropic.com` **is** reachable from here (it's on the
sandbox's egress allowlist, unlike the Creditcoin/Sepolia hosts in Phase 2)
— but without credentials, a live call cannot be made or tested from this
session.

A real run against this project's own dev server was captured:

```
$ curl -X POST /api/negotiation/run -d '{"loanRequest": {...}, "financialEvidence": {"mode": "none"}}'
{"error":"ANTHROPIC_API_KEY is not configured on the server — the negotiation AI cannot run.","code":"ai-unavailable"}
```

This confirms the integration is wired correctly up to the point where a
credential is required, and stops there honestly — exactly the same pattern
as Phase 2's network boundary. The `"verify"` evidence path was also
exercised live end-to-end (composing with Phase 2's real, network-blocked
pipeline) and correctly produced `{status: "not-available"}` before failing
at the same AI boundary.

**Still requires manual verification**, by someone with a configured
`ANTHROPIC_API_KEY`: run a full negotiation and confirm (a) it reaches a
terminal state (`accepted`/`rejected`/`no-agreement`) within the round limit,
(b) the Lender AI's reasoning text actually references the verified-evidence
status it was given, and (c) no round's terms ever violate the constraints
computed for that agent (the deterministic layer guarantees this
structurally, but worth eyeballing real model output once).

## Tests

- `web/tests/negotiation.unit.test.ts` — 35 deterministic tests, no network,
  no LLM: constraint validation, invalid lender/borrower offers, APR limits,
  collateral requirements, negotiation termination (forced opening round,
  ACCEPT adopts the counterpart's exact terms, REJECT, max-rounds-reached),
  agreement generation, absence/presence of verified evidence (including
  that a blocked Phase 2 verification never counts as evidence, that
  `"not-available"` and `"unverified"` price identically), and Phase 3B's
  `evidenceFromAttestcoinResults` + `onTimeRepaymentRate` aggregation across
  merged evidence sources.
  `npx tsx --test tests/negotiation.unit.test.ts`
- `web/tests/onchain-history.unit.test.ts` — 10 deterministic tests, no
  network: `reconstructLoanTimelines` against synthetic-but-realistic
  AcorisLoanRegistry event data (on-time / late / exactly-at-due-date /
  never-repaid / never-funded / cancelled), `computeOnTimeRepaymentRate`, and
  `evidenceFromOnChainTimelines`'s filtering (only repaid/defaulted outcomes
  become evidence).
  `npx tsx --test tests/onchain-history.unit.test.ts`
- `web/tests/e2e-negotiation.mjs` — spawns the real dev server, hits the
  real API route and UI. Asserts the AI-unavailable path is reported
  honestly (a single plain JSON 503, real error, no fabricated rounds/terms,
  returned before any stream would open), that the on-chain evidence mode
  fails honestly with a 502 when the registry isn't deployed, that multiple
  transaction hashes are accepted by the schema, and — on an environment
  with a real key — that the resulting NDJSON stream decodes into an
  internally-consistent sequence of round messages followed by exactly one
  complete message with a valid terminal status.
  `node tests/e2e-negotiation.mjs`

## What remains for Phase 4 / beyond

- **Phase 3B** (this phase): done — multi-tx verified evidence, native CC3
  on-chain history with real due-date tracking, and live NDJSON streaming
  are all implemented as described above. Not done, and out of this phase's
  explicit scope: multiple simultaneous lenders, negotiation strategies
  beyond single-shot per-round proposals, persisting negotiation history.
- **Phase 4**: the `AcorisLoanRegistry.sol` contract itself is implemented
  (see `docs/ACORIS_LOAN_CONTRACT.md`) and the negotiation UI's "Execute on
  Creditcoin" button calls it for real once a wallet is connected — but the
  contract is not deployed to CC3 Testnet in this sandbox (no funded
  deployer key, no network access), so both the button and the `"onchain"`
  evidence mode stay genuinely, not just visually, disabled here.

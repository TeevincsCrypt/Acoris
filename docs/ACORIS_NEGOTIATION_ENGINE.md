# Acoris AI Credit Negotiation Engine — Phase 3A

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
  financial-profile.ts Builds a VerifiedFinancialProfile strictly from real
                      Phase 2 AttestcoinVerificationResult[] — never invents
                      numbers.
  round-logic.ts      Pure state-transition logic (one round in, one
                      NegotiationRound out) + final-terms derivation. No LLM,
                      no network — this is what makes negotiation termination
                      and agreement generation unit-testable.
  ai-agent.ts         Server-only. Calls Claude (Anthropic API) for one
                      structured decision per turn. Proposes only — never
                      enforces.
  engine.ts           Server-only. Orchestrates: alternates agents, calls
                      ai-agent.ts, runs the result through round-logic.ts.

web/app/api/negotiation/run/route.ts   POST endpoint: request in, full
                                        NegotiationResult (or a typed error) out.
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

`onTimeRepaymentRate` is always `null` for now: the current Attestcoin fact
shape (`VerifiedRepayLoanFact` in `lib/attestcoin.ts`) carries no due-date,
so on-time-ness genuinely isn't derivable from it yet. `null` is left as-is
rather than inventing a formula.

### How Phase 2 evidence reaches the negotiation

`POST /api/negotiation/run` accepts `financialEvidence` in one of three
shapes — critically, a client can only ever supply **transaction hashes to
verify**, never a "verified" result directly:

```ts
{ mode: "none" }
{ mode: "unverified", claimedSummary?: string }
{ mode: "verify", transactionHashes: string[] }   // server independently
                                                    // re-runs Phase 2's
                                                    // runAttestcoinVerification
                                                    // for each hash
```

The route calls `runAttestcoinVerification` (Phase 2, unmodified) for every
hash, then `buildVerifiedFinancialProfile` on the real results. A blocked or
failed verification simply yields no evidence for that hash — it never
falls back to trusting the claim.

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

- `web/tests/negotiation.unit.test.ts` — 31 deterministic tests, no network,
  no LLM: constraint validation, invalid lender/borrower offers, APR limits,
  collateral requirements, negotiation termination (forced opening round,
  ACCEPT adopts the counterpart's exact terms, REJECT, max-rounds-reached),
  agreement generation, and absence/presence of verified evidence (including
  that a blocked Phase 2 verification never counts as evidence, and that
  `"not-available"` and `"unverified"` price identically).
  `npx tsx --test tests/negotiation.unit.test.ts`
- `web/tests/e2e-negotiation.mjs` — spawns the real dev server, hits the
  real API route and UI. Asserts the AI-unavailable path is reported
  honestly (real error, no fabricated rounds/terms) and, on an environment
  with a real key, that a successful run is internally consistent (reaches
  a valid terminal status, stays within the round limit).
  `node tests/e2e-negotiation.mjs`

## What remains for Phase 3B / Phase 4

- **Phase 3B** (not started): richer borrower/lender configuration (multiple
  simultaneous lenders, negotiation strategies beyond single-shot per-round
  proposals, real due-date tracking so `onTimeRepaymentRate` becomes
  computable), streaming the negotiation to the UI as it happens rather than
  one batched response, persisting negotiation history.
- **Phase 4** (explicitly not started per instructions): the actual
  `LoanAgreement.sol` contract on CC3 Testnet. The UI's "Execute on
  Creditcoin" button is present but disabled, labeled "not yet executable
  (Phase 4)" — it does not call any contract.

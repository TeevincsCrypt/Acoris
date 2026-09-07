# Acoris — web

Next.js application shell for Acoris, an AI-powered DeFi negotiation protocol
on Creditcoin CC3 Testnet.

## Status

- **Phase 1**: application shell + CC3 Testnet wallet/network integration.
  See `../docs/ACORIS_TECHNICAL_FOUNDATION_REPORT.md` for the verified
  network, SDK, and precompile facts this build follows.
- **Phase 2**: Attestcoin (`@gluwa/usc-sdk@0.18.0`) verification pipeline —
  `lib/attestcoin.ts`, `/api/attestcoin/*`, `/attestcoin` page. See
  `../docs/ACORIS_ATTESTCOIN_VERIFICATION.md` for the exact live flow and
  this environment's network limitations.
- **Phase 3A**: AI credit negotiation engine — `lib/negotiation/*`,
  `/api/negotiation/run`, `/negotiation` page. A structured state machine
  (Borrower AI / Lender AI via `@anthropic-ai/sdk`, `claude-opus-5`) with
  every financial constraint enforced by deterministic code, not the LLM.
  See `../docs/ACORIS_NEGOTIATION_ENGINE.md`.

## Develop

```bash
npm install
npm run dev
```

Open http://localhost:3000. Connect an EIP-1193 wallet (e.g. MetaMask); the
app will detect whether it's on Creditcoin CC3 Testnet (chain id `102031`)
and offer to switch/add the network if not. Balance and block number shown
after connecting are read live from your wallet's own RPC connection — no
chain state is simulated in the app itself.

To run the negotiation engine (`/negotiation`), set `ANTHROPIC_API_KEY` in
the server environment (e.g. `web/.env.local`, which is gitignored). Without
it, the API returns a clear `503 {code: "ai-unavailable"}` rather than a
fabricated result.

## Test

```bash
npm run lint
npx tsc --noEmit
npm run build
node tests/e2e-wallet-shell.mjs                # Phase 1: mock-wallet Playwright smoke test
npx tsx --test tests/attestcoin.unit.test.ts   # Phase 2: deterministic decode/logic tests
node tests/e2e-attestcoin.mjs                  # Phase 2: real pipeline through the real app
npx tsx --test tests/negotiation.unit.test.ts  # Phase 3A: deterministic constraint/engine tests
node tests/e2e-negotiation.mjs                 # Phase 3A: real pipeline through the real app
```

`e2e-wallet-shell.mjs` spawns its own `next dev` and exercises the wallet
connect / wrong-network / switch-network (direct + `wallet_addEthereumChain`
fallback) / disconnect flows against an injected mock wallet, so it can run
without a browser extension. It verifies our own app logic reacts correctly
to standard EIP-1193/EIP-3085/EIP-3326 responses — it does not simulate or
assert anything about real Creditcoin chain state.

`attestcoin.unit.test.ts` tests only pure, non-network logic (chain-key
resolution, byte decoding) against real captured on-chain values — see the
file header for where those values come from.

`e2e-attestcoin.mjs` spawns its own `next dev` and drives the real
`/api/attestcoin/*` routes and `/attestcoin` page — no mocking. In an
environment without access to `*.creditcoin.network` it asserts the failure
is reported honestly (real stage + error, no fabricated ✓ or fact); with
real network access it asserts the full pipeline reaches a genuine verified
result.

`negotiation.unit.test.ts` tests only pure, non-network, non-LLM logic:
constraint derivation/validation/clamping, negotiation termination, and
agreement generation — see `../docs/ACORIS_NEGOTIATION_ENGINE.md` for why
this logic lives in a separate `round-logic.ts` module.

`e2e-negotiation.mjs` spawns its own `next dev` and drives the real
`/api/negotiation/run` route and `/negotiation` page — no mocked model
responses. Without `ANTHROPIC_API_KEY` configured it asserts the failure is
reported honestly (a real error, no fabricated rounds or terms); with a key
configured it asserts a completed negotiation is internally consistent.

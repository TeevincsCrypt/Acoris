# Acoris

**Credit that proves itself.** An AI-negotiated DeFi lending protocol on Creditcoin CC3 Testnet, where loan terms are priced only on financial history that's been cryptographically verified — never invented, never assumed.

Built for BUIDL CTC Fall 2026.

- **Live app:** deployed on Vercel from this repo's `main` branch
- **Contract:** `AcorisLoanRegistry` at [`0x8cB3dDFF9e432D23e622Ff118A3fDDA192993Fb4`](https://creditcoin-testnet.blockscout.com/address/0x8cB3dDFF9e432D23e622Ff118A3fDDA192993Fb4) on Creditcoin CC3 Testnet (chain id `102031`)
- **Status:** the full propose → fund → repay lifecycle has been run live, on-chain, with real transactions — see [`docs/ACORIS_LOAN_CONTRACT.md`](docs/ACORIS_LOAN_CONTRACT.md#the-full-lifecycle-confirmed-live)
- **Project deck:** [`docs/Acoris-Project-Deck.pdf`](docs/Acoris-Project-Deck.pdf)
- **Whitepaper (PDF URL):** [hosted viewer](https://claude.ai/code/artifact/e77d49bc-0133-405b-be67-3d569f3812f9) · [raw PDF](https://raw.githubusercontent.com/TeevincsCrypt/Acoris/main/docs/Acoris-Whitepaper.pdf) · [in-repo copy](docs/Acoris-Whitepaper.pdf) — full technical writeup: every feature, the evidence model, the negotiation engine, the contract, and a glossary of every term used

## What this actually is

Every other line in this README describes something real and checkable, not a pitch. Nowhere in the product is a credit score invented, a transaction faked, or an AI response staged — every number shown is either read live from a chain or produced by a real cryptographic verification. Where that isn't yet possible (e.g. this sandbox has no network access to `*.creditcoin.network`), the docs say so explicitly rather than working around it.

The core idea: a borrower proves a real repayment — cross-chain via Attestcoin (Creditcoin's USC verification SDK; see [`docs/ACORIS_ATTESTCOIN_VERIFICATION.md`](docs/ACORIS_ATTESTCOIN_VERIFICATION.md)) or natively on Creditcoin — and that becomes verified evidence a Lender AI is allowed to price favorably. An unverified claim is priced exactly like no claim at all, by construction, not just by prompt. A Borrower AI and Lender AI negotiate structured terms; deterministic code (not the model) enforces every hard limit. Once terms are accepted, the agreement settles as a real transaction on `AcorisLoanRegistry`, which escrows collateral, forwards principal on funding, and handles repayment, default, and cancellation.

## Features

| Route | What it does |
|---|---|
| `/credit-profile` | Bring real evidence — a Sepolia repayment proven via Attestcoin, or native CC3 loan history — and see exactly what a lender would see. |
| `/marketplace` | Three lender personas (Conservative / Balanced / Aggressive), each a real independent AI call, price the same request; the best affordable offer is picked by a plain, explainable rule — never an invented judgment score. |
| `/negotiation` | The Borrower AI / Lender AI negotiation itself. The AI proposes; deterministic constraints clamp every number before it becomes an official round. |
| `/underwriting` | The same deterministic pricing formula that governs real negotiations, narrated in plain language. Runs no AI call at all — works even without an API key configured. |
| `/improve` | "How can I get better terms?" — every projected number comes from feeding a concrete hypothetical through the real pricing function, never a promised future rate. |
| `/agreement` | Where a lender actually finds and funds a proposed deal — paste a link or a loanHash, connect the matching wallet, act on what's on-chain. |
| `/dashboard` | A wallet's real on-chain history: stats, an active-loan progress bar, an activity feed — and a live count of loans awaiting your review as a lender, the closest thing this product has to a notification (no backend, no email — it's a poll against `AgreementProposed`). |
| `/attestcoin` | The standalone cross-chain verification flow: a real Sepolia transaction, attested and proven on CC3 via the BlockProver precompile. |
| `/acoris-ai` | A read-only chat assistant. It explains the protocol, and — with a wallet connected — answers "my loans" questions from a real `lookup_wallet_activity` tool call against `AcorisLoanRegistry`, never a guess. It never negotiates or writes on-chain state; that's `/negotiation` and `/marketplace`. |

## Repository layout

```
web/         Next.js 16 app — negotiation engine, verification, on-chain execution, UI
contracts/   AcorisLoanRegistry.sol — Hardhat 3 + ethers v6, real-EVM Mocha tests
docs/        Deep-dive docs for each subsystem (see below) — written as engineering
             records, not marketing: what was verified live, what wasn't, and why
```

## Documentation

Each doc records what was actually verified against a live source, what's unverified and flagged as such, and this sandbox's own network limitations — not written after the fact, but alongside the code.

- [`docs/ACORIS_TECHNICAL_FOUNDATION_REPORT.md`](docs/ACORIS_TECHNICAL_FOUNDATION_REPORT.md) — the network/SDK facts the whole project is built on, sourced from primary references before any app code was written.
- [`docs/ACORIS_ATTESTCOIN_VERIFICATION.md`](docs/ACORIS_ATTESTCOIN_VERIFICATION.md) — the cross-chain verification pipeline: how a Sepolia transaction becomes a structured, trustworthy fact.
- [`docs/ACORIS_NEGOTIATION_ENGINE.md`](docs/ACORIS_NEGOTIATION_ENGINE.md) — the negotiation state machine, why the AI never enforces its own limits, and how a verified financial profile is derived.
- [`docs/ACORIS_LOAN_CONTRACT.md`](docs/ACORIS_LOAN_CONTRACT.md) — the contract's full lifecycle, the real deployment (including three real bugs it surfaced and how each was root-caused), and the live confirmation of a full propose → fund → repay cycle.

## Running it locally

### Web app

```bash
cd web
npm install
npm run dev   # http://localhost:3000
```

Environment variables (`web/.env.local`), all optional — each missing one degrades honestly (a real error state, never a fake success):

| Variable | Needed for |
|---|---|
| `ANTHROPIC_API_KEY` | The Borrower AI / Lender AI negotiation calls (`/negotiation`, `/marketplace`). Without it, those routes report `ai-unavailable` rather than fabricating a response. `/underwriting` and `/improve` need no key at all — they run no AI call. |
| `NEXT_PUBLIC_LOAN_REGISTRY_ADDRESS` | Reading/writing `AcorisLoanRegistry` (`/agreement`, `/dashboard`, on-chain execution). Without it, those features are genuinely disabled, not just visually. |
| `LOAN_REGISTRY_DEPLOY_BLOCK` | Required alongside the address above — on-chain history reads start from this block rather than genesis, which is what avoids the RPC timeout a from-genesis scan produced during real testing (see the loan contract doc). |

### Contracts

```bash
cd contracts
npm install
npx hardhat compile
npx hardhat test              # 20 real-EVM tests, Hardhat's local network — nothing mocked
```

Deploying to CC3 Testnet needs a funded deployer key — see [`contracts/README.md`](contracts/README.md).

## Testing

```bash
# Unit tests (pure logic — negotiation math, pricing, on-chain event reconstruction, etc.)
cd web && npx tsx --test tests/*.unit.test.ts        # 141 tests

# End-to-end (spawns the real dev server, drives a real browser)
node tests/e2e-wallet-shell.mjs
node tests/e2e-attestcoin.mjs
node tests/e2e-negotiation.mjs

# Contract tests (real EVM execution)
cd ../contracts && npx hardhat test                   # 20 tests
```

## What's honestly still open

- The two-different-wallets variant of the full lifecycle (propose → fund → repay run by two separate people, not one wallet playing both roles) hasn't been exercised live yet, nor has the post-due `markDefaulted` path.
- A real repayment on `AcorisLoanRegistry` is provable through the Attestcoin pipeline in principle (the event shape mirrors it deliberately), but verifying a CC3-native event as the *source* chain — rather than Sepolia — hasn't been built or tested.
- This sandbox has no network access to `*.creditcoin.network` or `*.blockscout.com`, so several things (RPC calls, the explorer link) are verified by structure and by the project's own live testing history rather than by this environment reaching them directly. Each doc says exactly where that applies.

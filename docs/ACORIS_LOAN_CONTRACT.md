# Acoris Loan Contract — Phase 4

`AcorisLoanRegistry.sol` executes loan agreements reached by Phase 3A's AI
negotiation engine on Creditcoin CC3 Testnet. This document covers the
contract, how it was actually tested (real EVM execution, not mocked), why
it could not be deployed from this sandbox, and how the web app wires up to
it.

## The contract

`contracts/contracts/AcorisLoanRegistry.sol` — single registry contract
(deploy once, use for every deal), principal and collateral in native CTC
(no ERC-20 approval flow needed — the simplest correct design for the CC3
Testnet gas token; see "Known simplifications" below).

Lifecycle per agreement, keyed by a `bytes32 loanHash`:

```
proposeAgreement(loanHash, lender, principal, aprBps, durationSeconds) [borrower, payable = collateral]
  -> Proposed
       |
       +-- cancelProposal(loanHash) [borrower]              -> Cancelled (collateral refunded)
       |
       +-- fundAgreement(loanHash) [lender, payable = principal]   -> Funded (principal forwarded to borrower)
                |
                +-- repay(loanHash) [borrower, payable = repaymentAmount(loanHash)]  -> Repaid
                |     (lender receives principal + interest; borrower's collateral returned)
                |
                +-- markDefaulted(loanHash) [lender, only after durationSeconds elapsed] -> Defaulted
                      (lender seizes collateral)
```

Interest is simple (non-compounding): `principal * aprBps * durationSeconds / (365 days * 10000)`.

**`FundLoan`/`RepayLoan` deliberately mirror the exact event shape**
(`bytes32 loanHash, address lender, address borrower, uint256 amount`, all
non-indexed) that Phase 2's Attestcoin pipeline
(`web/lib/attestcoin.ts`, `LOAN_PAYMENT_ABI`) already knows how to verify. A
real repayment on this contract is provable with the exact same
`QueryBuilder` query already built — closing the loop between "verified
financial history" (Phase 2/3A's credit signal) and "loan execution"
(Phase 4): a borrower's *next* loan negotiation can cite a real repayment
on *this* contract as verified evidence.

### Known simplifications (explicit, not hidden)

- Native CTC only, not ERC-20 — keeps the demo self-contained.
- Simple, non-compounding interest for the full agreed duration — no partial
  repayment or early-repayment discount.
- One lender per agreement, matched by address at proposal time — no lender
  marketplace/matching.
- No integration with the BlockProver precompile *inside* this contract
  (the foundation report floated requiring an on-chain `verifyAndEmit` call
  as a precondition). Attestcoin verification happens off-chain, before
  negotiation (Phase 2/3A) — the loan contract trusts the already-negotiated
  terms, not a fresh on-chain proof. A stronger design could require proof
  verification at `proposeAgreement` time; left for a future phase.

## How this was actually tested

**Genuine EVM execution, not mocked.** `contracts/test/AcorisLoanRegistry.ts`
runs 20 tests against Hardhat's local network (`network.create()`, real
solc-compiled bytecode, real balance transfers, real event emission, real
`require`/custom-error reverts, real block-timestamp manipulation via
`networkHelpers.time.increase`):

```
$ cd contracts && npx hardhat test
  AcorisLoanRegistry
    proposeAgreement (5 tests) · fundAgreement (4) · repay (5)
    cancelProposal (3) · markDefaulted (3)
  20 passing (546ms)
```

Coverage: collateral escrow and balance accounting, principal forwarding,
exact-value enforcement (`IncorrectValue` on any mismatch), access control
(`NotBorrower`/`NotLender` on every state-changing call), double-fund /
double-repay / cancel-after-funded rejection, correct simple-interest math,
default only after the agreed duration elapses, and the real emitted event
args on every state transition.

## Compiling without network access to binaries.soliditylang.org

Hardhat's default solc downloader needs `binaries.soliditylang.org`, which
this sandbox's egress policy denies (`403 host_not_allowed` — confirmed via
`npx hardhat compile`, same failure mode as Phase 2's blocked RPC hosts).
`registry.npmjs.org` **is** reachable, and the official `solc` npm package
ships the identical compiler as a WASM/JS build
(`node_modules/solc/soljson.js`). Hardhat 3 supports pointing a compiler
profile's `path` at a local solc binary/WASM file directly (confirmed by
reading `node_modules/hardhat/dist/src/internal/builtin-plugins/solidity/build-system/compiler/index.js`'s
`getCompilerFromPath`, not assumed) — `hardhat.config.ts` does exactly that.
The result is a real compile with the genuine, unmodified upstream compiler
(solc 0.8.34), just fetched through an allowed channel.

## Deployment — blocked in this sandbox, by design left for a real environment

```
$ npx hardhat ignition deploy ignition/modules/AcorisLoanRegistry.ts --network cc3Testnet
Error HHE7: Configuration Variable "CC3_DEPLOYER_PRIVATE_KEY" not found.
```

This sandbox has no funded CC3 Testnet account and no private key configured
— the same honest-failure pattern as Phase 2 (no network access) and Phase
3A (no `ANTHROPIC_API_KEY`). Setting a throwaway, unfunded key to confirm the
*second* blocker independently:

```
UnknownError: Failed to make POST request to https://rpc.cc3-testnet.creditcoin.network
  [cause]: RequestAbortedError: Proxy response (403) !== 200 when HTTP Tunneling
```

Same egress denial as every other `*.creditcoin.network` host in this
project. **The Ignition module itself is proven correct** — deployed
successfully against Hardhat's local network:

```
$ npx hardhat ignition deploy ignition/modules/AcorisLoanRegistry.ts --network hardhatMainnet
[ AcorisLoanRegistryModule ] successfully deployed 🚀
```

### To actually deploy to CC3 Testnet

1. Fund an account with tCTC (Discord `#token-faucet`, per the foundation report).
2. Set the deployer key — either `npx hardhat keystore set CC3_DEPLOYER_PRIVATE_KEY` (encrypted local storage, recommended) or export `CC3_DEPLOYER_PRIVATE_KEY` as a plain env var (both are read by `configVariable`, confirmed against `node_modules/hardhat/dist/src/internal/core/configuration-variables.js` — env vars take precedence over any keystore).
3. `cd contracts && npx hardhat ignition deploy ignition/modules/AcorisLoanRegistry.ts --network cc3Testnet`
4. Set `NEXT_PUBLIC_LOAN_REGISTRY_ADDRESS` in the web app's environment (e.g. Vercel project settings) to the deployed address.
5. Note the block number the deployment transaction landed in (visible on Blockscout, or in Ignition's own output/journal) and set `LOAN_REGISTRY_DEPLOY_BLOCK` to it — required for the `"onchain"` financial-evidence mode; see "A real deployment, and a real bug it surfaced" below for why.

### Update: deployed for real, outside this sandbox

Since this was written, someone with a funded account and normal network
access (i.e. not this sandbox) ran the steps above for real and deployed
`AcorisLoanRegistry` to CC3 Testnet. Everything below this point that says
"could not be tested here" refers specifically to what this sandbox's own
egress restrictions prevented — it does not mean the feature is unproven;
see the next section for what that live deployment immediately caught.

#### A real deployment, and a real bug it surfaced

The very first live use of the `"onchain"` financial-evidence mode (reading
a borrower's AcorisLoanRegistry history — see
`docs/ACORIS_NEGOTIATION_ENGINE.md`) failed with a real RPC error:

```
could not coalesce error (error={ "code": -32603, "message": "query timeout
of 10 seconds exceeded" }, payload={ ..., "method": "eth_getLogs",
"params": [{ "fromBlock": "0x0", "toBlock": "latest", ... }] })
```

`fetchOnChainLoanHistory` (`lib/negotiation/onchain-history.ts`) was
scanning every event type from block `0` to `latest` — correct in principle
(the contract can't have emitted anything before it existed), but CC3
Testnet's own RPC node times out a genesis-to-latest `eth_getLogs` scan
long before it finishes, on a chain that's been running a while. Fixed two
ways:

- **Chunking**: `queryFilterChunked` (backed by the pure, unit-tested
  `computeBlockChunks`) splits any `[fromBlock, toBlock]` range into
  bounded windows (5000 blocks each) queried sequentially, so no single
  `eth_getLogs` call can time out regardless of how wide the range is.
- **A required starting block**: `LOAN_REGISTRY_DEPLOY_BLOCK` (server env
  var, parsed by the pure `parseDeployBlock`) must be set to the registry's
  actual deployment block. Without it, `"onchain"` mode fails honestly with
  a specific error explaining why, rather than silently defaulting to `0`
  and turning one slow query into hundreds of chunked ones. This mirrors
  every other "genuinely disabled until configured" gate in this project.

#### A second deployment attempt, and what it actually was

The address first reported as "the deployed contract" turned out, on
inspection, to be the deployer's own wallet address, not a contract —
`ignition/deployments/` was empty locally, meaning Ignition had never
actually run to completion. Once actually deployed for real (`AcorisLoanRegistry`
at `0x8cB3dDFF9e432D23e622Ff118A3fDDA192993Fb4`), `NEXT_PUBLIC_LOAN_REGISTRY_ADDRESS`
was corrected to point at it.

#### A third real bug: `eth_estimateGas` silently losing the collateral value

The first live "Propose Agreement On-Chain" attempt against the real
contract failed with `missing revert data (action="estimateGas", ...)`,
even with a genuinely correct, nonzero collateral amount shown in the UI.
This was root-caused, not guessed at: simulating the exact RPC call
sequence `proposeAgreementOnChain` makes through a fake EIP-1193 wallet +
`BrowserProvider` (mirroring `wallet-context.tsx`'s real flow) showed the
`eth_estimateGas` request our code sends does carry the correct nonzero
`value` every time; separately, calling the contract locally with the same
decoded calldata succeeded with a real value and reverted with the exact
custom error (`ZeroAmount`) that matches the "missing revert data" symptom
when value is 0. So both the app and the contract were provably correct —
the failure was specific to how the wallet/RPC combination handles that
one pre-flight `eth_estimateGas` simulation call.

Fixed by passing an explicit `gasLimit` (generous fixed values informed by
real measured gas usage — `proposeAgreement` measured at 139,527 gas
locally) to every write call in `lib/loan-contract/index.ts`. This makes
ethers skip `eth_estimateGas` entirely and go straight to
`eth_sendTransaction`, which was confirmed to carry the value correctly —
the wallet still simulates the transaction itself before showing a
confirmation, so nothing about safety is bypassed, just the one RPC
round-trip that was failing.

#### The full lifecycle, confirmed live

With both fixes in place, a complete real cycle was run end-to-end against
the deployed contract (borrower and lender using the same test wallet, for
simplicity): a live AI negotiation reached `ACCEPTED`, "Propose Agreement
On-Chain" succeeded with a real transaction hash and escrowed collateral,
"Fund Agreement" succeeded and moved status to `FUNDED` (with the UI's
live `repaymentAmount` reading — `1.013150684931506849 tCTC` owed on a 1
tCTC principal at 8% APR over 60 days — matching the contract's own simple-interest
formula exactly), and "Repay" succeeded, returning the collateral to the
borrower and moving status to `REPAID`. Every write path in the contract's
lifecycle except `markDefaulted` (which requires deliberately letting a
loan go unpaid past its due date) has now been exercised for real, not
just in the 20 local Hardhat tests.

## Web app wiring

`web/lib/loan-contract/index.ts` — client-side (runs in the browser, using
the connected wallet's own signer from `lib/wallet-context.tsx`; no server
involvement, no secrets, borrower and lender each sign their own
transactions). The ABI (`AcorisLoanRegistry.abi.json`) is copied verbatim
from the real compiled artifact
(`contracts/artifacts/contracts/AcorisLoanRegistry.sol/AcorisLoanRegistry.json`)
— not hand-written, so it can't drift from the actual contract.

`components/negotiation/ExecuteOnCreditcoin.tsx` replaces Phase 3A's
permanently-disabled placeholder button with one that's **genuinely** wired:
if `NEXT_PUBLIC_LOAN_REGISTRY_ADDRESS` is unset (true in this sandbox), it
still renders disabled with an honest reason; once a real address is
configured, it calls `proposeAgreementOnChain` for real, from the connected
wallet, and reports the real transaction hash or the real error — never a
fabricated success.

### Full lifecycle UI (post-Phase-4 follow-up)

Proposing was only the first step of the contract's state machine — funding,
repayment, default, and cancellation exist on-chain (see the lifecycle
diagram above) but had no UI until this pass. `lib/loan-contract/index.ts`
gained the remaining write calls (`fundAgreementOnChain`,
`cancelProposalOnChain`, `markDefaultedOnChain`) and a read helper
(`getRepaymentAmountOnChain`, wrapping the contract's own
`repaymentAmount(loanHash)` so the UI never recomputes interest itself).
`fundAgreementOnChain` takes the **on-chain** `principal` (wei, read back via
`getAgreement`) rather than re-deriving it from the negotiation's abstract
deal units — once a proposal exists, the contract's own recorded value is
the source of truth, and `fundAgreement` reverts on any mismatch anyway.

`components/negotiation/LoanLifecycle.tsx` is the new component that drives
all of this: given a `loanHash`, it reads `getAgreement` directly from CC3
(polling every 20s while the agreement is in a non-terminal state, so a
counterparty's action taken in a different browser shows up here too),
determines whether the connected wallet is the borrower, the lender, or
neither, and renders exactly the actions that wallet can actually take next:

- **Proposed**, connected as borrower → Cancel Proposal
- **Proposed**, connected as lender → Fund Agreement
- **Funded**, connected as borrower → Repay (showing the live
  `repaymentAmount` owed)
- **Funded**, connected as lender, past the due date
  (`fundedAt + durationSeconds`) → Mark Defaulted (claim collateral)
- **Repaid** / **Defaulted** / **Cancelled** → terminal state, no actions

Every action is a real transaction against the deployed contract (no
simulated status transitions) followed by a real re-read of `getAgreement`
— never an optimistic local status flip. `ExecuteOnCreditcoin` hands off to
`LoanLifecycle` once a proposal exists, whether that's because this session
just proposed one or because an on-chain check on mount found the
loanHash already proposed (e.g. the page was reloaded).

**Negotiation amounts have no on-chain denomination of their own** (Phase
3A's `LoanRequest.amount`/`collateralValue` are abstract deal units, e.g.
`10000`). Executing an agreement maps them 1:1 onto native CTC via
`parseEther` — a documented simplification for this MVP, not a hidden one
(see `dealUnitsToWei` in `lib/loan-contract/index.ts`).

**The lender's on-chain address isn't tracked by the negotiation engine**
(Phase 3A negotiates abstract terms, not wallet-bound parties) — the UI asks
for it at execution time, when the deal is actually being put on-chain.

### What could not be tested here

Both `ExecuteOnCreditcoin` and `LoanLifecycle` only render their interactive
UI once a negotiation reaches `finalTerms.status === "accepted"` (for
`ExecuteOnCreditcoin`) or once an on-chain agreement actually exists (for
`LoanLifecycle`) — the former requires a successful Phase 3A AI call
(unavailable in this sandbox, see `docs/ACORIS_NEGOTIATION_ENGINE.md`), and
the latter requires a deployed registry (unavailable here too). So neither
component's browser rendering, nor the real fund/repay/cancel/markDefaulted
transactions, could be exercised end-to-end in this sandbox. What *is*
verified here:

- Pure helpers (`computeLoanHash`, `aprToBps`, `dealUnitsToWei`) and every
  write/read function's not-deployed-rejects-honestly behavior
  (`getLoanRegistryContract`, `fundAgreementOnChain`, `cancelProposalOnChain`,
  `repayOnChain`, `markDefaultedOnChain`, `getRepaymentAmountOnChain`) — 11
  tests in `web/tests/loan-contract.unit.test.ts`.
- The contract itself: 20 real-EVM Hardhat tests covering every transition
  in the lifecycle diagram above, including `markDefaulted`'s
  duration-elapsed gate and `repay`'s exact-value enforcement.

## What still requires manual verification

Status against the real deployment (`0x8cB3dDFF9e432D23e622Ff118A3fDDA192993Fb4`
at the time of writing — confirm the current address in the deployment's own
Vercel env vars, since a redeploy could point elsewhere):

1. ~~Deploy for real and confirm the address resolves on CC3 Testnet.~~ **Done.**
2. ~~Reach a real accepted negotiation with a real `ANTHROPIC_API_KEY`.~~ **Done.**
3. ~~Click through `ExecuteOnCreditcoin`'s "Propose Agreement On-Chain" for real and confirm it returns a genuine transaction hash.~~ **Done** — see "A third real bug" above for the `gasLimit` fix this took.
4. ~~Run the rest of the cycle — fund, then repay — using the `LoanLifecycle` UI end-to-end, and confirm balances and displayed status move as the tests predict.~~ **Done** — full propose → fund → repay cycle confirmed live; see "The full lifecycle, confirmed live" above. Still open: the *two-different-wallets* variant (this run used one wallet as both borrower and lender) and the post-due `markDefaulted` path (requires deliberately letting a loan go unpaid).
5. Confirm the "already proposed on mount" path in `ExecuteOnCreditcoin` (reloading the page after a proposal was made) correctly hands off to `LoanLifecycle` instead of re-showing the propose form.
6. Verify a real repayment on the deployed contract is actually provable through the Phase 2 Attestcoin pipeline against CC3 Testnet as the *target* chain query — the current Phase 2 pipeline verifies Sepolia-sourced transactions; verifying a same-chain (CC3-native) event needs `resolveSepoliaChainKey`'s equivalent for CC3-as-source, which is out of scope here and would need its own check against `getSupportedChains()`.

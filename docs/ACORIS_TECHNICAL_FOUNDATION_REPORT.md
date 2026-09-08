# Acoris Technical Foundation Report

**Purpose:** verify the current (Sept 2026) Creditcoin CC3 Testnet / Attestcoin (USC) architecture before writing any application code, per the BUIDL CTC Fall 2026 requirements. Every fact below was pulled from primary sources on 2026-09-07: the published npm package contents (`@gluwa/usc-sdk@0.18.0`, `@gluwa/creditcoin-public-prover@3.59.0-testnet`), their Solidity/TypeScript source, and Creditcoin's own docs/socials via web search (`docs.creditcoin.org` itself is unreachable from this sandbox — flagged where relevant). No API surface below is assumed from training data; anything not directly confirmed is marked **unverified**.

---

## 1. Network: Creditcoin CC3 Testnet

| Field | Value |
|---|---|
| EVM Chain ID | **102031** |
| HTTPS RPC | `https://rpc.cc3-testnet.creditcoin.network` |
| WSS RPC | `wss://rpc.cc3-testnet.creditcoin.network` |
| Gas token | `tCTC` (testnet CTC) |
| Substrate explorer | `https://creditcoin3-testnet.subscan.io` |

The RPC URL above is confirmed independently three ways: Creditcoin's public docs/socials, ChainList, and — most reliably — it's the literal value hardcoded in `@gluwa/usc-sdk`'s own test `globalSetup.ts` and README examples. Treat it as canonical.

**Note on explorers (resolved 2026-09-08):** a second Blockscout instance, `explorer.usc-testnet.creditcoin.network`, also surfaced in search results at the time of this report, labeled "Creditcoin3 USC Testnet." That instance has since been decommissioned — attempting to open a transaction on it in the shipped product returned nothing. The current Blockscout instance for CC3 Testnet is `https://creditcoin-testnet.blockscout.com`; `web/lib/creditcoin.ts`'s `CC3_TESTNET_EXPLORER` points at it.

## 2. Attestcoin / USC SDK — current package

| Package | Latest version | Published | Repo |
|---|---|---|---|
| `@gluwa/usc-sdk` | **0.18.0** | 2026-06-22 | `github.com/gluwa/cc-next-query-builder` |

Dependencies (from `package.json`): `ethers@^6.15.0`, `axios@^1.13.2`, `dotenv@^17.2.3`, `exponential-backoff@^3.1.3`.

```
npm install @gluwa/usc-sdk ethers
```

**Important finding:** there are two distinct proof/verification patterns published under the Creditcoin/Gluwa org, and they are *not* interchangeable:

1. **Current, actively-developed pattern** (last publish June 2026) — synchronous, precompile-based verification via `@gluwa/usc-sdk`. This is what's documented and exercised by the SDK's own examples/tests. **Use this.**
2. **Older pattern** (`@gluwa/creditcoin-public-prover`, Solidity-only package, latest testnet tag `3.59.0-testnet` published Sept 2025, latest devnet tag `3.65.0-devnet` published Oct 2025 — no publish in ~11 months) — an async escrow/query-submission contract (`CreditcoinPublicProver.sol`) that calls a *different* precompile at `0x...0Be9` via `submitQuery()` / `submitQueryProof()`. This maps to what Creditcoin's docs path calls "USC v1." It still exists on-chain but shows no recent development activity — treat as legacy, don't build on it.

## 3. BlockProver / ChainInfo precompiles (the current pattern)

Addresses below are read directly from `@gluwa/usc-sdk@0.18.0` source (`src/block-prover/index.ts`, `src/chain-info/index.ts`), not from docs:

| Precompile | Address |
|---|---|
| **ChainInfo** | `0x0000000000000000000000000000000000000fd3` |
| **BlockProver** | `0x0000000000000000000000000000000000000FD2` |

**BlockProver interface** (function selectors as used by the SDK, confirmed against `block_prover.json` ABI):

```solidity
function calculateTxIndex((bytes32,(bytes32,bool)[]) merkleProof) external view returns (uint256);

function verify(
    uint64 chainKey,
    uint64 height,
    bytes calldata encodedTx,
    (bytes32,(bytes32,bool)[]) calldata merkleProof,
    (bytes32,bytes32[]) calldata continuityProof
) external view returns (bool);

function verifyAndEmit(
    uint64 chainKey,
    uint64 height,
    bytes calldata encodedTx,
    (bytes32,(bytes32,bool)[]) calldata merkleProof,
    (bytes32,bytes32[]) calldata continuityProof
) external returns (bool); // emits TransactionVerified(uint64,uint64,uint64); reverts on failure

// batch variants: verify(...) / verifyAndEmit(...) taking arrays of heights/txs/merkleProofs + one shared continuityProof
```

`verify`/`verifyAndEmit` are overloaded by full signature (SDK dispatches via the exact selector string, e.g. `verify(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))`), so a Solidity caller needs an interface matching these tuple shapes exactly.

**No official Solidity package publishes this new interface yet** — `@gluwa/creditcoin-public-prover`'s `sol/Prover.sol` / `sol/Types.sol` only cover the legacy `0x...0Be9` query-prover pattern. To call BlockProver directly from a Creditcoin contract, Acoris will need a small hand-written interface (trivial — signatures above are fully known) rather than importing one from npm.

**ChainInfo interface** (used via `PrecompileChainInfoProvider`): `get_supported_chains()`, `get_chain_by_key(chainKey)`, `get_attestation_genesis_height(chainKey)`, `get_latest_attestation_height_and_hash(chainKey)`, `get_attestation_bounds(chainKey, height)`, `get_attestation_height_for_digest(chainKey, digest)`, `get_checkpoint_for_height(chainKey, height)`.

## 4. Proof Builder / query-builder flow

Confirmed hosted proving service: `https://prover.cc3-testnet.creditcoin.network/`, exposing:
- `GET /api/v1/proof-by-tx/{chainKey}/{txHash}`
- `POST /api/v1/proof-batch-by-tx/{chainKey}`
- `GET /api/v1/attested-height/{chainKey}`

End-to-end flow (verbatim from the SDK's own `examples/end-to-end.ts`):

```ts
import { chainInfo, blockProver, proofProvider, utils } from '@gluwa/usc-sdk';
import { JsonRpcProvider } from 'ethers';

const creditcoinProvider = new JsonRpcProvider(creditcoinRpcUrl); // rpc.cc3-testnet.creditcoin.network
const chainInfoProvider = new chainInfo.PrecompileChainInfoProvider(creditcoinProvider);
const prover = new blockProver.PrecompileBlockProver(creditcoinProvider);

// 1. Wait for the source-chain block containing the tx to be attested on Creditcoin
await chainInfoProvider.waitUntilHeightAttested(chainKey, txHeight);

// 2. Fetch a precomputed Merkle + continuity proof from the hosted Proof Builder
const apiProvider = new proofProvider.service.ProofBuilder(chainKey, apiServerUrl); // prover.cc3-testnet.creditcoin.network
const proofResult = await apiProvider.getProof(txHash);

// 3. Verify on-chain via the BlockProver precompile (view call, or verifyAndEmitSingle to persist a receipt)
const ok = await prover.verifySingle(
  proofResult.data.chainKey,
  proofResult.data.headerNumber,
  proofResult.data.txBytes,
  proofResult.data.merkleProof,
  proofResult.data.continuityProof,
);
```

Underlying mechanics: attestors periodically checkpoint/attest source-chain block headers onto CC3; a Merkle proof shows the transaction is included in its block, a continuity proof chains that block back to an already-attested/checkpointed height. Verification (`verify`/`verifyAndEmit`) executes natively in a single Creditcoin block (~15s once attested), and batch verification supports multiple transactions sharing one continuity proof. Separately, `QueryBuilder` (`@gluwa/usc-sdk`'s `query-builder/abi`) lets you declare *which* fields of a transaction/event to extract (status, from/to, event args, function args) so a verified proof can be reduced to just the values your contract logic needs.

## 5. Supported source chains / chain keys

**Do not hardcode chain keys.** They are a Creditcoin-side mapping, queried live from the ChainInfo precompile:

```ts
const chainInfoProvider = new chainInfo.PrecompileChainInfoProvider(provider);
const supportedChains = await chainInfoProvider.getSupportedChains();
// => [{ chainKey, chainId, chainName, chainEncoding }, ...]
```

Confirmed live source-chain support includes **Ethereum Sepolia** (CC3 Testnet's flagship USC demo is explicitly "read + verify data from Ethereum Sepolia"); Ethereum mainnet and BSC testnet also appear in adjacent Gluwa materials but weren't independently confirmed against the live CC3 Testnet precompile in this session. Resolve the chain key for Sepolia at runtime by filtering `getSupportedChains()` for `chainId === 11155111`, not by assuming a fixed integer — reported "chain key" values for Sepolia differ across different Gluwa network deployments (devnet/testnet/testnet2) in search results, confirming they aren't stable across environments.

Creditcoin also hosts its own Sepolia RPC proxy, used directly in the SDK's own tests: `https://sepolia-proxy-rpc.creditcoin.network` — useful as Acoris's source-chain RPC for the hackathon (no separate Infura/Alchemy key needed).

## 6. Example transaction (verified, not invented)

From the SDK's own smoke-test fixtures (`tests/smoke/query.builder.test.ts`), against `https://sepolia-proxy-rpc.creditcoin.network`:
- Tx hash `0xc990ce703dd3ca83429c302118f197651678de359c271f205b9083d4aa333aae` — an ERC-20 burn transaction, used to demonstrate `QueryBuilder` extracting `RxStatus`, `TxFrom`, `TxTo`, a `Transfer` event's `from`/`to`/`value`, and the `burn(value)` function argument, all from one proof. This is a real pattern Acoris can reuse: prove a borrower's on-chain financial activity (e.g. a repayment or balance-moving tx on Sepolia) and extract just the fields the Lender AI needs.

No Acoris-specific contracts exist on CC3 Testnet yet — nothing has been deployed by this project.

## 7. Faucet / testnet access

- **Official:** Creditcoin Discord → `#token-faucet` channel bot; submit a Substrate address, bot replies "CTC faucet submitted" then "CTC Faucet successful."
- **Third-party (unverified reliability):** `thirdweb.com/creditcoin-testnet` lists a "Get 0.01 tCTC" faucet button. Prefer Discord.
- Separately, the borrower/source-chain leg needs Sepolia ETH from any standard Sepolia faucet (not Creditcoin-specific).

## 8. Minimum viable architecture for Acoris

```
Borrower ── desired terms ──► Borrower AI (off-chain agent)
                                     │  proposal/counter-proposal loop
                                     ▼
                              Lender AI (off-chain agent)
                                     │
                                     │  needs: verified borrower financial activity
                                     ▼
                     @gluwa/usc-sdk against CC3 Testnet (chainId 102031)
              waitUntilHeightAttested → ProofBuilder.getProof → BlockProver.verify(AndEmit)
                     (source chain: Sepolia, via sepolia-proxy-rpc.creditcoin.network)
                                     │
                                     ▼
                    Lender AI factors verified result into credit decision
                                     │
                        both agents converge on terms
                                     ▼
              Acoris LoanAgreement.sol deployed on CC3 Testnet
         (funds/executes the loan; optionally requires an on-chain
          verifyAndEmit call against the BlockProver precompile as a
          precondition, so the contract itself — not just the off-chain
          agents — trusts the cross-chain proof)
```

Components to build:
1. **Borrower AI** — off-chain service that turns a desired loan into acceptable terms/bounds.
2. **Lender AI** — off-chain service that evaluates the borrower, requests USC verification of relevant Sepolia activity via `@gluwa/usc-sdk`, and negotiates.
3. **Verification adapter** — a thin TS module wrapping `PrecompileChainInfoProvider` + `ProofBuilder` + `PrecompileBlockProver` against `rpc.cc3-testnet.creditcoin.network` / `prover.cc3-testnet.creditcoin.network`.
4. **LoanAgreement.sol** — Acoris-authored Solidity contract on CC3 Testnet (chain id 102031) that executes the agreed terms; optionally calls the BlockProver precompile (`0x...0FD2`) directly via a hand-written interface for on-chain trust.
5. **Wallets** — any EVM wallet pointed at chain id 102031, funded with tCTC via Discord faucet; a Sepolia-funded key for the borrower-activity leg.

---

### Open items flagged as unverified (do not assume before building on them)
- ~~Whether `explorer.usc-testnet.creditcoin.network` is the same deployment as `rpc.cc3-testnet.creditcoin.network` or a separate USC-only testnet.~~ Resolved: that instance is decommissioned; CC3 Testnet's current explorer is `https://creditcoin-testnet.blockscout.com` (see the explorers note above).
- The exact live `chainKey` integer for Sepolia on the current CC3 Testnet deployment — must be read via `getSupportedChains()` at build time, not assumed.
- Full list of all currently-supported source chains beyond Sepolia — only queryable live, not documented as a stable static list.

Stopping here per instructions — awaiting implementation direction.

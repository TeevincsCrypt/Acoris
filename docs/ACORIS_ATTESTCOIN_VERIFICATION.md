# Acoris Attestcoin Verification — Phase 2

How Acoris verifies a real Sepolia transaction on Creditcoin CC3 Testnet, and
exactly what is/isn't working in this sandbox right now.

## What this proves

One concrete, structured fact of the shape the report's proof-of-concept
asked for:

> wallet `X` performed transaction `Y` on Sepolia at block `Z`

Specifically, for the demo transaction: wallet `0x2FabAFfC7F6426C1beEdec22cc150A7dBE6667fb`
repaid a loan (`RepayLoan` event, loan contract `0x39DE412201f2446b3606C93dFB799EdE6a721b13`)
and moved ERC-20 tokens (`Transfer` event, token contract
`0x296077f69435a073f7A6E0CBAEf8C1877633832E`) in Sepolia transaction
[`0x202b9b1d689578cf7dd7b279b3c9cb02f47cef7b44b6fa1650ab67977f86cb11`](https://sepolia.etherscan.io/tx/0x202b9b1d689578cf7dd7b279b3c9cb02f47cef7b44b6fa1650ab67977f86cb11),
verified through Creditcoin's BlockProver precompile rather than trusted from
a plain RPC read.

**This transaction was not created by Acoris.** It's a real, already-confirmed
Sepolia transaction read directly out of `@gluwa/usc-sdk`'s own shipped test
fixture (`node_modules/@gluwa/usc-sdk/tests/smoke/query.builder.test.ts`,
"Build query from transactions with multiple events"), which independently
asserts the exact decoded field values Acoris's pipeline also decodes. It's
used here because it's a genuine, verifiable, on-chain loan-repayment event —
directly analogous to what Acoris's Lender AI will eventually need to check
about a real borrower — and because this sandbox cannot itself submit a new
Sepolia transaction (no funded key, no network access; see below). The
pipeline accepts any Sepolia tx hash, not just this one.

## The exact live flow

Implemented in `web/lib/attestcoin.ts`, using `@gluwa/usc-sdk@0.18.0` — the
current, actively-maintained synchronous precompile pattern documented in
`docs/ACORIS_TECHNICAL_FOUNDATION_REPORT.md`. **Not** `@gluwa/creditcoin-public-prover`
or the legacy escrow/query precompile (`0x...0Be9`).

```
1. resolveSepoliaChainKey()
   chainInfo.PrecompileChainInfoProvider(cc3Provider).getSupportedChains()
   → filter live results for chainId === 11155111
   → chainKey is NEVER hardcoded

2. fetch the source transaction + receipt from Sepolia
   encoding.getTransactionWithRaw(sepoliaProvider, txHash)
   sepoliaProvider.getTransactionReceipt(txHash)

3. checkAttestation()
   chainInfo.PrecompileChainInfoProvider(cc3Provider)
     .getContinuityBounds(chainKey, receipt.blockNumber)
   → .isAttested tells us whether CC3 has attested this height yet

4. fetchProof()
   proofProvider.service.ProofBuilder(chainKey, proofBuilderUrl).getProof(txHash)
   → Merkle proof + continuity proof + the exact tx bytes that were proven

5. verifyProofOnChain()
   blockProver.PrecompileBlockProver(cc3Provider)
     .verifySingle(chainKey, headerNumber, txBytes, merkleProof, continuityProof)
   → a view call against the BlockProver precompile (0x...0FD2) on CC3 Testnet

6. extractRepayLoanFact()
   queryBuilder.QueryBuilder.createFromTransaction(tx, receipt)
     .addStaticField(RxStatus/TxFrom/TxTo)
     .eventBuilder('RepayLoan', ..., b => b.addAddress().addSignature()
         .addArgument('loanHash').addArgument('lender')
         .addArgument('borrower').addArgument('amount'))
     .eventBuilder('Transfer', ..., b => b.addAddress().addSignature()
         .addArgument('from').addArgument('to').addArgument('value'))
     .build()
   → 14 {offset,size} field descriptors, decoded directly out of
     proof.txBytes (the bytes BlockProver actually verified, not a
     separately-fetched copy) using ethers' public `dataSlice`
```

Networks/services involved:

| Purpose | URL |
|---|---|
| CC3 Testnet RPC (ChainInfo + BlockProver precompiles) | `https://rpc.cc3-testnet.creditcoin.network` |
| Sepolia RPC | `https://sepolia-proxy-rpc.creditcoin.network` (Creditcoin-hosted, no API key) |
| CC3 Proof Builder | `https://prover.cc3-testnet.creditcoin.network` |

## A public-API gap worth knowing about

`@gluwa/usc-sdk`'s own tests read decoded field bytes with an internal
`ForkedReader` class (`src/query-builder/common/ForkedReader.ts`) — but that
class is **not** re-exported through the package's public `dist/index.js`.
As an external consumer we only get `QueryBuilder.build()`'s `{offset, size}`
list, not a way to read them. `lib/attestcoin.ts` reimplements the (trivial)
read step with ethers' public `dataSlice` instead of reaching into the SDK's
internal source path. Confirmed correct against real captured on-chain bytes
in `web/tests/attestcoin.unit.test.ts`.

## Network limitation in this sandbox (disclosed, not worked around)

Every host above is blocked by this project's sandbox egress policy. Running
the pipeline here returns the real error directly from the egress gateway:

```
Error calling contract method: Error: server response 403 Forbidden
(... info={ "requestUrl": "https://rpc.cc3-testnet.creditcoin.network",
"responseBody": "Host not in allowlist: rpc.cc3-testnet.creditcoin.network.
Add this host to your network egress settings to allow access.", ... })
```

This is a real response captured from a live run of `POST /api/attestcoin/verify`
against this project's own dev server — not fabricated, not a mock. It
proves the integration code is wired correctly all the way to the network
boundary (provider construction, contract call encoding, error propagation)
and stops exactly there, honestly reported as `stage: "resolving-source-chain"`,
`ok: false`, `networkBlocked: true`. **Nothing downstream of that boundary
(attestation status, proof contents, verification result, decoded fact) is
simulated or guessed** — if network access isn't there, those fields are
simply absent from the result, never filled with a plausible-looking fake.

When this code runs somewhere with real internet access (a developer's own
machine, or a deployed server), the exact same code path reaches the real
services and returns genuine attestation/proof/verification data.

## Running it yourself (with real network access)

```bash
cd web
npm install
npm run dev
# in another terminal:
curl -X POST http://localhost:3000/api/attestcoin/verify \
  -H "Content-Type: application/json" -d '{}'
# or open http://localhost:3000/attestcoin and click Verify
```

A successful run returns:

```json
{
  "stage": "complete",
  "ok": true,
  "networkBlocked": false,
  "transactionHash": "0x202b9b1d689578cf7dd7b279b3c9cb02f47cef7b44b6fa1650ab67977f86cb11",
  "sourceChain": { "chainKey": <live>, "chainId": 11155111, "chainName": "sepolia" },
  "sourceBlockHeight": <live>,
  "attested": true,
  "proofVerified": true,
  "proof": { "headerNumber": <live>, "txIndex": <live>, "cached": <live>, "generatedAt": "<live>" },
  "fact": {
    "kind": "sepolia-loan-repayment",
    "transactionStatus": "success",
    "transactionFrom": "0x2FabAFfC7F6426C1beEdec22cc150A7dBE6667fb",
    "transactionTo": "0x39DE412201f2446b3606C93dFB799EdE6a721b13",
    "loanEvent": { "contract": "0x39DE...", "loanHash": "0xaf84...", "lender": "<live>", "borrower": "<live>", "amountWei": "<live>" },
    "transferEvent": { "contract": "0x2960...", "from": "0x2Fab...", "to": "<live>", "valueWei": "<live>" }
  }
}
```

`<live>` values are the ones this sandbox could not fetch — the `sourceChain.chainKey`
in particular is only known once the live `getSupportedChains()` call succeeds,
by design (never hardcoded).

## What still requires manual verification

Someone with real internet access to `*.creditcoin.network` needs to:

1. Run the flow above and confirm it reaches `stage: "complete"`.
2. Confirm `attested: true` for this specific historical Sepolia block —
   it's possible (though unlikely, given the tx is used as Gluwa's own
   fixture) that its height predates CC3's attestation genesis for Sepolia,
   in which case `checkAttestation` will correctly report `attested: false`
   rather than erroring.
3. Cross-check the decoded `fact` values against Sepolia Etherscan for the
   same transaction.
4. ~~Confirm whether `explorer.usc-testnet.creditcoin.network` shows the same
   CC3 chain state as `rpc.cc3-testnet.creditcoin.network`.~~ Resolved: that
   instance has been decommissioned. CC3 Testnet's current Blockscout
   instance is `https://creditcoin-testnet.blockscout.com` — `CC3_TESTNET_EXPLORER`
   in `web/lib/creditcoin.ts` now points at it.

## Tests

- `web/tests/attestcoin.unit.test.ts` — deterministic, no network: chain-key
  resolution logic, and byte-decoding (`fieldToAddress`/`fieldToUint`/
  `extractRepayLoanFact`) validated against real on-chain word values copied
  from the SDK's own test assertions. `npx tsx --test tests/attestcoin.unit.test.ts`
- `web/tests/e2e-attestcoin.mjs` — spawns the real dev server, hits the real
  API routes and UI, and asserts the pipeline is *honest*: no fake ✓, no
  fabricated fact, a real stage + error when it can't reach the network.
  `node tests/e2e-attestcoin.mjs`

# Acoris — web

Next.js application shell for Acoris, an AI-powered DeFi negotiation protocol
on Creditcoin CC3 Testnet.

## Phase 1 status

Application shell + CC3 Testnet wallet/network integration. See
`../docs/ACORIS_TECHNICAL_FOUNDATION_REPORT.md` for the verified network,
SDK, and precompile facts this build follows.

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

## Test

```bash
npm run lint
npx tsc --noEmit
npm run build
node tests/e2e-wallet-shell.mjs   # Playwright smoke test w/ a mock EIP-1193 provider
```

The e2e script spawns its own `next dev` on port 3100 and exercises the
wallet connect / wrong-network / switch-network (direct + `wallet_addEthereumChain`
fallback) / disconnect flows against an injected mock wallet, so it can run
without a browser extension. It verifies our own app logic reacts correctly
to standard EIP-1193/EIP-3085/EIP-3326 responses — it does not simulate or
assert anything about real Creditcoin chain state.

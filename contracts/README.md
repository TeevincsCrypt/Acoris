# Acoris — contracts

`AcorisLoanRegistry.sol`: the Phase 4 contract that executes loan
agreements reached by Acoris's Phase 3A AI negotiation engine, on
Creditcoin CC3 Testnet. Hardhat 3 + ethers v6 + Mocha.

See `../docs/ACORIS_LOAN_CONTRACT.md` for the contract's full lifecycle,
why compilation uses a local `solc` (npm) instead of Hardhat's default
downloader, and this environment's deployment limitations (no funded key,
no network access to `*.creditcoin.network`).

## Compile

```bash
npm install
npx hardhat compile
```

## Test (real EVM execution against Hardhat's local network — not mocked)

```bash
npx hardhat test
```

## Deploy

```bash
# Local (always works, no credentials needed):
npx hardhat ignition deploy ignition/modules/AcorisLoanRegistry.ts --network hardhatMainnet

# CC3 Testnet (needs a funded deployer key):
npx hardhat keystore set CC3_DEPLOYER_PRIVATE_KEY   # or export it as an env var
npx hardhat ignition deploy ignition/modules/AcorisLoanRegistry.ts --network cc3Testnet
```

Then set `NEXT_PUBLIC_LOAN_REGISTRY_ADDRESS` in `../web/.env.local` to the
deployed address so `web/lib/loan-contract` picks it up.

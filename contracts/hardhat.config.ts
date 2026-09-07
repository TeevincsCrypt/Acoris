import { fileURLToPath } from "node:url";

import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

// Hardhat's default compiler download (binaries.soliditylang.org) is not
// reachable from this project's sandbox (egress policy: "host_not_allowed").
// The `solc` npm package (registry.npmjs.org, which *is* reachable) ships
// the same official solc compiler as a WASM/JS build — pointing `path` at
// its soljson.js bypasses the downloader entirely and compiles with the
// real, unmodified upstream compiler. See ../docs/ACORIS_LOAN_CONTRACT.md.
const localSolcPath = fileURLToPath(
  new URL("./node_modules/solc/soljson.js", import.meta.url),
);

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.34",
        path: localSolcPath,
        settings: {
          // solc 0.8.34 defaults to the newest hardfork (Osaka). CC3 Testnet's
          // exact EVM compatibility isn't confirmed (this sandbox can't reach
          // its RPC to check) — targeting Shanghai is a conservative,
          // widely-supported choice. Verify against a real deployment and
          // adjust if CC3 rejects any opcode.
          evmVersion: "shanghai",
        },
      },
      production: {
        version: "0.8.34",
        path: localSolcPath,
        settings: {
          evmVersion: "shanghai",
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    // Creditcoin CC3 Testnet — see ../docs/ACORIS_TECHNICAL_FOUNDATION_REPORT.md.
    // Deployment requires a funded account; see ../docs/ACORIS_LOAN_CONTRACT.md.
    cc3Testnet: {
      type: "http",
      chainType: "l1",
      url: configVariable("CC3_TESTNET_RPC_URL", {
        default: "https://rpc.cc3-testnet.creditcoin.network",
      }),
      accounts: [configVariable("CC3_DEPLOYER_PRIVATE_KEY")],
      chainId: 102031,
    },
  },
});

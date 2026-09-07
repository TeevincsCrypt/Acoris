/**
 * Creditcoin CC3 Testnet network configuration.
 *
 * Values verified against docs/ACORIS_TECHNICAL_FOUNDATION_REPORT.md — sourced
 * directly from @gluwa/usc-sdk's own test setup and README, not assumed.
 */

export const CC3_TESTNET_CHAIN_ID = 102031;

/** EIP-3085 `wallet_addEthereumChain` expects the chain id as a 0x-prefixed hex string. */
export const CC3_TESTNET_CHAIN_ID_HEX = `0x${CC3_TESTNET_CHAIN_ID.toString(16)}`;

export const CC3_TESTNET_RPC_HTTP = "https://rpc.cc3-testnet.creditcoin.network";
export const CC3_TESTNET_RPC_WSS = "wss://rpc.cc3-testnet.creditcoin.network";

/**
 * Blockscout instance advertised for the USC testnet deployment. The
 * foundation report flags this as unverified against the exact RPC above,
 * so it's included only as a best-effort explorer link, never relied on
 * for chain data.
 */
export const CC3_TESTNET_EXPLORER = "https://explorer.usc-testnet.creditcoin.network";

export const CC3_TESTNET_NATIVE_CURRENCY = {
  name: "Creditcoin Testnet",
  symbol: "tCTC",
  decimals: 18,
} as const;

/** Parameters for EIP-3085 `wallet_addEthereumChain`. */
export const CC3_TESTNET_ADD_CHAIN_PARAMS = {
  chainId: CC3_TESTNET_CHAIN_ID_HEX,
  chainName: "Creditcoin CC3 Testnet",
  nativeCurrency: CC3_TESTNET_NATIVE_CURRENCY,
  rpcUrls: [CC3_TESTNET_RPC_HTTP],
  blockExplorerUrls: [CC3_TESTNET_EXPLORER],
} as const;

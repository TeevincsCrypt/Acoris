/**
 * Acoris Attestcoin (USC) verification pipeline.
 *
 * Wraps @gluwa/usc-sdk@0.18.0 — the current, actively-maintained synchronous
 * precompile-based verification pattern documented in
 * docs/ACORIS_TECHNICAL_FOUNDATION_REPORT.md. Deliberately does NOT use
 * @gluwa/creditcoin-public-prover or any escrow/query-submission precompile
 * (0x...0Be9) — that's the legacy "USC v1" pattern the report flags as
 * unmaintained.
 *
 * Every SDK symbol used here (chainInfo.PrecompileChainInfoProvider,
 * blockProver.PrecompileBlockProver, proofProvider.service.ProofBuilder,
 * queryBuilder.QueryBuilder, encoding.getTransactionWithRaw) was read
 * directly out of node_modules/@gluwa/usc-sdk/src before this file was
 * written — see the Phase 2 section of docs/ACORIS_TECHNICAL_FOUNDATION_REPORT.md
 * for the exact source paths. Notably, `ForkedReader` (used internally by
 * the SDK's own tests to read decoded field bytes) is NOT part of the
 * package's public dist/ exports, so byte extraction below is done with
 * ethers' public `dataSlice` instead of importing an SDK-internal path.
 *
 * Pipeline stages (per the report's proof flow):
 *   1. list supported source chains live from the ChainInfo precompile,
 *      resolve Sepolia's chainKey dynamically (never hardcoded)
 *   2. fetch the source transaction + receipt from Sepolia
 *   3. check whether the source block height is attested on CC3
 *      (ChainInfoProvider.getContinuityBounds)
 *   4. fetch a Merkle + continuity proof from the hosted CC3 Proof Builder
 *   5. verify the proof on-chain via the BlockProver precompile
 *   6. use QueryBuilder to extract just the fields Acoris cares about from
 *      the *verified* transaction bytes, producing a structured fact
 *
 * This module makes genuine network calls and never fabricates a result.
 * Any failure at a network-bound stage is surfaced as `ok: false` with the
 * stage and underlying error message; `networkBlocked` is set when the
 * failure looks like a connectivity/policy denial rather than an
 * application-level error (see isLikelyNetworkBlocked below).
 */

import {
  JsonRpcProvider,
  dataSlice,
  getAddress,
  toBigInt,
  type TransactionReceipt,
} from "ethers";
import { chainInfo, blockProver, proofProvider, queryBuilder, encoding } from "@gluwa/usc-sdk";

import { CC3_TESTNET_RPC_HTTP } from "./creditcoin";

// ---------------------------------------------------------------------------
// Network configuration
// ---------------------------------------------------------------------------

/** Ethereum Sepolia's real chain id (source-of-truth, not a Creditcoin chainKey). */
export const SEPOLIA_CHAIN_ID = 11155111;

/**
 * Creditcoin-hosted Sepolia RPC proxy, used directly by @gluwa/usc-sdk's own
 * test suite (tests/smoke/query.builder.test.ts) — no separate Infura/Alchemy
 * key needed. Documented in the foundation report §5.
 */
export const SEPOLIA_RPC_URL = "https://sepolia-proxy-rpc.creditcoin.network";

/** Hosted CC3 Proof Builder service (foundation report §4). */
export const CC3_PROOF_BUILDER_URL = "https://prover.cc3-testnet.creditcoin.network";

/**
 * A real, already-confirmed Sepolia transaction that repaid a loan
 * (RepayLoan event) and moved ERC-20 tokens (Transfer event) — exactly the
 * shape of "useful verifiable fact" Acoris needs for a lending decision.
 *
 * This hash and the two contract addresses below are NOT invented — they
 * are read verbatim from @gluwa/usc-sdk's own shipped test fixture
 * (node_modules/@gluwa/usc-sdk/tests/smoke/query.builder.test.ts, the
 * "Build query from transactions with multiple events" test), which
 * asserts the exact decoded field values already. That test is independent
 * confirmation, from the SDK vendor itself, that this tx and query shape
 * decode correctly on Sepolia.
 */
export const EXAMPLE_SEPOLIA_TX_HASH = "0x202b9b1d689578cf7dd7b279b3c9cb02f47cef7b44b6fa1650ab67977f86cb11";

const LOAN_PAYMENT_CONTRACT = getAddress("0x39DE412201f2446b3606C93dFB799EdE6a721b13");
const ERC20_TOKEN_CONTRACT = getAddress("0x296077f69435a073f7A6E0CBAEf8C1877633832E");

/** Verbatim from @gluwa/usc-sdk's tests/common/const.ts (RepayLoan is a real, deployed demo loan contract's ABI). */
const LOAN_PAYMENT_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "bytes32", name: "loanHash", type: "bytes32" },
      { indexed: false, internalType: "address", name: "lender", type: "address" },
      { indexed: false, internalType: "address", name: "borrower", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "RepayLoan",
    type: "event",
  },
];

/** Standard ERC-20 Transfer event — the token contract involved in the repayment. */
const ERC20_TRANSFER_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "from", type: "address" },
      { indexed: true, internalType: "address", name: "to", type: "address" },
      { indexed: false, internalType: "uint256", name: "value", type: "uint256" },
    ],
    name: "Transfer",
    type: "event",
  },
];

async function abiProviderFor(contractAddress: string): Promise<string> {
  const addr = getAddress(contractAddress);
  if (addr === LOAN_PAYMENT_CONTRACT) return JSON.stringify(LOAN_PAYMENT_ABI);
  if (addr === ERC20_TOKEN_CONTRACT) return JSON.stringify(ERC20_TRANSFER_ABI);
  throw new Error(`attestcoin: no known ABI for contract ${addr}`);
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export function getCreditcoinProvider(rpcUrl: string = CC3_TESTNET_RPC_HTTP): JsonRpcProvider {
  return new JsonRpcProvider(rpcUrl);
}

export function getSepoliaProvider(rpcUrl: string = SEPOLIA_RPC_URL): JsonRpcProvider {
  return new JsonRpcProvider(rpcUrl);
}

// ---------------------------------------------------------------------------
// 1. Supported source chains (dynamic — never hardcoded)
// ---------------------------------------------------------------------------

export interface SourceChain {
  chainKey: number;
  chainId: number;
  chainName: string;
}

/** Queries the ChainInfo precompile live. Never assume a fixed chainKey. */
export async function listSupportedSourceChains(creditcoinProvider: JsonRpcProvider): Promise<SourceChain[]> {
  const chainInfoProvider = new chainInfo.PrecompileChainInfoProvider(creditcoinProvider);
  const chains = await chainInfoProvider.getSupportedChains();
  return chains.map((c) => ({ chainKey: c.chainKey, chainId: c.chainId, chainName: c.chainName }));
}

export class SepoliaNotSupportedError extends Error {
  public readonly chains: SourceChain[];

  constructor(chains: SourceChain[]) {
    super(
      `Sepolia (chainId ${SEPOLIA_CHAIN_ID}) was not found among the CC3 Testnet ChainInfo precompile's supported chains: ${JSON.stringify(chains)}`,
    );
    this.name = "SepoliaNotSupportedError";
    this.chains = chains;
  }
}

/** Resolves Sepolia's chainKey from a live-queried chain list. Throws if unsupported right now. */
export function resolveSepoliaChainKey(chains: SourceChain[]): number {
  const match = chains.find((c) => c.chainId === SEPOLIA_CHAIN_ID);
  if (!match) throw new SepoliaNotSupportedError(chains);
  return match.chainKey;
}

// ---------------------------------------------------------------------------
// 2. Attestation status
// ---------------------------------------------------------------------------

export interface AttestationStatus {
  attested: boolean;
  parentHeight: number;
  parentIsAttestation: boolean;
  childHeight: number;
  childIsAttestation: boolean;
}

/**
 * Uses ChainInfoProvider.getContinuityBounds to determine whether a specific
 * source-chain height is attested on CC3 right now. Deliberately a single
 * bounded check (not the SDK's long-polling waitUntilHeightAttested) so it's
 * safe to call from a request/response API route; callers that want to poll
 * until attested should loop this on their own schedule.
 */
export async function checkAttestation(
  creditcoinProvider: JsonRpcProvider,
  chainKey: number,
  height: number,
): Promise<AttestationStatus> {
  const chainInfoProvider = new chainInfo.PrecompileChainInfoProvider(creditcoinProvider);
  const bounds = await chainInfoProvider.getContinuityBounds(chainKey, height);
  return {
    attested: bounds.isAttested,
    parentHeight: bounds.parentHeight,
    parentIsAttestation: bounds.parentIsAttestation,
    childHeight: bounds.childHeight,
    childIsAttestation: bounds.childIsAttestation,
  };
}

// ---------------------------------------------------------------------------
// 3. Proof Builder
// ---------------------------------------------------------------------------

export async function fetchProof(
  chainKey: number,
  txHash: string,
  proofBuilderUrl: string = CC3_PROOF_BUILDER_URL,
): Promise<proofProvider.ContinuityResponse> {
  const builder = new proofProvider.service.ProofBuilder(chainKey, proofBuilderUrl);
  const result = await builder.getProof(txHash);
  if (!result.success || !result.data) {
    throw new Error(result.error ?? "CC3 Proof Builder returned no data");
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// 4. BlockProver verification
// ---------------------------------------------------------------------------

export async function verifyProofOnChain(
  creditcoinProvider: JsonRpcProvider,
  proof: proofProvider.ContinuityResponse,
): Promise<boolean> {
  const prover = new blockProver.PrecompileBlockProver(creditcoinProvider);
  return prover.verifySingle(proof.chainKey, proof.headerNumber, proof.txBytes, proof.merkleProof, proof.continuityProof);
}

// ---------------------------------------------------------------------------
// 5. QueryBuilder field plan + extraction from the verified proof bytes
// ---------------------------------------------------------------------------

export type FieldPlanEntry = { offset: number; size: number };

/**
 * Builds the query field plan for a Sepolia RepayLoan+Transfer transaction
 * using @gluwa/usc-sdk's QueryBuilder, mirroring exactly the query shape
 * the SDK's own smoke test builds and asserts against this transaction
 * (see EXAMPLE_SEPOLIA_TX_HASH doc comment above).
 *
 * Field order (fixed by construction order below):
 *   0 RxStatus            5 RepayLoan.loanHash    10 Transfer.signature
 *   1 TxFrom              6 RepayLoan.lender      11 Transfer.from
 *   2 TxTo                7 RepayLoan.borrower     12 Transfer.to
 *   3 RepayLoan.address   8 RepayLoan.amount       13 Transfer.value
 *   4 RepayLoan.signature 9 Transfer.address
 */
export async function buildRepayLoanFieldPlan(
  tx: encoding.TransactionWithRaw,
  receipt: TransactionReceipt,
): Promise<FieldPlanEntry[]> {
  const builder = queryBuilder.QueryBuilder.createFromTransaction(tx, receipt);
  builder.setAbiProvider(abiProviderFor);

  builder
    .addStaticField(queryBuilder.QueryableFields.RxStatus)
    .addStaticField(queryBuilder.QueryableFields.TxFrom)
    .addStaticField(queryBuilder.QueryableFields.TxTo);

  await builder.eventBuilder("RepayLoan", () => true, (b) =>
    b.addAddress().addSignature().addArgument("loanHash").addArgument("lender").addArgument("borrower").addArgument("amount"),
  );

  await builder.eventBuilder("Transfer", () => true, (b) =>
    b.addAddress().addSignature().addArgument("from").addArgument("to").addArgument("value"),
  );

  return builder.build();
}

export interface VerifiedRepayLoanFact {
  kind: "sepolia-loan-repayment";
  transactionStatus: "success" | "failed";
  transactionFrom: string;
  transactionTo: string;
  loanEvent: {
    contract: string;
    loanHash: string;
    lender: string;
    borrower: string;
    amountWei: string;
  };
  transferEvent: {
    contract: string;
    from: string;
    to: string;
    valueWei: string;
  };
}

/** Reads a field's raw bytes straight out of hex data using its byte offset/size. */
function readField(dataHex: string, field: FieldPlanEntry): string {
  return dataSlice(dataHex, field.offset, field.offset + field.size);
}

/** A 32-byte word holding a left-zero-padded address; the address is its last 20 bytes. */
export function fieldToAddress(dataHex: string, field: FieldPlanEntry): string {
  return getAddress(dataSlice(dataHex, field.offset + (field.size - 20), field.offset + field.size));
}

export function fieldToUint(dataHex: string, field: FieldPlanEntry): bigint {
  return toBigInt(readField(dataHex, field));
}

/**
 * Decodes the 14-entry RepayLoan field plan against the *verified* proof
 * transaction bytes (proof.txBytes) — not a separately-fetched copy — so the
 * resulting fact is grounded in what BlockProver actually verified on-chain.
 */
export function extractRepayLoanFact(txBytesHex: string, fields: FieldPlanEntry[]): VerifiedRepayLoanFact {
  if (fields.length !== 14) {
    throw new Error(`attestcoin: expected 14 fields from buildRepayLoanFieldPlan, got ${fields.length}`);
  }
  const [rxStatus, txFrom, txTo, loanAddr, loanSig, loanHash, lender, borrower, amount, transferAddr, transferSig, transferFrom, transferTo, transferValue] =
    fields;
  void loanSig;
  void transferSig;

  return {
    kind: "sepolia-loan-repayment",
    transactionStatus: fieldToUint(txBytesHex, rxStatus) === BigInt(1) ? "success" : "failed",
    transactionFrom: fieldToAddress(txBytesHex, txFrom),
    transactionTo: fieldToAddress(txBytesHex, txTo),
    loanEvent: {
      contract: fieldToAddress(txBytesHex, loanAddr),
      loanHash: readField(txBytesHex, loanHash),
      lender: fieldToAddress(txBytesHex, lender),
      borrower: fieldToAddress(txBytesHex, borrower),
      amountWei: fieldToUint(txBytesHex, amount).toString(),
    },
    transferEvent: {
      contract: fieldToAddress(txBytesHex, transferAddr),
      from: fieldToAddress(txBytesHex, transferFrom),
      to: fieldToAddress(txBytesHex, transferTo),
      valueWei: fieldToUint(txBytesHex, transferValue).toString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export type VerificationStage =
  | "resolving-source-chain"
  | "fetching-source-transaction"
  | "checking-attestation"
  | "fetching-proof"
  | "verifying-proof"
  | "extracting-fact"
  | "complete";

export interface AttestcoinVerificationResult {
  stage: VerificationStage;
  ok: boolean;
  /** Best-effort: true when the failure looks like a connectivity/policy block, not an app error. */
  networkBlocked: boolean;
  error?: string;
  transactionHash: string;
  sourceChain?: SourceChain;
  sourceBlockHeight?: number;
  attested?: boolean;
  proofVerified?: boolean;
  proof?: {
    headerNumber: number;
    txIndex: number;
    cached: boolean;
    generatedAt: string;
  };
  fact?: VerifiedRepayLoanFact;
}

const NETWORK_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
]);

/**
 * Heuristic only: matches common Node/ethers/axios connectivity-failure
 * signatures (confirmed against this project's own sandbox, where every one
 * of these hosts returns "403 policy denial" at the egress proxy — see
 * docs/ACORIS_TECHNICAL_FOUNDATION_REPORT.md Phase 2 network notes). Does
 * not attempt to be a complete classifier of every possible failure mode.
 */
export function isLikelyNetworkBlocked(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown; response?: { status?: unknown }; info?: { error?: { code?: unknown } } };
  if (typeof e.code === "string" && NETWORK_ERROR_CODES.has(e.code)) return true;
  if (typeof e.response?.status === "number" && e.response.status === 403) return true;
  const message = typeof e.message === "string" ? e.message : "";
  return /CONNECT tunnel failed|403|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network.*(error|unreachable)/i.test(message);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface RunAttestcoinVerificationOptions {
  creditcoinRpcUrl?: string;
  sepoliaRpcUrl?: string;
  proofBuilderUrl?: string;
}

/**
 * Runs the full Attestcoin verification pipeline for one Sepolia transaction
 * against CC3 Testnet. Every stage performs a genuine network call — nothing
 * here is simulated. On failure the result stops at the stage that failed
 * and reports the real error, with `networkBlocked` set when the failure
 * looks like connectivity being denied rather than a genuine verification
 * failure (e.g. "not attested yet" is `ok: false, networkBlocked: false`,
 * a real terminal state, not a network problem).
 */
export async function runAttestcoinVerification(
  txHash: string,
  options: RunAttestcoinVerificationOptions = {},
): Promise<AttestcoinVerificationResult> {
  const creditcoinProvider = getCreditcoinProvider(options.creditcoinRpcUrl);
  const sepoliaProvider = getSepoliaProvider(options.sepoliaRpcUrl);

  try {
    return await runAttestcoinVerificationInner(txHash, options, creditcoinProvider, sepoliaProvider);
  } finally {
    // A JsonRpcProvider that fails to detect its network otherwise retries
    // forever in the background (observed directly: it keeps logging
    // "JsonRpcProvider failed to detect network... retry in 1s" long after
    // this function has returned). Always tear both down.
    creditcoinProvider.destroy();
    sepoliaProvider.destroy();
  }
}

async function runAttestcoinVerificationInner(
  txHash: string,
  options: RunAttestcoinVerificationOptions,
  creditcoinProvider: JsonRpcProvider,
  sepoliaProvider: JsonRpcProvider,
): Promise<AttestcoinVerificationResult> {
  const result: AttestcoinVerificationResult = {
    stage: "resolving-source-chain",
    ok: false,
    networkBlocked: false,
    transactionHash: txHash,
  };

  let sourceChain: SourceChain;
  try {
    const chains = await listSupportedSourceChains(creditcoinProvider);
    const chainKey = resolveSepoliaChainKey(chains);
    sourceChain = { chainKey, chainId: SEPOLIA_CHAIN_ID, chainName: "sepolia" };
    result.sourceChain = sourceChain;
  } catch (err) {
    result.error = errorMessage(err);
    result.networkBlocked = isLikelyNetworkBlocked(err);
    return result;
  }

  result.stage = "fetching-source-transaction";
  let tx: encoding.TransactionWithRaw;
  let receipt: TransactionReceipt;
  try {
    const fetchedTx = await encoding.getTransactionWithRaw(sepoliaProvider, txHash);
    if (!fetchedTx) throw new Error(`transaction ${txHash} not found on Sepolia`);
    tx = fetchedTx;

    const fetchedReceipt = await sepoliaProvider.getTransactionReceipt(txHash);
    if (!fetchedReceipt) throw new Error(`receipt for ${txHash} not found on Sepolia`);
    receipt = fetchedReceipt;

    result.sourceBlockHeight = receipt.blockNumber;
  } catch (err) {
    result.error = errorMessage(err);
    result.networkBlocked = isLikelyNetworkBlocked(err);
    return result;
  }

  result.stage = "checking-attestation";
  try {
    const attestation = await checkAttestation(creditcoinProvider, sourceChain.chainKey, receipt.blockNumber);
    result.attested = attestation.attested;
    if (!attestation.attested) {
      // Genuine terminal state, not a network problem: the block simply
      // isn't attested (yet, or outside the attestation window).
      return result;
    }
  } catch (err) {
    result.error = errorMessage(err);
    result.networkBlocked = isLikelyNetworkBlocked(err);
    return result;
  }

  result.stage = "fetching-proof";
  let proof: proofProvider.ContinuityResponse;
  try {
    proof = await fetchProof(sourceChain.chainKey, txHash, options.proofBuilderUrl);
    result.proof = {
      headerNumber: proof.headerNumber,
      txIndex: proof.txIndex,
      cached: proof.cached,
      generatedAt: proof.generatedAt instanceof Date ? proof.generatedAt.toISOString() : String(proof.generatedAt),
    };
  } catch (err) {
    result.error = errorMessage(err);
    result.networkBlocked = isLikelyNetworkBlocked(err);
    return result;
  }

  result.stage = "verifying-proof";
  try {
    result.proofVerified = await verifyProofOnChain(creditcoinProvider, proof);
    if (!result.proofVerified) {
      return result; // proof genuinely did not verify — terminal, not blocked
    }
  } catch (err) {
    result.error = errorMessage(err);
    result.networkBlocked = isLikelyNetworkBlocked(err);
    return result;
  }

  result.stage = "extracting-fact";
  try {
    const fields = await buildRepayLoanFieldPlan(tx, receipt);
    result.fact = extractRepayLoanFact(proof.txBytes, fields);
  } catch (err) {
    result.error = errorMessage(err);
    result.networkBlocked = isLikelyNetworkBlocked(err);
    return result;
  }

  result.stage = "complete";
  result.ok = true;
  return result;
}

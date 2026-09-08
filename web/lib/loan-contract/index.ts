/**
 * Client for AcorisLoanRegistry.sol — the Phase 4 contract that executes
 * loan agreements reached by Acoris's Phase 3A negotiation engine on
 * Creditcoin CC3 Testnet. Runs client-side, using the connected wallet's
 * own signer (see lib/wallet-context.tsx) — no server involvement, no
 * secrets: the borrower and lender sign their own transactions.
 *
 * ABI (AcorisLoanRegistry.abi.json) is copied verbatim from
 * contracts/artifacts/contracts/AcorisLoanRegistry.sol/AcorisLoanRegistry.json
 * after a real `hardhat compile` — not hand-written, so it can't drift from
 * the actual contract. See docs/ACORIS_LOAN_CONTRACT.md.
 *
 * NEXT_PUBLIC_LOAN_REGISTRY_ADDRESS is unset until the contract is actually
 * deployed to CC3 Testnet (blocked in this sandbox — no funded key, no
 * network access; see docs/ACORIS_LOAN_CONTRACT.md). Every function here
 * checks for that explicitly and throws LoanRegistryNotDeployedError rather
 * than silently no-op'ing or pointing at a fabricated address.
 */

import { Contract, keccak256, parseEther, toUtf8Bytes, type BrowserProvider, type Signer } from "ethers";

import loanRegistryAbi from "./AcorisLoanRegistry.abi.json";

export const LOAN_REGISTRY_ADDRESS: string | undefined = process.env.NEXT_PUBLIC_LOAN_REGISTRY_ADDRESS;

export function isLoanRegistryDeployed(): boolean {
  return typeof LOAN_REGISTRY_ADDRESS === "string" && LOAN_REGISTRY_ADDRESS.length > 0;
}

export class LoanRegistryNotDeployedError extends Error {
  constructor() {
    super(
      "AcorisLoanRegistry is not deployed on CC3 Testnet in this environment (NEXT_PUBLIC_LOAN_REGISTRY_ADDRESS is unset). See docs/ACORIS_LOAN_CONTRACT.md.",
    );
    this.name = "LoanRegistryNotDeployedError";
  }
}

export enum AgreementStatus {
  None = 0,
  Proposed = 1,
  Funded = 2,
  Repaid = 3,
  Defaulted = 4,
  Cancelled = 5,
}

export interface OnChainAgreement {
  borrower: string;
  lender: string;
  principal: bigint;
  collateral: bigint;
  aprBps: number;
  durationSeconds: number;
  fundedAt: number;
  status: AgreementStatus;
}

function requireDeployed(): string {
  if (!isLoanRegistryDeployed()) throw new LoanRegistryNotDeployedError();
  return LOAN_REGISTRY_ADDRESS as string;
}

export function getLoanRegistryContract(runner: Signer | BrowserProvider): Contract {
  return new Contract(requireDeployed(), loanRegistryAbi, runner);
}

/** Derives a stable, unique loanHash for a negotiation so it maps 1:1 to an on-chain agreement. */
export function computeLoanHash(negotiationId: string): string {
  return keccak256(toUtf8Bytes(`acoris:negotiation:${negotiationId}`));
}

/** APR percent (e.g. 7.5) -> basis points (750), the unit the contract stores. */
export function aprToBps(aprPercent: number): number {
  return Math.round(aprPercent * 100);
}

/**
 * Negotiation amounts (see lib/negotiation/types.ts) are abstract deal
 * units with no on-chain denomination of their own. For this MVP, executing
 * an agreement maps them 1:1 onto native CTC via parseEther — a documented
 * simplification (see docs/ACORIS_LOAN_CONTRACT.md), not a hidden one.
 */
export function dealUnitsToWei(amount: number): bigint {
  return parseEther(amount.toString());
}

/**
 * Estimated total repayment (principal + interest) in the same deal units
 * the negotiation produced — the exact same simple-interest formula the
 * contract itself uses (`repaymentAmount` in AcorisLoanRegistry.sol:
 * `principal * aprBps * durationSeconds / (365 days * 10000)`), just
 * computed here before any on-chain proposal exists. Once a proposal is
 * actually on-chain, `getRepaymentAmountOnChain` reads the contract's own
 * real value instead — this is only ever shown as an estimate, never
 * presented as a contract-confirmed number.
 */
export function estimateTotalRepayment(principalDealUnits: number, aprPercent: number, durationDays: number): number {
  const interest = principalDealUnits * (aprPercent / 100) * (durationDays / 365);
  return principalDealUnits + interest;
}

export interface ProposeAgreementParams {
  loanHash: string;
  lenderAddress: string;
  principalDealUnits: number;
  collateralDealUnits: number;
  aprPercent: number;
  durationDays: number;
}

/**
 * Fixed gas limits, generous over real measured usage (20 passing Hardhat
 * tests; `proposeAgreement` itself measured at 139,527 gas). Passing these
 * explicitly skips ethers' automatic `eth_estimateGas` pre-flight call —
 * confirmed live against CC3 Testnet that this pre-flight call can silently
 * fail in a way that surfaces as "missing revert data" / a reverted
 * estimate even for a transaction that's actually valid (the exact cause
 * wasn't pinned down further: something in the estimateGas round-trip
 * through this RPC/wallet combination, not the contract call itself, which
 * reproduces successfully with an explicit gas limit both locally and via
 * `populateTransaction`). Skipping the estimate avoids that failure mode
 * entirely — the wallet still does its own simulation before showing the
 * user a confirmation, so nothing here bypasses real validation.
 */
const GAS_LIMITS = {
  proposeAgreement: BigInt(300_000),
  fundAgreement: BigInt(250_000),
  repay: BigInt(250_000),
  cancelProposal: BigInt(200_000),
  markDefaulted: BigInt(200_000),
} as const;

/** Borrower proposes the agreement on-chain and escrows collateral. Requires the borrower's own signer. */
export async function proposeAgreementOnChain(signer: Signer, params: ProposeAgreementParams) {
  const contract = getLoanRegistryContract(signer);
  const principal = dealUnitsToWei(params.principalDealUnits);
  const collateral = dealUnitsToWei(params.collateralDealUnits);
  const aprBps = aprToBps(params.aprPercent);
  const durationSeconds = Math.round(params.durationDays * 24 * 60 * 60);

  return contract.proposeAgreement(params.loanHash, params.lenderAddress, principal, aprBps, durationSeconds, {
    value: collateral,
    gasLimit: GAS_LIMITS.proposeAgreement,
  });
}

/**
 * Named lender funds the proposed agreement. Requires the lender's own
 * signer. Takes the exact wei amount the contract itself recorded as
 * `principal` (read via getAgreement) rather than re-deriving it from the
 * negotiation's abstract deal units — the on-chain value is the source of
 * truth once a proposal exists, and `fundAgreement` reverts on any mismatch
 * anyway (IncorrectValue).
 */
export async function fundAgreementOnChain(signer: Signer, loanHash: string, principalWei: bigint) {
  const contract = getLoanRegistryContract(signer);
  return contract.fundAgreement(loanHash, { value: principalWei, gasLimit: GAS_LIMITS.fundAgreement });
}

/** Borrower withdraws a not-yet-funded proposal, reclaiming their escrowed collateral. Requires the borrower's own signer. */
export async function cancelProposalOnChain(signer: Signer, loanHash: string) {
  const contract = getLoanRegistryContract(signer);
  return contract.cancelProposal(loanHash, { gasLimit: GAS_LIMITS.cancelProposal });
}

/** Borrower repays principal + interest. Requires the borrower's own signer. */
export async function repayOnChain(signer: Signer, loanHash: string) {
  const contract = getLoanRegistryContract(signer);
  const owed: bigint = await contract.repaymentAmount(loanHash);
  return contract.repay(loanHash, { value: owed, gasLimit: GAS_LIMITS.repay });
}

/** Lender seizes collateral once the agreed duration has elapsed without repayment. Requires the lender's own signer. */
export async function markDefaultedOnChain(signer: Signer, loanHash: string) {
  const contract = getLoanRegistryContract(signer);
  return contract.markDefaulted(loanHash, { gasLimit: GAS_LIMITS.markDefaulted });
}

/** Total principal + interest currently owed for this agreement (matches what `repay` requires as msg.value). */
export async function getRepaymentAmountOnChain(runner: Signer | BrowserProvider, loanHash: string): Promise<bigint> {
  const contract = getLoanRegistryContract(runner);
  return contract.repaymentAmount(loanHash);
}

export async function getAgreement(runner: Signer | BrowserProvider, loanHash: string): Promise<OnChainAgreement> {
  const contract = getLoanRegistryContract(runner);
  const a = await contract.agreements(loanHash);
  return {
    borrower: a.borrower,
    lender: a.lender,
    principal: a.principal,
    collateral: a.collateral,
    aprBps: Number(a.aprBps),
    durationSeconds: Number(a.durationSeconds),
    fundedAt: Number(a.fundedAt),
    status: Number(a.status) as AgreementStatus,
  };
}

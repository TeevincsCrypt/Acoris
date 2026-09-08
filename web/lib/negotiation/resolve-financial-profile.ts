/**
 * Shared evidence-resolution logic used by both the negotiation route
 * (app/api/negotiation/run/route.ts) and the standalone credit-profile
 * route (app/api/credit-profile/route.ts) — extracted so a borrower can
 * build/inspect their verified credit profile independently of running a
 * full AI negotiation, without duplicating the real verification logic.
 *
 * Never accepts a client-supplied "verified" result directly — only raw
 * inputs (transaction hashes, a borrower address) that the server
 * independently re-derives evidence from. See financial-profile.ts's own
 * doc comment for the two evidence sources this aggregates.
 */

import { JsonRpcProvider } from "ethers";
import { z } from "zod";

import { runAttestcoinVerification, type AttestcoinVerificationResult } from "@/lib/attestcoin";
import { CC3_TESTNET_RPC_HTTP } from "@/lib/creditcoin";
import { isLoanRegistryDeployed, LOAN_REGISTRY_ADDRESS } from "@/lib/loan-contract";
import {
  buildVerifiedFinancialProfile,
  buildVerifiedFinancialProfileFromAttestcoin,
} from "./financial-profile";
import { evidenceFromOnChainTimelines, fetchOnChainLoanHistory, LOAN_REGISTRY_DEPLOY_BLOCK } from "./onchain-history";
import type { VerifiedFinancialProfile } from "./types";

const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export const FinancialEvidenceSchema = z
  .discriminatedUnion("mode", [
    z.object({ mode: z.literal("none") }),
    z.object({ mode: z.literal("unverified"), claimedSummary: z.string().optional() }),
    z.object({
      mode: z.literal("verify"),
      // Cross-chain repayments (e.g. Sepolia), independently re-verified via
      // the real Phase 2 Attestcoin pipeline — never trusted from the client.
      transactionHashes: z.array(z.string().regex(TX_HASH_PATTERN)).min(1).max(10),
    }),
    z.object({
      mode: z.literal("onchain"),
      // Native CC3 AcorisLoanRegistry history for this borrower, read
      // directly from CC3 Testnet — same-chain, no cross-chain proof needed.
      borrowerAddress: z.string().regex(ADDRESS_PATTERN),
    }),
  ])
  .optional();

export type FinancialEvidence = z.infer<typeof FinancialEvidenceSchema>;

export async function resolveFinancialProfile(evidence: FinancialEvidence): Promise<VerifiedFinancialProfile> {
  if (!evidence || evidence.mode === "none") {
    return { status: "not-available" };
  }
  if (evidence.mode === "unverified") {
    return { status: "unverified", claimedSummary: evidence.claimedSummary };
  }

  if (evidence.mode === "verify") {
    // Independently re-run the real Attestcoin pipeline for every supplied
    // hash. Only genuinely successful verifications become evidence — a
    // failed/blocked verification simply doesn't count, it never falls back
    // to trusting the claim.
    const results: AttestcoinVerificationResult[] = await Promise.all(
      evidence.transactionHashes.map((txHash) => runAttestcoinVerification(txHash)),
    );
    return buildVerifiedFinancialProfileFromAttestcoin(results);
  }

  // mode === "onchain": read AcorisLoanRegistry's own event log for this
  // borrower directly from CC3 Testnet. Genuinely disabled — not just
  // visually — until the registry is actually deployed (mirrors
  // lib/loan-contract's own LoanRegistryNotDeployedError behavior).
  if (!isLoanRegistryDeployed()) {
    throw new Error(
      "AcorisLoanRegistry is not deployed on CC3 Testnet in this environment (NEXT_PUBLIC_LOAN_REGISTRY_ADDRESS is unset). See docs/ACORIS_LOAN_CONTRACT.md.",
    );
  }
  if (LOAN_REGISTRY_DEPLOY_BLOCK === undefined) {
    throw new Error(
      "LOAN_REGISTRY_DEPLOY_BLOCK is not configured — reading on-chain history needs a starting block so it doesn't have to scan the entire chain from genesis (confirmed to time out on CC3 Testnet's own RPC node). Set it to the block number AcorisLoanRegistry was deployed at. See docs/ACORIS_LOAN_CONTRACT.md.",
    );
  }
  const provider = new JsonRpcProvider(CC3_TESTNET_RPC_HTTP);
  try {
    const timelines = await fetchOnChainLoanHistory(
      provider,
      LOAN_REGISTRY_ADDRESS as string,
      evidence.borrowerAddress,
      LOAN_REGISTRY_DEPLOY_BLOCK,
    );
    return buildVerifiedFinancialProfile(evidenceFromOnChainTimelines(timelines));
  } finally {
    provider.destroy();
  }
}

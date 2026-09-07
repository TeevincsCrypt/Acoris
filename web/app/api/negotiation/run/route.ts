import { JsonRpcProvider } from "ethers";
import { z } from "zod";

import { runAttestcoinVerification, type AttestcoinVerificationResult } from "@/lib/attestcoin";
import { CC3_TESTNET_RPC_HTTP } from "@/lib/creditcoin";
import { AI_UNAVAILABLE_MESSAGE, AIUnavailableError, isAIConfigured } from "@/lib/negotiation/ai-agent";
import {
  buildVerifiedFinancialProfile,
  buildVerifiedFinancialProfileFromAttestcoin,
} from "@/lib/negotiation/financial-profile";
import { runNegotiation } from "@/lib/negotiation/engine";
import { evidenceFromOnChainTimelines, fetchOnChainLoanHistory, LOAN_REGISTRY_DEPLOY_BLOCK } from "@/lib/negotiation/onchain-history";
import type { LoanRequest, NegotiationRound, VerifiedFinancialProfile } from "@/lib/negotiation/types";
import { isLoanRegistryDeployed, LOAN_REGISTRY_ADDRESS } from "@/lib/loan-contract";

const LoanRequestSchema = z.object({
  amount: z.number().positive(),
  collateralValue: z.number().positive(),
  durationDays: z.number().positive(),
  maxApr: z.number().positive(),
  preferredRepaymentConditions: z.string().optional(),
});

const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const RequestSchema = z.object({
  loanRequest: LoanRequestSchema,
  // Never accept a client-supplied "verified" profile directly — only
  // transaction hashes / a borrower address, which the server independently
  // re-derives evidence for. "unverified" carries a self-reported claim that
  // is explicitly never treated as verified evidence.
  financialEvidence: z
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
    .optional(),
});

type StreamMessage =
  | { type: "round"; round: NegotiationRound }
  | { type: "complete"; result: Awaited<ReturnType<typeof runNegotiation>> }
  | { type: "error"; error: string; code?: string };

/**
 * Runs one full Acoris negotiation: derives the borrower's verified
 * financial profile (independently re-deriving evidence from any supplied
 * transaction hashes or on-chain history — never trusting a client-supplied
 * verification result), then runs the Borrower AI / Lender AI negotiation
 * state machine, streaming each round to the client as it's decided
 * (newline-delimited JSON) instead of waiting for the whole negotiation to
 * finish.
 *
 * Validation errors, evidence-resolution failures, and "AI not configured"
 * are all fast-fail plain JSON responses returned before the stream opens —
 * a client can tell them apart from a streaming response by status code /
 * content-type without needing to parse partial NDJSON.
 */
export async function POST(request: Request) {
  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }

  const { loanRequest, financialEvidence } = parsed.data;

  let financialProfile: VerifiedFinancialProfile;
  try {
    financialProfile = await resolveFinancialProfile(financialEvidence);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to resolve financial evidence" },
      { status: 502 },
    );
  }

  if (!isAIConfigured()) {
    return Response.json({ error: AI_UNAVAILABLE_MESSAGE, code: "ai-unavailable" }, { status: 503 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (msg: StreamMessage) => controller.enqueue(encoder.encode(`${JSON.stringify(msg)}\n`));
      try {
        const result = await runNegotiation({
          loanRequest: loanRequest as LoanRequest,
          financialProfile,
          onRound: (round) => send({ type: "round", round }),
        });
        send({ type: "complete", result });
      } catch (err) {
        if (err instanceof AIUnavailableError) {
          send({ type: "error", error: err.message, code: "ai-unavailable" });
        } else {
          send({ type: "error", error: err instanceof Error ? err.message : "Negotiation failed", code: "negotiation-error" });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}

async function resolveFinancialProfile(
  evidence: z.infer<typeof RequestSchema>["financialEvidence"],
): Promise<VerifiedFinancialProfile> {
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

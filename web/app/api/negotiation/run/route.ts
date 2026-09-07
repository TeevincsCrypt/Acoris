import { z } from "zod";

import { runAttestcoinVerification, type AttestcoinVerificationResult } from "@/lib/attestcoin";
import { AIUnavailableError } from "@/lib/negotiation/ai-agent";
import { buildVerifiedFinancialProfile } from "@/lib/negotiation/financial-profile";
import { runNegotiation } from "@/lib/negotiation/engine";
import type { LoanRequest, VerifiedFinancialProfile } from "@/lib/negotiation/types";

const LoanRequestSchema = z.object({
  amount: z.number().positive(),
  collateralValue: z.number().positive(),
  durationDays: z.number().positive(),
  maxApr: z.number().positive(),
  preferredRepaymentConditions: z.string().optional(),
});

const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

const RequestSchema = z.object({
  loanRequest: LoanRequestSchema,
  // Never accept a client-supplied "verified" profile directly — only
  // transaction hashes, which the server independently re-verifies via the
  // Phase 2 Attestcoin pipeline. "unverified" carries a self-reported claim
  // that is explicitly never treated as verified evidence.
  financialEvidence: z
    .discriminatedUnion("mode", [
      z.object({ mode: z.literal("none") }),
      z.object({ mode: z.literal("unverified"), claimedSummary: z.string().optional() }),
      z.object({
        mode: z.literal("verify"),
        transactionHashes: z.array(z.string().regex(TX_HASH_PATTERN)).min(1).max(10),
      }),
    ])
    .optional(),
});

/**
 * Runs one full Acoris negotiation: derives the borrower's verified
 * financial profile (independently re-verifying any supplied transaction
 * hashes through the real Phase 2 pipeline — never trusting a
 * client-supplied verification result), then runs the Borrower AI / Lender
 * AI negotiation state machine to completion.
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

  try {
    const result = await runNegotiation({ loanRequest: loanRequest as LoanRequest, financialProfile });
    return Response.json(result);
  } catch (err) {
    if (err instanceof AIUnavailableError) {
      return Response.json({ error: err.message, code: "ai-unavailable" }, { status: 503 });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "Negotiation failed", code: "negotiation-error" },
      { status: 500 },
    );
  }
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

  // mode === "verify": independently re-run the real Attestcoin pipeline for
  // every supplied hash. Only genuinely successful verifications become
  // evidence — a failed/blocked verification simply doesn't count, it never
  // falls back to trusting the claim.
  const results: AttestcoinVerificationResult[] = await Promise.all(
    evidence.transactionHashes.map((txHash) => runAttestcoinVerification(txHash)),
  );
  return buildVerifiedFinancialProfile(results);
}

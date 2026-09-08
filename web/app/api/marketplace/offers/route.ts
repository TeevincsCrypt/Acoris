import { z } from "zod";

import { AI_UNAVAILABLE_MESSAGE, isAIConfigured } from "@/lib/negotiation/ai-agent";
import { generateLenderOffers, selectBestOffer } from "@/lib/negotiation/marketplace";
import { LoanRequestSchema } from "@/lib/negotiation/request-schemas";
import { FinancialEvidenceSchema, resolveFinancialProfile } from "@/lib/negotiation/resolve-financial-profile";
import type { LoanRequest, VerifiedFinancialProfile } from "@/lib/negotiation/types";

const RequestSchema = z.object({
  loanRequest: LoanRequestSchema,
  financialEvidence: FinancialEvidenceSchema,
});

/**
 * Generates one real opening offer per lender persona (see
 * LENDER_PERSONAS in constraints.ts) against the same, independently
 * re-verified financial profile, then picks the best one by a plain,
 * explainable rule (selectBestOffer). Not streamed — three AI calls run
 * in parallel and this responds once all three resolve.
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

  try {
    const offers = await generateLenderOffers({ loanRequest: loanRequest as LoanRequest, financialProfile });
    const selection = selectBestOffer(offers, (loanRequest as LoanRequest).collateralValue);
    return Response.json({ offers, financialProfileUsed: financialProfile, chosen: selection.chosen, chosenReasoning: selection.reasoning });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to generate lender offers", code: "marketplace-error" },
      { status: 502 },
    );
  }
}

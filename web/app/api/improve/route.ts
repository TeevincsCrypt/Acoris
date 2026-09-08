import { z } from "zod";

import { LENDER_PERSONAS } from "@/lib/negotiation/constraints";
import { buildImprovementSuggestions } from "@/lib/negotiation/improve";
import { LoanRequestSchema } from "@/lib/negotiation/request-schemas";
import { FinancialEvidenceSchema, resolveFinancialProfile } from "@/lib/negotiation/resolve-financial-profile";
import type { LoanRequest, VerifiedFinancialProfile } from "@/lib/negotiation/types";

const RequestSchema = z.object({
  loanRequest: LoanRequestSchema,
  financialEvidence: FinancialEvidenceSchema,
  lenderPersonaId: z.string().optional(),
});

/**
 * The Credit Improvement Simulator's API — like /api/underwriting, this
 * runs no AI call. Every projected number comes straight from
 * deriveLenderConstraints (constraints.ts) fed a concrete hypothetical
 * evidence change — never an invented future APR.
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

  const { loanRequest, financialEvidence, lenderPersonaId } = parsed.data;

  if (lenderPersonaId && !LENDER_PERSONAS.some((p) => p.id === lenderPersonaId)) {
    return Response.json({ error: `Unknown lenderPersonaId: ${lenderPersonaId}` }, { status: 400 });
  }
  const persona = lenderPersonaId ? LENDER_PERSONAS.find((p) => p.id === lenderPersonaId) : undefined;

  let financialProfile: VerifiedFinancialProfile;
  try {
    financialProfile = await resolveFinancialProfile(financialEvidence);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to resolve financial evidence" },
      { status: 502 },
    );
  }

  const suggestions = buildImprovementSuggestions({
    loanRequest: loanRequest as LoanRequest,
    financialProfile,
    policy: persona,
  });

  return Response.json({ suggestions, financialProfileUsed: financialProfile });
}

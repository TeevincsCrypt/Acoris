import { z } from "zod";

import { LENDER_PERSONAS } from "@/lib/negotiation/constraints";
import { LoanRequestSchema } from "@/lib/negotiation/request-schemas";
import { FinancialEvidenceSchema, resolveFinancialProfile } from "@/lib/negotiation/resolve-financial-profile";
import { buildUnderwritingReport } from "@/lib/negotiation/underwrite";
import type { LoanRequest, VerifiedFinancialProfile } from "@/lib/negotiation/types";

const RequestSchema = z.object({
  loanRequest: LoanRequestSchema,
  financialEvidence: FinancialEvidenceSchema,
  lenderPersonaId: z.string().optional(),
});

/**
 * The AI Credit Underwriter view's API — deliberately not an LLM call.
 * This runs the exact deterministic pricing math from constraints.ts
 * against the borrower's real (independently re-derived, never
 * client-trusted) financial evidence and returns a plain-language
 * breakdown of why a lender would price them the way it does. Works even
 * when ANTHROPIC_API_KEY isn't configured — there's no AI in this path.
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

  const report = buildUnderwritingReport({
    loanRequest: loanRequest as LoanRequest,
    financialProfile,
    policy: persona,
    policyName: persona?.name,
  });

  return Response.json({ report, financialProfileUsed: financialProfile });
}

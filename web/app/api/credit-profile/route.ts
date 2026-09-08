import { z } from "zod";

import { FinancialEvidenceSchema, resolveFinancialProfile } from "@/lib/negotiation/resolve-financial-profile";

const RequestSchema = z.object({
  financialEvidence: FinancialEvidenceSchema,
});

/**
 * Builds a borrower's verified credit profile independently of running a
 * negotiation — same real evidence-resolution path
 * (resolveFinancialProfile) the negotiation route uses, so a profile
 * checked here is exactly what a negotiation would price against. Never
 * accepts a client-supplied "verified" result — only raw inputs the server
 * independently re-verifies.
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

  try {
    const profile = await resolveFinancialProfile(parsed.data.financialEvidence);
    return Response.json({ profile });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to resolve financial evidence" },
      { status: 502 },
    );
  }
}

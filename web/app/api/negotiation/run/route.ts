import { z } from "zod";

import { AI_UNAVAILABLE_MESSAGE, AIUnavailableError, isAIConfigured } from "@/lib/negotiation/ai-agent";
import { runNegotiation } from "@/lib/negotiation/engine";
import { FinancialEvidenceSchema, resolveFinancialProfile } from "@/lib/negotiation/resolve-financial-profile";
import type { LoanRequest, NegotiationRound, VerifiedFinancialProfile } from "@/lib/negotiation/types";

const LoanRequestSchema = z.object({
  amount: z.number().positive(),
  collateralValue: z.number().positive(),
  durationDays: z.number().positive(),
  maxApr: z.number().positive(),
  preferredRepaymentConditions: z.string().optional(),
});

const RequestSchema = z.object({
  loanRequest: LoanRequestSchema,
  // Never accept a client-supplied "verified" profile directly — only
  // transaction hashes / a borrower address, which the server independently
  // re-derives evidence for. "unverified" carries a self-reported claim that
  // is explicitly never treated as verified evidence.
  financialEvidence: FinancialEvidenceSchema,
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

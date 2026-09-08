/**
 * The lender marketplace: instead of negotiating with one fixed lender
 * policy, three distinct, named lender personas (LENDER_PERSONAS in
 * constraints.ts) each independently price the same loan request with
 * their own real Lender AI call, producing a genuine opening offer per
 * lender. selectBestOffer (marketplace-compare.ts, pure) then picks the
 * best one by a plain, explainable rule — never an invented "AI judgment"
 * score.
 *
 * Server-only (calls the AI agent, itself server-only). This does not
 * replace the single-lender negotiation flow — engine.ts, ai-agent.ts's
 * core prompts, and round-logic.ts are untouched; once a persona is
 * chosen, the existing runNegotiation continues the deal normally, just
 * parameterized by that persona's LenderRiskPolicy (already a supported
 * input, unused by the marketplace itself).
 */

import "server-only";

import { proposeLenderAction } from "./ai-agent";
import { clampToLenderConstraints, deriveLenderConstraints, LENDER_PERSONAS } from "./constraints";
import type { LenderOffer } from "./marketplace-compare";
import type { LoanRequest, VerifiedFinancialProfile } from "./types";

export type { LenderOffer } from "./marketplace-compare";
export { selectBestOffer, type OfferSelection } from "./marketplace-compare";

/**
 * Runs all three lender personas' opening-round evaluation in parallel —
 * each is a real, independent Lender AI call priced against that
 * persona's own deterministically-derived LenderConstraints (see
 * deriveLenderConstraints), then clamped the same way any negotiation
 * round is clamped (clampToLenderConstraints) before being returned. If
 * any single persona's AI call fails, the whole marketplace request fails
 * honestly (Promise.all) rather than silently dropping a lender.
 */
export async function generateLenderOffers(input: {
  loanRequest: LoanRequest;
  financialProfile: VerifiedFinancialProfile;
}): Promise<LenderOffer[]> {
  return Promise.all(
    LENDER_PERSONAS.map(async (persona): Promise<LenderOffer> => {
      const constraints = deriveLenderConstraints(input.loanRequest, input.financialProfile, persona);
      const decision = await proposeLenderAction({
        loanRequest: input.loanRequest,
        constraints,
        financialProfile: input.financialProfile,
        history: [],
        roundNumber: 1,
        maxRounds: 1,
        persona: { name: persona.name, style: persona.style },
      });
      const { terms, wasClamped } = clampToLenderConstraints(
        { amount: decision.amount, collateral: decision.collateral, apr: decision.apr, durationDays: decision.durationDays },
        constraints,
      );
      return {
        personaId: persona.id,
        personaName: persona.name,
        personaStyle: persona.style,
        amount: terms.amount,
        collateral: terms.collateral,
        apr: terms.apr,
        durationDays: terms.durationDays,
        reasoning: decision.reasoning,
        wasClamped,
      };
    }),
  );
}

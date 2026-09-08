/**
 * Pure comparison over already-generated lender offers — no network, no
 * LLM. Kept separate from marketplace.ts (which calls the AI agents and so
 * needs "server-only") for the same reason round-logic.ts is separate from
 * engine.ts: this needs to be unit-testable in a plain Node test runner.
 *
 * The comparison is intentionally simple and explainable, not an invented
 * "AI judgment" score: filter to offers whose required collateral the
 * borrower can actually satisfy, then pick the lowest APR among those.
 * Every number in the reasoning string is a real value from a real offer.
 */

export interface LenderOffer {
  personaId: string;
  personaName: string;
  personaStyle: string;
  amount: number;
  collateral: number;
  apr: number;
  durationDays: number;
  reasoning: string;
  wasClamped: boolean;
}

export interface OfferSelection {
  chosen: LenderOffer | null;
  reasoning: string;
}

/**
 * Selects the best offer: lowest APR among offers whose required
 * collateral fits within `borrowerAvailableCollateral`, ties broken by
 * lower required collateral. `null` chosen means no offer's collateral
 * requirement fits — an honest "no match", never a fabricated pick.
 */
export function selectBestOffer(offers: LenderOffer[], borrowerAvailableCollateral: number): OfferSelection {
  const affordable = offers.filter((o) => o.collateral <= borrowerAvailableCollateral);

  if (affordable.length === 0) {
    return {
      chosen: null,
      reasoning:
        offers.length === 0
          ? "No lender offers were generated."
          : `None of the ${offers.length} lender offers' required collateral fit within the borrower's available collateral (${borrowerAvailableCollateral}).`,
    };
  }

  const sorted = [...affordable].sort((a, b) => a.apr - b.apr || a.collateral - b.collateral);
  const chosen = sorted[0];

  return {
    chosen,
    reasoning: `${chosen.personaName} offered the lowest APR (${chosen.apr}%) among lenders whose required collateral (${chosen.collateral}) fit within the borrower's available collateral (${borrowerAvailableCollateral}).`,
  };
}

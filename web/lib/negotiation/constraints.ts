/**
 * Deterministic financial constraint derivation and enforcement.
 *
 * This is the layer the spec requires: "The LLM may propose decisions, but
 * it must NOT be trusted to enforce [maxApr / maxAmount / minCollateral /
 * maxRounds]." Every function here is a pure, synchronous function of its
 * inputs — no network, no LLM, fully unit-testable.
 */

import type {
  BorrowerConstraints,
  LenderConstraints,
  LoanRequest,
  NegotiationTerms,
  VerifiedFinancialProfile,
} from "./types";

export const MAX_NEGOTIATION_ROUNDS = 8;

// ---------------------------------------------------------------------------
// Constraint derivation
// ---------------------------------------------------------------------------

/** Borrower will never accept worse than these — derived from their own loan request. */
export function deriveBorrowerConstraints(
  loanRequest: LoanRequest,
  opts: { minAmountFraction?: number; maxDurationMultiple?: number } = {},
): BorrowerConstraints {
  const minAmountFraction = opts.minAmountFraction ?? 0.8;
  const maxDurationMultiple = opts.maxDurationMultiple ?? 3;

  return {
    maxApr: loanRequest.maxApr,
    minAmount: loanRequest.amount * minAmountFraction,
    maxCollateral: loanRequest.collateralValue,
    minDurationDays: loanRequest.durationDays,
    maxDurationDays: loanRequest.durationDays * maxDurationMultiple,
  };
}

export interface LenderRiskPolicy {
  /** Base APR floor for a borrower with no verified history. */
  baseMinApr: number;
  /** Absolute lowest APR the lender will ever offer, regardless of history. */
  bestCaseMinApr: number;
  /** Base collateral ratio required with no verified history. */
  baseMinCollateralRatio: number;
  /** Best-case collateral ratio for a strong verified repayment history. */
  bestCaseMinCollateralRatio: number;
  /** Lender's own cap on any single loan, independent of the request. */
  maxAmount: number;
  maxDurationDays: number;
}

export const DEFAULT_LENDER_RISK_POLICY: LenderRiskPolicy = {
  baseMinApr: 9,
  bestCaseMinApr: 4,
  baseMinCollateralRatio: 1.5,
  bestCaseMinCollateralRatio: 1.15,
  maxAmount: 100_000,
  maxDurationDays: 365,
};

export interface LenderPersona extends LenderRiskPolicy {
  id: string;
  name: string;
  /** One-word risk stance shown in the marketplace UI and given to the persona's own Lender AI prompt. */
  style: string;
}

/**
 * Three distinct, deterministic risk policies for the lender marketplace
 * (see lib/negotiation/marketplace.ts) — not three copies of the same
 * lender with different names. The tradeoff is real: a lender willing to
 * accept less collateral (Gamma) prices that added risk into a higher
 * APR floor; a lender demanding more collateral (Alpha) can afford to
 * offer a lower rate. Beta matches DEFAULT_LENDER_RISK_POLICY exactly, so
 * the single-lender negotiation flow (lenderPersonaId omitted) is
 * unaffected by this list existing.
 */
export const LENDER_PERSONAS: LenderPersona[] = [
  {
    id: "alpha",
    name: "Lender Alpha",
    style: "Conservative",
    baseMinApr: 8,
    bestCaseMinApr: 5,
    baseMinCollateralRatio: 1.55,
    bestCaseMinCollateralRatio: 1.3,
    maxAmount: 100_000,
    maxDurationDays: 365,
  },
  {
    id: "beta",
    name: "Lender Beta",
    style: "Balanced",
    baseMinApr: 9,
    bestCaseMinApr: 4,
    baseMinCollateralRatio: 1.5,
    bestCaseMinCollateralRatio: 1.15,
    maxAmount: 100_000,
    maxDurationDays: 365,
  },
  {
    id: "gamma",
    name: "Lender Gamma",
    style: "Aggressive",
    baseMinApr: 9.5,
    bestCaseMinApr: 6,
    baseMinCollateralRatio: 1.35,
    bestCaseMinCollateralRatio: 1.1,
    maxAmount: 100_000,
    maxDurationDays: 365,
  },
];

/**
 * Derives the lender's risk-adjusted constraints. This is the one place
 * verified financial history is allowed to influence pricing — and it
 * only ever reads the "verified" branch of VerifiedFinancialProfile.
 * "unverified" (self-reported, unproven) and "not-available" both get
 * the conservative baseline: unverified claims are never treated as
 * verified financial history, by construction, not just by prompt.
 */
export function deriveLenderConstraints(
  loanRequest: LoanRequest,
  financialProfile: VerifiedFinancialProfile,
  policy: LenderRiskPolicy = DEFAULT_LENDER_RISK_POLICY,
): LenderConstraints {
  let riskDiscount = 0; // 0 = no discount (baseline), 1 = maximum discount (best case)

  if (financialProfile.status === "verified") {
    // Deterministic, bounded scoring from verified evidence only.
    const countScore = Math.min(financialProfile.verifiedRepaymentCount / 5, 1); // saturates at 5 repayments
    const failureRatio =
      financialProfile.failedRepaymentCount /
      Math.max(financialProfile.successfulRepaymentCount + financialProfile.failedRepaymentCount, 1);
    const reliabilityScore = 1 - failureRatio;
    riskDiscount = Math.max(0, Math.min(1, countScore * reliabilityScore));
  }

  const minApr = policy.baseMinApr - (policy.baseMinApr - policy.bestCaseMinApr) * riskDiscount;
  const minCollateralRatio =
    policy.baseMinCollateralRatio -
    (policy.baseMinCollateralRatio - policy.bestCaseMinCollateralRatio) * riskDiscount;

  return {
    minApr: Math.max(minApr, policy.bestCaseMinApr),
    maxAmount: Math.min(policy.maxAmount, loanRequest.amount * 2),
    minCollateralRatio: Math.max(minCollateralRatio, policy.bestCaseMinCollateralRatio),
    maxDurationDays: policy.maxDurationDays,
  };
}

// ---------------------------------------------------------------------------
// Offer validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  violations: string[];
}

export function validateBorrowerOffer(terms: NegotiationTerms, constraints: BorrowerConstraints): ValidationResult {
  const violations: string[] = [];

  if (terms.apr > constraints.maxApr) {
    violations.push(`apr ${terms.apr} exceeds borrower's maximum acceptable APR ${constraints.maxApr}`);
  }
  if (terms.amount < constraints.minAmount) {
    violations.push(`amount ${terms.amount} is below borrower's minimum acceptable amount ${constraints.minAmount}`);
  }
  if (terms.collateral > constraints.maxCollateral) {
    violations.push(`collateral ${terms.collateral} exceeds borrower's available collateral ${constraints.maxCollateral}`);
  }
  if (terms.durationDays < constraints.minDurationDays) {
    violations.push(`durationDays ${terms.durationDays} is below borrower's minimum required duration ${constraints.minDurationDays}`);
  }
  if (terms.durationDays > constraints.maxDurationDays) {
    violations.push(`durationDays ${terms.durationDays} exceeds borrower's maximum acceptable duration ${constraints.maxDurationDays}`);
  }

  return { valid: violations.length === 0, violations };
}

export function validateLenderOffer(terms: NegotiationTerms, constraints: LenderConstraints): ValidationResult {
  const violations: string[] = [];

  if (terms.apr < constraints.minApr) {
    violations.push(`apr ${terms.apr} is below lender's minimum acceptable APR ${constraints.minApr}`);
  }
  if (terms.amount > constraints.maxAmount) {
    violations.push(`amount ${terms.amount} exceeds lender's maximum loan amount ${constraints.maxAmount}`);
  }
  if (terms.durationDays > constraints.maxDurationDays) {
    violations.push(`durationDays ${terms.durationDays} exceeds lender's maximum acceptable duration ${constraints.maxDurationDays}`);
  }
  const collateralRatio = terms.amount > 0 ? terms.collateral / terms.amount : Infinity;
  if (collateralRatio < constraints.minCollateralRatio) {
    violations.push(
      `collateral ratio ${collateralRatio.toFixed(3)} is below lender's minimum required ratio ${constraints.minCollateralRatio}`,
    );
  }

  return { valid: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Clamping — the deterministic safety net applied to whatever the LLM
// proposes, so a hard limit is never violated regardless of model output.
// ---------------------------------------------------------------------------

export function clampToBorrowerConstraints(terms: NegotiationTerms, constraints: BorrowerConstraints): {
  terms: NegotiationTerms;
  wasClamped: boolean;
} {
  const clamped: NegotiationTerms = {
    apr: Math.min(terms.apr, constraints.maxApr),
    amount: Math.max(terms.amount, constraints.minAmount),
    collateral: Math.min(terms.collateral, constraints.maxCollateral),
    durationDays: Math.min(Math.max(terms.durationDays, constraints.minDurationDays), constraints.maxDurationDays),
  };
  const wasClamped =
    clamped.apr !== terms.apr ||
    clamped.amount !== terms.amount ||
    clamped.collateral !== terms.collateral ||
    clamped.durationDays !== terms.durationDays;
  return { terms: clamped, wasClamped };
}

export function clampToLenderConstraints(terms: NegotiationTerms, constraints: LenderConstraints): {
  terms: NegotiationTerms;
  wasClamped: boolean;
} {
  let { amount, collateral, apr, durationDays } = terms;

  apr = Math.max(apr, constraints.minApr);
  amount = Math.min(amount, constraints.maxAmount);
  durationDays = Math.min(durationDays, constraints.maxDurationDays);

  const minCollateral = amount * constraints.minCollateralRatio;
  if (collateral < minCollateral) {
    collateral = minCollateral;
  }

  const clamped: NegotiationTerms = { amount, collateral, apr, durationDays };
  const wasClamped =
    clamped.apr !== terms.apr ||
    clamped.amount !== terms.amount ||
    clamped.collateral !== terms.collateral ||
    clamped.durationDays !== terms.durationDays;
  return { terms: clamped, wasClamped };
}

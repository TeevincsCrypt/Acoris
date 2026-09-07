/**
 * Acoris AI Credit Negotiation Engine — shared types.
 *
 * This is a structured negotiation state machine, not a chatbot. Every
 * round produces machine-readable data (see NegotiationRound). The LLM
 * (see ai-agent.ts) only ever *proposes* a candidate action; constraints.ts
 * is the deterministic code that enforces hard limits regardless of what
 * the LLM proposes.
 */

// ---------------------------------------------------------------------------
// Loan request
// ---------------------------------------------------------------------------

export interface LoanRequest {
  /** Requested principal, in the deal's unit (e.g. USD-equivalent). */
  amount: number;
  /** Value of collateral the borrower is offering, same unit as amount. */
  collateralValue: number;
  durationDays: number;
  /** Borrower's hard ceiling — will never accept an APR above this. */
  maxApr: number;
  /** Free-text preference, e.g. "monthly installments". Not enforced by code. */
  preferredRepaymentConditions?: string;
}

// ---------------------------------------------------------------------------
// Verified financial profile
//
// Populated (eventually) from the Phase 2 Attestcoin pipeline
// (lib/attestcoin.ts). Never fabricated: if no genuine verification
// evidence exists, status is "not-available", not a set of invented
// numbers. "unverified" is for a borrower's self-reported claims that
// have NOT been backed by Attestcoin proof — the Lender AI must not
// treat those as verified history (enforced both in the prompt and,
// more importantly, in deriveLenderConstraints, which only ever reads
// the "verified" branch).
// ---------------------------------------------------------------------------

export type FinancialProfileStatus = "not-available" | "unverified" | "verified";

export interface VerificationEvidenceRef {
  sourceChain: string;
  transactionHash: string;
  blockHeight: number;
  /** true only when Attestcoin's BlockProver verification genuinely succeeded for this tx (or, for native CC3 evidence, the event genuinely exists on-chain). */
  verified: true;
  /** Repayment amount decoded from the verified proof, in wei (string to avoid float loss). */
  amountWei: string;
  status: "success" | "failed";
  /**
   * Whether this repayment happened by its due date. `null` when not
   * derivable from this evidence's source — Sepolia-via-Attestcoin evidence
   * (lib/attestcoin.ts's fact shape) carries no due-date, so it's always
   * null there. Native CC3 AcorisLoanRegistry history (lib/negotiation/onchain-history.ts)
   * computes a real boolean from the loan's actual funded-at + duration vs.
   * its actual repayment timestamp.
   */
  onTime: boolean | null;
}

export interface NotAvailableProfile {
  status: "not-available";
}

export interface UnverifiedProfile {
  status: "unverified";
  /** Borrower's self-reported claim, explicitly not backed by proof. */
  claimedSummary?: string;
}

export interface VerifiedProfile {
  status: "verified";
  verifiedRepaymentCount: number;
  /** Total repaid volume across verified evidence, in wei (string to avoid float loss). */
  verifiedRepaymentVolume: string;
  successfulRepaymentCount: number;
  failedRepaymentCount: number;
  /**
   * Fraction of verified repayments that were on time, 0..1, computed only
   * from evidence entries where `onTime` is known (see VerificationEvidenceRef).
   * `null` when no evidence entry has a determinable due date — e.g. when
   * every entry came from Sepolia-via-Attestcoin (Phase 2), which carries
   * no due-date. Never invented from evidence that doesn't support it.
   */
  onTimeRepaymentRate: number | null;
  /** Description of the most recent verified activity (e.g. "Sepolia block 9123456"). */
  mostRecentVerifiedActivity: string;
  sourceChains: string[];
  verificationEvidence: VerificationEvidenceRef[];
}

export type VerifiedFinancialProfile = NotAvailableProfile | UnverifiedProfile | VerifiedProfile;

// ---------------------------------------------------------------------------
// Borrower
// ---------------------------------------------------------------------------

export interface BorrowerProfile {
  id: string;
  displayName: string;
  walletAddress?: string;
  loanRequest: LoanRequest;
  financialProfile: VerifiedFinancialProfile;
}

// ---------------------------------------------------------------------------
// Financial constraints — deterministic, enforced by code (constraints.ts)
// ---------------------------------------------------------------------------

export interface BorrowerConstraints {
  maxApr: number;
  minAmount: number;
  maxCollateral: number;
  minDurationDays: number;
  maxDurationDays: number;
}

export interface LenderConstraints {
  minApr: number;
  maxAmount: number;
  /** Minimum collateralValue / amount ratio the lender will accept. */
  minCollateralRatio: number;
  maxDurationDays: number;
}

// ---------------------------------------------------------------------------
// Negotiation state machine
// ---------------------------------------------------------------------------

export type AgentRole = "borrower" | "lender";
export type NegotiationAction = "OFFER" | "COUNTER" | "ACCEPT" | "REJECT";
export type RoundStatus = "in-progress" | "accepted" | "rejected" | "max-rounds-reached";

export interface NegotiationTerms {
  amount: number;
  collateral: number;
  apr: number;
  durationDays: number;
}

export interface NegotiationRound extends NegotiationTerms {
  round: number;
  agent: AgentRole;
  action: NegotiationAction;
  reasoning: string;
  status: RoundStatus;
  /** True when constraints.ts had to clamp the AI's proposed numbers into valid range. */
  wasClamped: boolean;
}

export type LoanTermsStatus = "accepted" | "rejected" | "no-agreement";

export interface LoanTerms {
  amount: number;
  collateral: number;
  apr: number;
  duration: number;
  status: LoanTermsStatus;
}

export interface NegotiationResult {
  /** Stable id for this negotiation, used to derive the on-chain loanHash (see lib/loan-contract). */
  negotiationId: string;
  rounds: NegotiationRound[];
  finalTerms: LoanTerms;
  financialProfileUsed: VerifiedFinancialProfile;
  borrowerConstraints: BorrowerConstraints;
  lenderConstraints: LenderConstraints;
}

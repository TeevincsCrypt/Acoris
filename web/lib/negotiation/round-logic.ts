/**
 * Pure negotiation round/termination logic, split out of engine.ts so it's
 * testable without pulling in the server-only AI agent module (engine.ts
 * imports "server-only", which throws when loaded outside Next's
 * server bundling context — including a plain Node test runner).
 *
 * No network, no LLM — a deterministic function of its inputs.
 */

import { clampToBorrowerConstraints, clampToLenderConstraints } from "./constraints";
import type {
  AgentRole,
  BorrowerConstraints,
  LenderConstraints,
  LoanTerms,
  NegotiationAction,
  NegotiationRound,
  NegotiationTerms,
} from "./types";

/** The subset of an AgentDecision this module needs — avoids importing ai-agent.ts (server-only). */
export interface ProposedDecision {
  action: NegotiationAction;
  amount: number;
  collateral: number;
  apr: number;
  durationDays: number;
  reasoning: string;
}

export function otherRole(role: AgentRole): AgentRole {
  return role === "borrower" ? "lender" : "borrower";
}

export function toTerms(decision: ProposedDecision): NegotiationTerms {
  return {
    amount: decision.amount,
    collateral: decision.collateral,
    apr: decision.apr,
    durationDays: decision.durationDays,
  };
}

export function clampForAgent(
  agent: AgentRole,
  terms: NegotiationTerms,
  borrowerConstraints: BorrowerConstraints,
  lenderConstraints: LenderConstraints,
): { terms: NegotiationTerms; wasClamped: boolean } {
  return agent === "borrower"
    ? clampToBorrowerConstraints(terms, borrowerConstraints)
    : clampToLenderConstraints(terms, lenderConstraints);
}

/**
 * Turns one agent's proposed decision into an official NegotiationRound,
 * enforcing (via constraints.ts) that hard limits are never violated
 * regardless of what was proposed:
 *   - Round 1 is always an OFFER, even if the model proposed otherwise.
 *   - ACCEPT always adopts the counterpart's exact last-offered terms
 *     (never the accepting agent's own possibly-drifted numbers), and
 *     those terms are re-clamped to the accepting agent's own
 *     constraints as a defense-in-depth check.
 *   - OFFER/COUNTER numeric terms are always clamped into the proposing
 *     agent's own constraints before being recorded.
 */
export function enforceAndBuildRound(params: {
  agent: AgentRole;
  roundNumber: number;
  decision: ProposedDecision;
  borrowerConstraints: BorrowerConstraints;
  lenderConstraints: LenderConstraints;
  history: NegotiationRound[];
  isFirstRound: boolean;
  isLastAllowedRound: boolean;
}): NegotiationRound {
  const { agent, roundNumber, decision, borrowerConstraints, lenderConstraints, history, isFirstRound, isLastAllowedRound } =
    params;

  const action: NegotiationAction = isFirstRound ? "OFFER" : decision.action;

  if (action === "ACCEPT") {
    const lastRound = history[history.length - 1];
    if (lastRound) {
      const proposedTerms = toTerms(lastRound);
      const { terms, wasClamped } = clampForAgent(agent, proposedTerms, borrowerConstraints, lenderConstraints);
      return {
        round: roundNumber,
        agent,
        action: "ACCEPT",
        ...terms,
        reasoning: decision.reasoning,
        status: "accepted",
        wasClamped,
      };
    }
    // Nothing to accept yet — degrade to a same-terms COUNTER instead of accepting nothing.
    const proposedTerms = toTerms(decision);
    const { terms, wasClamped } = clampForAgent(agent, proposedTerms, borrowerConstraints, lenderConstraints);
    return {
      round: roundNumber,
      agent,
      action: "COUNTER",
      ...terms,
      reasoning: decision.reasoning,
      status: isLastAllowedRound ? "max-rounds-reached" : "in-progress",
      wasClamped,
    };
  }

  if (action === "REJECT") {
    const terms = toTerms(decision);
    return {
      round: roundNumber,
      agent,
      action: "REJECT",
      ...terms,
      reasoning: decision.reasoning,
      status: "rejected",
      wasClamped: false,
    };
  }

  // OFFER / COUNTER
  const proposedTerms = toTerms(decision);
  const { terms, wasClamped } = clampForAgent(agent, proposedTerms, borrowerConstraints, lenderConstraints);
  const status = isLastAllowedRound ? "max-rounds-reached" : "in-progress";

  return {
    round: roundNumber,
    agent,
    action,
    ...terms,
    reasoning: decision.reasoning,
    status,
    wasClamped,
  };
}

export function deriveFinalTerms(history: NegotiationRound[]): LoanTerms {
  const last = history[history.length - 1];

  if (!last) {
    return { amount: 0, collateral: 0, apr: 0, duration: 0, status: "no-agreement" };
  }

  if (last.status === "accepted") {
    return { amount: last.amount, collateral: last.collateral, apr: last.apr, duration: last.durationDays, status: "accepted" };
  }

  if (last.status === "rejected") {
    return { amount: last.amount, collateral: last.collateral, apr: last.apr, duration: last.durationDays, status: "rejected" };
  }

  // Ran out of rounds without either side accepting or rejecting.
  return { amount: 0, collateral: 0, apr: 0, duration: 0, status: "no-agreement" };
}

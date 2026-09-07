/**
 * The negotiation state machine. Server-only (calls the AI agents, which
 * are themselves server-only). Alternates Borrower AI / Lender AI turns;
 * every proposed action is validated and, if necessary, clamped by
 * constraints.ts (via round-logic.ts) before it becomes an official
 * NegotiationRound — the LLM proposes, this function enforces.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { proposeBorrowerAction, proposeLenderAction, type AgentDecision } from "./ai-agent";
import { MAX_NEGOTIATION_ROUNDS, deriveBorrowerConstraints, deriveLenderConstraints, type LenderRiskPolicy } from "./constraints";
import { deriveFinalTerms, enforceAndBuildRound, otherRole } from "./round-logic";
import type {
  AgentRole,
  BorrowerConstraints,
  LenderConstraints,
  LoanRequest,
  NegotiationResult,
  NegotiationRound,
  VerifiedFinancialProfile,
} from "./types";

export interface RunNegotiationInput {
  loanRequest: LoanRequest;
  financialProfile: VerifiedFinancialProfile;
  lenderRiskPolicy?: LenderRiskPolicy;
  maxRounds?: number;
}

async function getDecision(
  agent: AgentRole,
  ctx: {
    loanRequest: LoanRequest;
    borrowerConstraints: BorrowerConstraints;
    lenderConstraints: LenderConstraints;
    financialProfile: VerifiedFinancialProfile;
    history: NegotiationRound[];
    roundNumber: number;
    maxRounds: number;
  },
): Promise<AgentDecision> {
  if (agent === "borrower") {
    return proposeBorrowerAction({
      loanRequest: ctx.loanRequest,
      constraints: ctx.borrowerConstraints,
      history: ctx.history,
      roundNumber: ctx.roundNumber,
      maxRounds: ctx.maxRounds,
    });
  }
  return proposeLenderAction({
    loanRequest: ctx.loanRequest,
    constraints: ctx.lenderConstraints,
    financialProfile: ctx.financialProfile,
    history: ctx.history,
    roundNumber: ctx.roundNumber,
    maxRounds: ctx.maxRounds,
  });
}

export async function runNegotiation(input: RunNegotiationInput): Promise<NegotiationResult> {
  const maxRounds = input.maxRounds ?? MAX_NEGOTIATION_ROUNDS;
  const borrowerConstraints = deriveBorrowerConstraints(input.loanRequest);
  const lenderConstraints = deriveLenderConstraints(input.loanRequest, input.financialProfile, input.lenderRiskPolicy);

  const history: NegotiationRound[] = [];
  let agent: AgentRole = "borrower";

  for (let roundNumber = 1; roundNumber <= maxRounds; roundNumber++) {
    const decision = await getDecision(agent, {
      loanRequest: input.loanRequest,
      borrowerConstraints,
      lenderConstraints,
      financialProfile: input.financialProfile,
      history,
      roundNumber,
      maxRounds,
    });

    const round = enforceAndBuildRound({
      agent,
      roundNumber,
      decision,
      borrowerConstraints,
      lenderConstraints,
      history,
      isFirstRound: roundNumber === 1,
      isLastAllowedRound: roundNumber === maxRounds,
    });

    history.push(round);

    if (round.status === "accepted" || round.status === "rejected" || round.status === "max-rounds-reached") {
      break;
    }

    agent = otherRole(agent);
  }

  return {
    negotiationId: randomUUID(),
    rounds: history,
    finalTerms: deriveFinalTerms(history),
    financialProfileUsed: input.financialProfile,
    borrowerConstraints,
    lenderConstraints,
  };
}

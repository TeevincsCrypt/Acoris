/**
 * LLM-backed negotiation agents.
 *
 * Server-only — never import this from a client component. Calls Claude
 * (Anthropic API) via structured outputs (Zod schema + `messages.parse`,
 * verified against the installed @anthropic-ai/sdk source before writing
 * this — see docs/ACORIS_NEGOTIATION_ENGINE.md) to get a candidate
 * NegotiationAction. The model PROPOSES; it is never trusted to enforce
 * limits — engine.ts always runs the proposal through constraints.ts
 * before it becomes an official round.
 *
 * If ANTHROPIC_API_KEY isn't configured, or the call fails, this throws a
 * typed AIUnavailableError. There is no silent fallback that fabricates a
 * plausible-looking "AI" response — a failed call is a failed round, never
 * a fake one.
 */

import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import type {
  AgentRole,
  BorrowerConstraints,
  LenderConstraints,
  LoanRequest,
  NegotiationRound,
  VerifiedFinancialProfile,
} from "./types";

export class AIUnavailableError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "AIUnavailableError";
  }
}

const AgentDecisionSchema = z.object({
  action: z.enum(["OFFER", "COUNTER", "ACCEPT", "REJECT"]),
  amount: z.number(),
  collateral: z.number(),
  apr: z.number(),
  durationDays: z.number(),
  reasoning: z.string(),
});

export type AgentDecision = z.infer<typeof AgentDecisionSchema>;

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AIUnavailableError(
      "ANTHROPIC_API_KEY is not configured on the server — the negotiation AI cannot run.",
    );
  }
  if (!cachedClient) {
    cachedClient = new Anthropic();
  }
  return cachedClient;
}

const MODEL = "claude-opus-5";

function formatFinancialProfile(profile: VerifiedFinancialProfile): string {
  if (profile.status === "not-available") {
    return "No verified financial evidence is available for this borrower. Treat this exactly like an unknown borrower with no history — do not assume good or bad credit.";
  }
  if (profile.status === "unverified") {
    return `The borrower has made unverified, self-reported claims about their financial history${
      profile.claimedSummary ? `: "${profile.claimedSummary}"` : ""
    }. These are NOT backed by Attestcoin proof. You must treat this exactly the same as having no verified evidence at all — never factor unverified claims into your pricing.`;
  }
  return [
    `Verified financial evidence (proven on-chain via Attestcoin, cryptographically verified — trustworthy):`,
    `- verified repayments: ${profile.verifiedRepaymentCount} (${profile.successfulRepaymentCount} successful, ${profile.failedRepaymentCount} failed)`,
    `- verified repayment volume: ${profile.verifiedRepaymentVolume} wei`,
    `- on-time repayment rate: ${profile.onTimeRepaymentRate === null ? "not available" : profile.onTimeRepaymentRate}`,
    `- most recent verified activity: ${profile.mostRecentVerifiedActivity}`,
    `- source chains: ${profile.sourceChains.join(", ")}`,
  ].join("\n");
}

function formatHistory(history: NegotiationRound[]): string {
  if (history.length === 0) return "No offers have been made yet — you are opening the negotiation.";
  return history
    .map(
      (r) =>
        `Round ${r.round} (${r.agent}): ${r.action} — amount=${r.amount}, collateral=${r.collateral}, apr=${r.apr}%, durationDays=${r.durationDays}. Reasoning: ${r.reasoning}`,
    )
    .join("\n");
}

interface BorrowerAgentInput {
  loanRequest: LoanRequest;
  constraints: BorrowerConstraints;
  history: NegotiationRound[];
  roundNumber: number;
  maxRounds: number;
}

export async function proposeBorrowerAction(input: BorrowerAgentInput): Promise<AgentDecision> {
  const client = getClient();

  const system = [
    "You are the Borrower AI in Acoris, a DeFi lending negotiation protocol.",
    "You negotiate on behalf of a borrower for a loan on Creditcoin CC3 Testnet.",
    "You know your borrower's hard limits, but you do NOT enforce them — a separate",
    "deterministic system will reject or clamp anything outside those limits, so focus",
    "on proposing a reasonable, well-reasoned negotiating position, not on gaming the limits.",
    "Never propose or accept an APR above the borrower's maxApr, an amount below their",
    "minAmount, collateral above their maxCollateral, or a duration outside their bounds.",
    "If the lender's last offer is already within your borrower's limits and reasonable,",
    "ACCEPT it rather than negotiating pointlessly.",
  ].join(" ");

  const user = [
    `Loan request: amount=${input.loanRequest.amount}, collateralValue=${input.loanRequest.collateralValue}, durationDays=${input.loanRequest.durationDays}, maxApr=${input.loanRequest.maxApr}%${input.loanRequest.preferredRepaymentConditions ? `, preferred repayment: ${input.loanRequest.preferredRepaymentConditions}` : ""}.`,
    `Your hard limits: maxApr=${input.constraints.maxApr}%, minAmount=${input.constraints.minAmount}, maxCollateral=${input.constraints.maxCollateral}, durationDays in [${input.constraints.minDurationDays}, ${input.constraints.maxDurationDays}].`,
    `Negotiation so far:\n${formatHistory(input.history)}`,
    `This is round ${input.roundNumber} of at most ${input.maxRounds}.`,
    "Decide your next action: OFFER (opening), COUNTER, ACCEPT, or REJECT. Give concrete numbers and a concise reasoning.",
  ].join("\n\n");

  return callAgent(client, system, user);
}

interface LenderAgentInput {
  loanRequest: LoanRequest;
  constraints: LenderConstraints;
  financialProfile: VerifiedFinancialProfile;
  history: NegotiationRound[];
  roundNumber: number;
  maxRounds: number;
}

export async function proposeLenderAction(input: LenderAgentInput): Promise<AgentDecision> {
  const client = getClient();

  const system = [
    "You are the Lender AI in Acoris, a DeFi lending negotiation protocol.",
    "You evaluate a loan request and negotiate terms on behalf of the lender.",
    "You price risk using ONLY genuinely verified financial evidence (proven on-chain via",
    "Attestcoin). You must NEVER treat unverified or self-reported claims as verified",
    "financial history — if evidence is unverified or not available, price the loan as",
    "you would for a completely unknown borrower, no better.",
    "You do not enforce your own limits — a separate deterministic system will reject or",
    "clamp anything outside them — so focus on proposing well-reasoned, risk-appropriate",
    "terms and explaining clearly why your terms changed between rounds.",
    "If the borrower's last offer already meets your limits and is reasonable given the",
    "evidence, ACCEPT it rather than squeezing for more.",
  ].join(" ");

  const user = [
    `Loan request: amount=${input.loanRequest.amount}, collateralValue=${input.loanRequest.collateralValue}, durationDays=${input.loanRequest.durationDays}, borrower's maxApr=${input.loanRequest.maxApr}%.`,
    `Your risk limits: minApr=${input.constraints.minApr.toFixed(2)}%, maxAmount=${input.constraints.maxAmount}, minCollateralRatio=${input.constraints.minCollateralRatio.toFixed(3)}, maxDurationDays=${input.constraints.maxDurationDays}.`,
    formatFinancialProfile(input.financialProfile),
    `Negotiation so far:\n${formatHistory(input.history)}`,
    `This is round ${input.roundNumber} of at most ${input.maxRounds}.`,
    "Decide your next action: OFFER (initial terms), COUNTER, ACCEPT, or REJECT. Give concrete numbers and explain, referencing the verified evidence status, why your terms are what they are.",
  ].join("\n\n");

  return callAgent(client, system, user);
}

async function callAgent(client: Anthropic, system: string, user: string): Promise<AgentDecision> {
  try {
    const message = await client.messages.parse({
      model: MODEL,
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: user }],
      output_config: {
        format: zodOutputFormat(AgentDecisionSchema),
      },
    });

    if (!message.parsed_output) {
      throw new AIUnavailableError("Claude returned a response that could not be parsed as a structured decision.");
    }

    return message.parsed_output;
  } catch (err) {
    if (err instanceof AIUnavailableError) throw err;
    if (err instanceof Anthropic.AuthenticationError) {
      throw new AIUnavailableError("Anthropic API authentication failed — check ANTHROPIC_API_KEY.", err);
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new AIUnavailableError("Anthropic API rate limited — try again shortly.", err);
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new AIUnavailableError("Could not reach the Anthropic API (network error).", err);
    }
    if (err instanceof Anthropic.APIError) {
      throw new AIUnavailableError(`Anthropic API error: ${err.message}`, err);
    }
    throw new AIUnavailableError(err instanceof Error ? err.message : String(err), err);
  }
}

export function agentRoleLabel(role: AgentRole): string {
  return role === "borrower" ? "Borrower AI" : "Lender AI";
}

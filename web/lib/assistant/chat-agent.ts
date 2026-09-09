/**
 * Acoris AI — a read-only chat assistant grounded in the real Acoris
 * protocol. It is deliberately NOT the Borrower AI / Lender AI
 * (lib/negotiation/ai-agent.ts): it never proposes loan terms, never
 * negotiates, and never writes on-chain state. Its only job is to explain
 * the protocol accurately and, when asked about a connected wallet's own
 * history, answer from real on-chain data instead of guessing — the same
 * "nothing is fabricated" principle the rest of the product follows.
 *
 * Server-only. Calls Claude (Anthropic API) with one tool
 * (lookup_wallet_activity) via a manual streaming loop — matching
 * ai-agent.ts's plain-SDK approach rather than the beta tool runner, and
 * reusing its AIUnavailableError / isAIConfigured so "not configured" means
 * exactly the same thing across every AI-backed route in this app.
 */

import "server-only";

import { JsonRpcProvider } from "ethers";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { AIUnavailableError, isAIConfigured } from "@/lib/negotiation/ai-agent";
import { CC3_TESTNET_RPC_HTTP } from "@/lib/creditcoin";
import { isLoanRegistryDeployed, LOAN_REGISTRY_ADDRESS } from "@/lib/loan-contract";
import { fetchOnChainLoanHistory, LOAN_REGISTRY_DEPLOY_BLOCK } from "@/lib/negotiation/onchain-history";
import type { LoanTimelineDto } from "@/lib/dashboard";
import { summarizeWalletActivity } from "./summarize-wallet-activity";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const MODEL = "claude-opus-5";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const WalletLookupInputSchema = z.object({
  address: z.string().regex(ADDRESS_PATTERN),
  role: z.enum(["borrower", "lender"]),
});

const WALLET_LOOKUP_TOOL: Anthropic.Tool = {
  name: "lookup_wallet_activity",
  description:
    "Look up a wallet's real history on AcorisLoanRegistry (Creditcoin CC3 Testnet) — every loan agreement it has " +
    "been party to as either borrower or lender, with real outcomes (pending/funded/repaid/defaulted/cancelled) " +
    "read live from the contract's own event log. ALWAYS call this before answering any question about 'my loans', " +
    "'my active loans', 'loans awaiting my review', or anything else about a specific wallet's real activity — " +
    "never guess or estimate this data. A wallet can be a borrower on some agreements and a lender on others, so " +
    "call this once per role you need (you may call it twice in the same turn, once per role, to get the full picture).",
  input_schema: {
    type: "object",
    properties: {
      address: { type: "string", description: "The 0x-prefixed wallet address to look up." },
      role: {
        type: "string",
        enum: ["borrower", "lender"],
        description: "Which side of each agreement this address is being looked up as.",
      },
    },
    required: ["address", "role"],
  },
};

/** Real network call — same env gating as /api/dashboard, so a misconfigured deployment fails the same honest way here as it does there. */
async function runWalletLookup(rawInput: unknown): Promise<string> {
  const parsed = WalletLookupInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return `Invalid lookup_wallet_activity input: ${parsed.error.message}`;
  }
  const { address, role } = parsed.data;

  if (!isLoanRegistryDeployed()) {
    return "AcorisLoanRegistry is not deployed in this environment (NEXT_PUBLIC_LOAN_REGISTRY_ADDRESS is unset) — on-chain lookups aren't available right now. Say so plainly rather than guessing at the wallet's history.";
  }
  if (LOAN_REGISTRY_DEPLOY_BLOCK === undefined) {
    return "LOAN_REGISTRY_DEPLOY_BLOCK is not configured — on-chain lookups aren't available right now. Say so plainly rather than guessing at the wallet's history.";
  }

  const provider = new JsonRpcProvider(CC3_TESTNET_RPC_HTTP);
  try {
    const timelines = await fetchOnChainLoanHistory(provider, LOAN_REGISTRY_ADDRESS as string, address, LOAN_REGISTRY_DEPLOY_BLOCK, role);
    const dtos: LoanTimelineDto[] = timelines.map((t) => ({
      loanHash: t.loanHash,
      borrower: t.borrower,
      lender: t.lender,
      principalWei: t.principal.toString(),
      collateralWei: t.collateral.toString(),
      aprBps: t.aprBps,
      durationSeconds: t.durationSeconds,
      proposedAt: t.proposedAt,
      proposeTxHash: t.proposeTxHash,
      fundedAt: t.fundedAt,
      dueAt: t.dueAt,
      repaidAt: t.repaidAt,
      repayTxHash: t.repayTxHash,
      defaultedAt: t.defaultedAt,
      onTime: t.onTime,
      outcome: t.outcome,
    }));
    return summarizeWalletActivity(address, role, dtos);
  } catch (err) {
    return `Failed to read on-chain history: ${err instanceof Error ? err.message : String(err)}. Tell the user this lookup failed rather than guessing at their history.`;
  } finally {
    provider.destroy();
  }
}

function buildSystemPrompt(connectedAddress: string | null): string {
  return [
    "You are Acoris AI, the help assistant embedded in Acoris — an AI-negotiated DeFi lending protocol on Creditcoin",
    "CC3 Testnet where loan terms are priced only on financial history that has been cryptographically verified.",
    "You are NOT the Borrower AI or Lender AI that negotiate real deals on /negotiation and /marketplace — you never",
    "propose loan terms, never negotiate, and never write on-chain state. Your job is to explain the protocol",
    "accurately and, when asked about a wallet's own history, answer from real data via the lookup_wallet_activity",
    "tool rather than guessing.",
    "",
    "Core facts about Acoris, all real and checkable in the repository:",
    "- Evidence-only pricing: a Verified Financial Profile is always 'not-available', 'unverified', or 'verified'.",
    "  An unverified, self-reported claim is priced exactly like no evidence at all, by construction — never better.",
    "  Only 'verified' evidence (proven via Attestcoin cross-chain verification from Sepolia, or read natively from",
    "  AcorisLoanRegistry's own event log on CC3) is allowed to improve pricing.",
    "- Risk discount formula: countScore = min(verifiedRepaymentCount / 5, 1); reliabilityScore = 1 -",
    "  (failedRepaymentCount / totalRepayments); riskDiscount = countScore * reliabilityScore, clamped to [0, 1].",
    "  0 means baseline pricing, 1 means a lender's best-case pricing. This is the exact formula the app runs — not",
    "  an approximation — but you only know a specific wallet's real counts by calling lookup_wallet_activity.",
    "- The negotiation engine: a Borrower AI and Lender AI exchange OFFER / COUNTER / ACCEPT / REJECT rounds. Both",
    "  models only ever propose — a separate deterministic layer clamps every proposal to hard constraints",
    "  (borrower: maxApr, minAmount, maxCollateral, duration bounds; lender: minApr, maxAmount, minCollateralRatio,",
    "  maxDurationDays) before it becomes an official round. The AI is never trusted to enforce its own limits.",
    "- AcorisLoanRegistry (the on-chain contract): proposeAgreement escrows collateral and sets status Proposed;",
    "  fundAgreement (lender only, on-chain enforced) forwards principal and sets Funded; repay (borrower only)",
    "  pays principal + simple interest and returns collateral, sets Repaid; markDefaulted (lender only, after the",
    "  due date) seizes collateral, sets Defaulted; cancelProposal (borrower only, while still Proposed) refunds",
    "  collateral. Interest = principal * aprBps * durationSeconds / (365 days * 10000).",
    "- Discovery: proposing an agreement writes it on-chain and gives the borrower a shareable link",
    "  (/agreement?loanHash=...) — nothing is emailed or pushed automatically. The Portfolio page's live count badge",
    "  is Acoris's only 'notification', built from a periodic read of the AgreementProposed event log.",
    "",
    "Ground rules:",
    "- Never invent a number — an APR, a balance, a count, a transaction hash. If you don't know it and can't look",
    "  it up, say so plainly and point to the right page (/credit-profile, /negotiation, /marketplace, /dashboard,",
    "  /agreement, /underwriting, /improve, /attestcoin) instead of guessing.",
    "- This is Creditcoin CC3 Testnet — no real funds are ever involved. Say so if asked about real money at stake.",
    "- Keep answers concise and concrete. Prefer real terms of art (Verified Financial Profile, risk discount,",
    "  negotiation round, evidence mode) over vague language.",
    connectedAddress
      ? `- The user's connected wallet address is ${connectedAddress}. Use it as the default address for` +
        " lookup_wallet_activity when they ask about 'my' loans, without asking them to repeat it."
      : "- No wallet is currently connected. If the user asks about 'my' loans or their own history, tell them to" +
        " connect a wallet first (top right of any page) rather than guessing an address.",
  ].join("\n");
}

export type ChatStreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; name: string; input: unknown }
  | { type: "done" }
  | { type: "error"; error: string; code?: string };

/**
 * Runs one Acoris AI turn — a manual streaming tool-use loop (see
 * shared/tool-use-concepts.md's Streaming Manual Loop pattern) — and
 * invokes `emit` for each event as it happens. Throws AIUnavailableError
 * (never a silent fake response) if ANTHROPIC_API_KEY isn't configured or
 * the call fails outright.
 */
export async function runChatTurn(
  history: ChatMessage[],
  connectedAddress: string | null,
  emit: (event: ChatStreamEvent) => void,
): Promise<void> {
  if (!isAIConfigured()) {
    throw new AIUnavailableError("ANTHROPIC_API_KEY is not configured on the server — Acoris AI cannot run.");
  }
  const client = new Anthropic();

  let messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));

  try {
    const MAX_ITERATIONS = 6;
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: 4096,
        system: buildSystemPrompt(connectedAddress),
        tools: [WALLET_LOOKUP_TOOL],
        messages,
      });

      stream.on("text", (delta) => emit({ type: "text", text: delta }));

      const message = await stream.finalMessage();

      if (message.stop_reason === "pause_turn") {
        messages = [...messages, { role: "assistant", content: message.content }];
        continue;
      }

      const toolUseBlocks = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

      if (toolUseBlocks.length === 0) {
        return;
      }

      messages = [...messages, { role: "assistant", content: message.content }];

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tool of toolUseBlocks) {
        emit({ type: "tool_call", name: tool.name, input: tool.input });
        const result = tool.name === "lookup_wallet_activity" ? await runWalletLookup(tool.input) : `Unknown tool: ${tool.name}`;
        toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: result });
      }

      messages = [...messages, { role: "user", content: toolResults }];
    }
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

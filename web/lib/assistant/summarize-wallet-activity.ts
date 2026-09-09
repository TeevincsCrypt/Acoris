/**
 * Turns a wallet's real AcorisLoanRegistry timelines (lib/dashboard.ts /
 * lib/negotiation/onchain-history.ts) into a compact, plain-text digest fed
 * back to Claude as a tool result in Acoris AI (lib/assistant/chat-agent.ts).
 *
 * Pure — no network, no wall-clock reads. The chat model never sees raw
 * timelines; it only ever sees this digest, so every number in an assistant
 * answer about "my loans" traces directly to a real on-chain event rather
 * than something the model inferred or guessed.
 */

import { formatEther } from "ethers";

import type { LoanTimelineDto } from "@/lib/dashboard";

const OUTCOME_LABEL: Record<LoanTimelineDto["outcome"], string> = {
  pending: "pending (proposed, not yet funded)",
  funded: "funded (active)",
  repaid: "repaid",
  defaulted: "defaulted",
  cancelled: "cancelled",
};

export function summarizeWalletActivity(address: string, role: "borrower" | "lender", timelines: LoanTimelineDto[]): string {
  if (timelines.length === 0) {
    return `${address} has no AcorisLoanRegistry history as ${role} on Creditcoin CC3 Testnet — no agreements found.`;
  }

  const lines = timelines.map((t) => {
    const parts = [
      `- loanHash ${t.loanHash}`,
      `${formatEther(t.principalWei)} tCTC principal`,
      `${(t.aprBps / 100).toFixed(2)}% APR`,
      `collateral ${formatEther(t.collateralWei)} tCTC`,
      `status: ${OUTCOME_LABEL[t.outcome]}`,
    ];
    if (t.outcome === "funded" && t.dueAt !== null) {
      parts.push(`due at unix ${t.dueAt}`);
    }
    if (t.onTime !== null) {
      parts.push(t.onTime ? "repaid on time" : "repaid late");
    }
    return parts.join(", ");
  });

  const counts = timelines.reduce<Record<string, number>>((acc, t) => {
    acc[t.outcome] = (acc[t.outcome] ?? 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts)
    .map(([outcome, count]) => `${count} ${outcome}`)
    .join(", ");

  return [
    `${address}'s real AcorisLoanRegistry history as ${role} (${timelines.length} agreement${timelines.length === 1 ? "" : "s"} total — ${summary}):`,
    ...lines,
  ].join("\n");
}

/**
 * Pure aggregation over a borrower's real on-chain loan timelines (see
 * lib/negotiation/onchain-history.ts) — no network, no wall-clock reads
 * except where `now` is passed in explicitly. Used by both
 * app/api/dashboard/route.ts (to serialize LoanTimeline -> DTO) and
 * components/dashboard/DashboardPanel.tsx (to turn DTOs into the stats,
 * active-loan progress, and activity feed the /dashboard page renders).
 *
 * Every number here is derived directly from real AcorisLoanRegistry
 * events — there is no invented "reputation score" or synthetic activity.
 */

import type { LoanOutcome } from "./negotiation/onchain-history";

/** JSON-serializable form of LoanTimeline — bigints become decimal strings. */
export interface LoanTimelineDto {
  loanHash: string;
  borrower: string;
  lender: string;
  principalWei: string;
  collateralWei: string;
  aprBps: number;
  durationSeconds: number;
  proposedAt: number;
  proposeTxHash: string;
  fundedAt: number | null;
  dueAt: number | null;
  repaidAt: number | null;
  repayTxHash: string | null;
  defaultedAt: number | null;
  onTime: boolean | null;
  outcome: LoanOutcome;
}

export interface DashboardStats {
  /** Sum of principal across every agreement this borrower has ever proposed, regardless of outcome. */
  totalCreditActivityWei: bigint;
  activeLoans: number;
  repaidCount: number;
  defaultedCount: number;
  cancelledCount: number;
  pendingCount: number;
}

export function computeDashboardStats(timelines: LoanTimelineDto[]): DashboardStats {
  const stats: DashboardStats = {
    totalCreditActivityWei: BigInt(0),
    activeLoans: 0,
    repaidCount: 0,
    defaultedCount: 0,
    cancelledCount: 0,
    pendingCount: 0,
  };
  for (const t of timelines) {
    stats.totalCreditActivityWei += BigInt(t.principalWei);
    if (t.outcome === "funded") stats.activeLoans++;
    else if (t.outcome === "repaid") stats.repaidCount++;
    else if (t.outcome === "defaulted") stats.defaultedCount++;
    else if (t.outcome === "cancelled") stats.cancelledCount++;
    else if (t.outcome === "pending") stats.pendingCount++;
  }
  return stats;
}

export interface ActiveLoanView {
  loanHash: string;
  principalWei: string;
  aprBps: number;
  fundedAt: number;
  dueAt: number;
  /** 0-100, clamped, based on elapsed time between fundedAt and dueAt. */
  progressPercent: number;
  /** Negative once past the due date. */
  daysRemaining: number;
  isOverdue: boolean;
}

/** Every currently-funded (active/outstanding) loan for this borrower, as of `nowSeconds`. */
export function computeActiveLoans(timelines: LoanTimelineDto[], nowSeconds: number): ActiveLoanView[] {
  return timelines
    .filter((t): t is LoanTimelineDto & { fundedAt: number; dueAt: number } => t.outcome === "funded" && t.fundedAt !== null && t.dueAt !== null)
    .map((t) => {
      const total = t.dueAt - t.fundedAt;
      const elapsed = nowSeconds - t.fundedAt;
      const progressPercent = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 100;
      const daysRemaining = Math.ceil((t.dueAt - nowSeconds) / 86400);
      return {
        loanHash: t.loanHash,
        principalWei: t.principalWei,
        aprBps: t.aprBps,
        fundedAt: t.fundedAt,
        dueAt: t.dueAt,
        progressPercent,
        daysRemaining,
        isOverdue: nowSeconds > t.dueAt,
      };
    });
}

export type ActivityEventType = "proposed" | "funded" | "repaid" | "defaulted" | "cancelled";

export interface ActivityEvent {
  type: ActivityEventType;
  loanHash: string;
  timestamp: number;
  txHash: string;
}

/** Every real event across all timelines, most recent first. */
export function buildActivityFeed(timelines: LoanTimelineDto[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  for (const t of timelines) {
    events.push({ type: "proposed", loanHash: t.loanHash, timestamp: t.proposedAt, txHash: t.proposeTxHash });
    if (t.fundedAt !== null) {
      events.push({ type: "funded", loanHash: t.loanHash, timestamp: t.fundedAt, txHash: t.proposeTxHash });
    }
    if (t.repaidAt !== null && t.repayTxHash !== null) {
      events.push({ type: "repaid", loanHash: t.loanHash, timestamp: t.repaidAt, txHash: t.repayTxHash });
    }
    if (t.defaultedAt !== null) {
      events.push({ type: "defaulted", loanHash: t.loanHash, timestamp: t.defaultedAt, txHash: t.proposeTxHash });
    }
    if (t.outcome === "cancelled") {
      events.push({ type: "cancelled", loanHash: t.loanHash, timestamp: t.proposedAt, txHash: t.proposeTxHash });
    }
  }
  return events.sort((a, b) => b.timestamp - a.timestamp);
}

/** "2h ago", "3d ago", "just now" — relative to nowSeconds, real timestamps only. */
export function timeAgo(timestampSeconds: number, nowSeconds: number): string {
  const diff = Math.max(0, nowSeconds - timestampSeconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

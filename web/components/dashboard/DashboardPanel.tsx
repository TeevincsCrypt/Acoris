"use client";

import { useEffect, useState } from "react";
import { formatEther } from "ethers";

import { isLoanRegistryDeployed } from "@/lib/loan-contract";
import { useWallet } from "@/lib/wallet-context";
import {
  buildActivityFeed,
  computeActiveLoans,
  computeDashboardStats,
  timeAgo,
  type LoanTimelineDto,
} from "@/lib/dashboard";
import { CC3_TESTNET_EXPLORER } from "@/lib/creditcoin";

interface DashboardApiError {
  error: string;
}

const ACTIVITY_LABEL: Record<string, string> = {
  proposed: "Agreement created",
  funded: "Loan funded",
  repaid: "Loan repaid",
  defaulted: "Loan defaulted",
  cancelled: "Proposal cancelled",
};

/**
 * A borrower's portfolio, built entirely from real AcorisLoanRegistry
 * events for their connected wallet — every stat, every activity entry,
 * and every progress bar is a genuine on-chain read (lib/dashboard.ts is
 * pure aggregation over that real data). No synthetic "reputation score",
 * no placeholder activity: zero real loans means zero shown, not a demo
 * fixture.
 */
export function DashboardPanel() {
  const wallet = useWallet();
  const [timelines, setTimelines] = useState<LoanTimelineDto[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<DashboardApiError | null>(null);
  const deployed = isLoanRegistryDeployed();

  useEffect(() => {
    if (!deployed || wallet.status !== "connected" || !wallet.address) return;
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/dashboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ borrowerAddress: wallet.address }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data as DashboardApiError);
        } else {
          setTimelines((data as { timelines: LoanTimelineDto[] }).timelines);
          setFetchedAt(Math.floor(Date.now() / 1000));
        }
      } catch (err) {
        if (!cancelled) setError({ error: err instanceof Error ? err.message : "Request failed" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deployed, wallet.status, wallet.address]);

  if (!deployed) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        AcorisLoanRegistry is not deployed on CC3 Testnet in this environment — the dashboard has nothing to read
        yet. See docs/ACORIS_LOAN_CONTRACT.md.
      </p>
    );
  }

  if (wallet.status !== "connected") {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400">
        Connect a wallet on CC3 Testnet to see your real loan portfolio.
      </p>
    );
  }

  if (loading) {
    return <p className="text-sm text-zinc-400 dark:text-zinc-600">Reading your loan history from CC3 Testnet…</p>;
  }

  if (error) {
    return (
      <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error.error}</p>
    );
  }

  if (!timelines || fetchedAt === null) return null;

  const now = fetchedAt;
  const stats = computeDashboardStats(timelines);
  const activeLoans = computeActiveLoans(timelines, now);
  const activity = buildActivityFeed(timelines);

  if (timelines.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No AcorisLoanRegistry activity found yet for {wallet.address}. Propose an agreement from a negotiated deal
        to start building real history.
      </p>
    );
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      {/* Summary stats */}
      <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <p className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {formatEther(stats.totalCreditActivityWei)} tCTC
        </p>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-600">
          Total credit activity (all proposed principal)
        </p>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Active loans" value={stats.activeLoans} />
          <Stat label="Repaid" value={stats.repaidCount} />
          <Stat label="Defaulted" value={stats.defaultedCount} />
          <Stat label="Cancelled" value={stats.cancelledCount} />
        </div>
      </section>

      {/* Active loans */}
      {activeLoans.length > 0 && (
        <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Active Loan{activeLoans.length > 1 ? "s" : ""}
          </h2>
          <div className="mt-4 space-y-4">
            {activeLoans.map((loan) => (
              <div key={loan.loanHash} className="rounded-lg border border-black/5 p-4 dark:border-white/5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                    {formatEther(loan.principalWei)} tCTC
                  </span>
                  <span className="font-mono text-sm text-zinc-500 dark:text-zinc-400">
                    {(loan.aprBps / 100).toFixed(2)}% APR
                  </span>
                </div>
                <p
                  className={`mt-1 text-xs font-semibold uppercase tracking-wide ${loan.isOverdue ? "text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"}`}
                >
                  {loan.isOverdue ? `${Math.abs(loan.daysRemaining)} days overdue` : `${loan.daysRemaining} days remaining`}
                </p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className={`h-full rounded-full ${loan.isOverdue ? "bg-red-500" : "bg-black dark:bg-white"}`}
                    style={{ width: `${loan.progressPercent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Activity feed */}
      <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Activity</h2>
        <ol className="mt-4 space-y-2">
          {activity.map((e, i) => (
            <li key={`${e.loanHash}-${e.type}-${i}`} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-zinc-700 dark:text-zinc-300">
                <span className="mr-1.5 text-emerald-600 dark:text-emerald-400">✓</span>
                {ACTIVITY_LABEL[e.type] ?? e.type}
              </span>
              <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-600">
                <a
                  href={`${CC3_TESTNET_EXPLORER}/tx/${e.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mr-2 font-mono underline decoration-zinc-300 hover:decoration-zinc-500 dark:decoration-zinc-700"
                  title={e.txHash}
                >
                  {e.txHash.slice(0, 10)}…
                </a>
                {timeAgo(e.timestamp, now)}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-zinc-400 dark:text-zinc-600">{label}</p>
    </div>
  );
}

"use client";

import { useState } from "react";

import { EXAMPLE_SEPOLIA_TX_HASH } from "@/lib/attestcoin";
import type {
  AgentRole,
  FinancialProfileStatus,
  LoanRequest,
  NegotiationRound,
  LoanTerms,
  VerifiedFinancialProfile,
} from "@/lib/negotiation/types";

import { ExecuteOnCreditcoin } from "./ExecuteOnCreditcoin";

type EvidenceMode = "none" | "unverified" | "verify";

interface NegotiationApiResult {
  negotiationId: string;
  rounds: NegotiationRound[];
  finalTerms: LoanTerms;
  financialProfileUsed: VerifiedFinancialProfile;
}

interface NegotiationApiError {
  error: string;
  code?: string;
}

const DEFAULT_LOAN_REQUEST: LoanRequest = {
  amount: 10000,
  collateralValue: 17000,
  durationDays: 30,
  maxApr: 9,
};

function ProfileStatusBadge({ status }: { status: FinancialProfileStatus }) {
  const styles: Record<FinancialProfileStatus, string> = {
    verified: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    unverified: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    "not-available": "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  };
  const labels: Record<FinancialProfileStatus, string> = {
    verified: "VERIFIED",
    unverified: "UNVERIFIED",
    "not-available": "NOT AVAILABLE",
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}>{labels[status]}</span>;
}

function ActionBadge({ action }: { action: NegotiationRound["action"] }) {
  const styles: Record<NegotiationRound["action"], string> = {
    OFFER: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    COUNTER: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    ACCEPT: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    REJECT: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styles[action]}`}>{action}</span>;
}

function agentLabel(agent: AgentRole): string {
  return agent === "borrower" ? "Borrower AI" : "Lender AI";
}

export function NegotiationConsole() {
  const [loanRequest, setLoanRequest] = useState<LoanRequest>(DEFAULT_LOAN_REQUEST);
  const [evidenceMode, setEvidenceMode] = useState<EvidenceMode>("verify");
  const [txHash, setTxHash] = useState(EXAMPLE_SEPOLIA_TX_HASH);
  const [claimedSummary, setClaimedSummary] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<NegotiationApiError | null>(null);
  const [result, setResult] = useState<NegotiationApiResult | null>(null);
  const [visibleRounds, setVisibleRounds] = useState(0);

  async function startNegotiation() {
    setLoading(true);
    setError(null);
    setResult(null);
    setVisibleRounds(0);

    const financialEvidence =
      evidenceMode === "verify"
        ? { mode: "verify" as const, transactionHashes: [txHash.trim()] }
        : evidenceMode === "unverified"
          ? { mode: "unverified" as const, claimedSummary: claimedSummary.trim() || undefined }
          : { mode: "none" as const };

    try {
      const res = await fetch("/api/negotiation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanRequest, financialEvidence }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data as NegotiationApiError);
        setLoading(false);
        return;
      }

      const negotiation = data as NegotiationApiResult;
      setResult(negotiation);
      setLoading(false);
      revealRounds(negotiation.rounds.length);
    } catch (err) {
      setError({ error: err instanceof Error ? err.message : "Request failed" });
      setLoading(false);
    }
  }

  function revealRounds(total: number) {
    let shown = 0;
    const interval = setInterval(() => {
      shown += 1;
      setVisibleRounds(shown);
      if (shown >= total) clearInterval(interval);
    }, 500);
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      {/* Borrow Request */}
      <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Borrow Request
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <Field label="Amount" value={loanRequest.amount} onChange={(v) => setLoanRequest({ ...loanRequest, amount: v })} />
          <Field
            label="Collateral"
            value={loanRequest.collateralValue}
            onChange={(v) => setLoanRequest({ ...loanRequest, collateralValue: v })}
          />
          <Field
            label="Duration (days)"
            value={loanRequest.durationDays}
            onChange={(v) => setLoanRequest({ ...loanRequest, durationDays: v })}
          />
          <Field
            label="Maximum APR (%)"
            value={loanRequest.maxApr}
            onChange={(v) => setLoanRequest({ ...loanRequest, maxApr: v })}
          />
        </div>
      </section>

      {/* Verified Credit */}
      <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Verified Credit
        </h2>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Only genuinely Attestcoin-verified evidence is ever priced as verified history. A
          self-reported claim never counts as verified.
        </p>
        <div className="mt-3 flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={evidenceMode === "verify"} onChange={() => setEvidenceMode("verify")} />
            Verify a real Sepolia repayment transaction
          </label>
          {evidenceMode === "verify" && (
            <input
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
              className="ml-6 rounded-lg border border-black/10 bg-transparent px-3 py-1.5 font-mono text-xs dark:border-white/10"
              placeholder="0x… Sepolia transaction hash"
            />
          )}
          <label className="flex items-center gap-2">
            <input type="radio" checked={evidenceMode === "unverified"} onChange={() => setEvidenceMode("unverified")} />
            Self-reported claim only (not verified)
          </label>
          {evidenceMode === "unverified" && (
            <input
              value={claimedSummary}
              onChange={(e) => setClaimedSummary(e.target.value)}
              className="ml-6 rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-xs dark:border-white/10"
              placeholder="e.g. I've repaid loans before (unverified)"
            />
          )}
          <label className="flex items-center gap-2">
            <input type="radio" checked={evidenceMode === "none"} onChange={() => setEvidenceMode("none")} />
            No financial evidence
          </label>
        </div>

        {result && (
          <div className="mt-4 flex items-center gap-3">
            <ProfileStatusBadge status={result.financialProfileUsed.status} />
            {result.financialProfileUsed.status === "verified" && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {result.financialProfileUsed.verifiedRepaymentCount} verified repayment(s), most recent:{" "}
                {result.financialProfileUsed.mostRecentVerifiedActivity}
              </span>
            )}
          </div>
        )}
      </section>

      <button
        onClick={startNegotiation}
        disabled={loading}
        className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        {loading ? "Negotiating…" : "Start AI Negotiation"}
      </button>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <p className="font-semibold">
            {error.code === "ai-unavailable" ? "AI negotiation is unavailable" : "Negotiation failed"}
          </p>
          <p className="mt-1">{error.error}</p>
        </div>
      )}

      {/* AI Negotiation */}
      {result && (
        <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            AI Negotiation
          </h2>
          <ol className="mt-4 space-y-3">
            {result.rounds.slice(0, visibleRounds).map((round) => (
              <li key={round.round} className="rounded-lg border border-black/5 p-3 text-sm dark:border-white/5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    Round {round.round} — {agentLabel(round.agent)}
                  </span>
                  <ActionBadge action={round.action} />
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <span>Amount: {round.amount}</span>
                  <span>Collateral: {round.collateral}</span>
                  <span>APR: {round.apr}%</span>
                  <span>Duration: {round.durationDays}d</span>
                </div>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{round.reasoning}</p>
                {round.wasClamped && (
                  <p className="mt-1 text-xs italic text-amber-600 dark:text-amber-400">
                    Adjusted by deterministic constraint enforcement before being recorded.
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Final Agreement */}
      {result && visibleRounds >= result.rounds.length && (
        <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Final Agreement
          </h2>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Loan amount" value={String(result.finalTerms.amount)} />
            <Row label="Collateral" value={String(result.finalTerms.collateral)} />
            <Row label="APR" value={`${result.finalTerms.apr}%`} />
            <Row label="Duration" value={`${result.finalTerms.duration} days`} />
            <Row label="Negotiation rounds" value={String(result.rounds.length)} />
            <Row label="Verified evidence used" value={result.financialProfileUsed.status.toUpperCase()} />
            <Row label="Agreement status" value={result.finalTerms.status.toUpperCase()} />
          </dl>

          <ExecuteOnCreditcoin negotiationId={result.negotiationId} finalTerms={result.finalTerms} />
        </section>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm dark:border-white/10"
      />
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="font-mono text-zinc-900 dark:text-zinc-100">{value}</dd>
    </div>
  );
}

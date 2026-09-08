"use client";

import { useState } from "react";

import { buildFinancialEvidence, canResolveEvidence, EvidenceModeSelector, type EvidenceMode } from "@/components/credit/EvidenceModeSelector";
import { FinancialProfileSummary } from "@/components/credit/FinancialProfileSummary";
import { EXAMPLE_SEPOLIA_TX_HASH } from "@/lib/attestcoin";
import { LENDER_PERSONAS } from "@/lib/negotiation/constraints";
import type { UnderwritingReport } from "@/lib/negotiation/underwrite";
import type { LoanRequest, VerifiedFinancialProfile } from "@/lib/negotiation/types";

interface UnderwritingApiResult {
  report: UnderwritingReport;
  financialProfileUsed: VerifiedFinancialProfile;
}

interface UnderwritingApiError {
  error: string;
}

const DEFAULT_LOAN_REQUEST: LoanRequest = {
  amount: 10000,
  collateralValue: 17000,
  durationDays: 30,
  maxApr: 9,
};

export function UnderwritingPanel() {
  const [loanRequest, setLoanRequest] = useState<LoanRequest>(DEFAULT_LOAN_REQUEST);
  const [lenderPersonaId, setLenderPersonaId] = useState<string>("");
  const [evidenceMode, setEvidenceMode] = useState<EvidenceMode>("verify");
  const [txHashes, setTxHashes] = useState<string[]>([EXAMPLE_SEPOLIA_TX_HASH]);
  const [claimedSummary, setClaimedSummary] = useState("");
  const [borrowerAddress, setBorrowerAddress] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UnderwritingApiError | null>(null);
  const [result, setResult] = useState<UnderwritingApiResult | null>(null);

  async function runUnderwriting() {
    setLoading(true);
    setError(null);
    setResult(null);

    const financialEvidence = buildFinancialEvidence({ mode: evidenceMode, txHashes, claimedSummary, borrowerAddress });

    try {
      const res = await fetch("/api/underwriting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanRequest, financialEvidence, lenderPersonaId: lenderPersonaId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data as UnderwritingApiError);
        return;
      }
      setResult(data as UnderwritingApiResult);
    } catch (err) {
      setError({ error: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setLoading(false);
    }
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
        <div className="mt-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Lender policy</span>
            <select
              value={lenderPersonaId}
              onChange={(e) => setLenderPersonaId(e.target.value)}
              className="rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm dark:border-white/10"
            >
              <option value="">Default lender policy</option>
              {LENDER_PERSONAS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.style})
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* Evidence */}
      <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Evidence
        </h2>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          The same evidence a lender would actually price against — nothing is assumed or guessed.
        </p>
        <div className="mt-3">
          <EvidenceModeSelector
            mode={evidenceMode}
            onModeChange={setEvidenceMode}
            txHashes={txHashes}
            onTxHashesChange={setTxHashes}
            claimedSummary={claimedSummary}
            onClaimedSummaryChange={setClaimedSummary}
            borrowerAddress={borrowerAddress}
            onBorrowerAddressChange={setBorrowerAddress}
          />
        </div>
        {result && (
          <div className="mt-4 border-t border-black/5 pt-4 dark:border-white/5">
            <FinancialProfileSummary profile={result.financialProfileUsed} />
          </div>
        )}
      </section>

      <button
        onClick={runUnderwriting}
        disabled={loading || !canResolveEvidence({ mode: evidenceMode, borrowerAddress })}
        className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        {loading ? "Underwriting…" : "Run Underwriting"}
      </button>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <p className="font-semibold">Underwriting failed</p>
          <p className="mt-1">{error.error}</p>
        </div>
      )}

      {result && (
        <>
          {/* Risk assessment */}
          <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Risk Assessment — {result.report.policyName}
            </h2>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              This is not an AI-generated prediction. It&apos;s the exact deterministic formula that governs real
              pricing in this protocol — a real, reproducible number, never an invented confidence score.
            </p>

            <div className="mt-4 flex items-center gap-4">
              <div className="flex-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${Math.round(result.report.riskDiscount * 100)}%` }}
                  />
                </div>
              </div>
              <span className="whitespace-nowrap font-mono text-sm text-zinc-900 dark:text-zinc-100">
                Risk discount: {(result.report.riskDiscount * 100).toFixed(0)}%
              </span>
            </div>

            {result.report.scoreBreakdown && (
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-zinc-500 dark:text-zinc-400">Count score</dt>
                  <dd className="font-mono text-zinc-900 dark:text-zinc-100">
                    {result.report.scoreBreakdown.countScore.toFixed(2)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500 dark:text-zinc-400">Reliability score</dt>
                  <dd className="font-mono text-zinc-900 dark:text-zinc-100">
                    {result.report.scoreBreakdown.reliabilityScore.toFixed(2)}
                  </dd>
                </div>
              </dl>
            )}
          </section>

          {/* Underwriting decision */}
          <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Underwriting Decision
            </h2>
            <dl className="mt-4 space-y-2 text-sm">
              <Row label="Minimum APR this lender would require" value={`${result.report.constraints.minApr.toFixed(2)}%`} />
              <Row label="Minimum collateral ratio" value={result.report.constraints.minCollateralRatio.toFixed(3)} />
              <Row label="Maximum loan amount" value={String(result.report.constraints.maxAmount)} />
              <Row label="Maximum duration" value={`${result.report.constraints.maxDurationDays} days`} />
            </dl>
          </section>

          {/* Reasoning */}
          <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Why
            </h2>
            <ol className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
              {result.report.reasoning.map((line, i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 font-mono text-zinc-400 dark:text-zinc-600">{i + 1}.</span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </section>
        </>
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

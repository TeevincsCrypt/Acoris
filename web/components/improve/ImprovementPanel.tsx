"use client";

import { useState } from "react";

import { buildFinancialEvidence, canResolveEvidence, EvidenceModeSelector, type EvidenceMode } from "@/components/credit/EvidenceModeSelector";
import { FinancialProfileSummary } from "@/components/credit/FinancialProfileSummary";
import { EXAMPLE_SEPOLIA_TX_HASH } from "@/lib/attestcoin";
import { LENDER_PERSONAS } from "@/lib/negotiation/constraints";
import type { ImprovementSuggestion } from "@/lib/negotiation/improve";
import type { LoanRequest, VerifiedFinancialProfile } from "@/lib/negotiation/types";

interface ImprovementApiResult {
  suggestions: ImprovementSuggestion[];
  financialProfileUsed: VerifiedFinancialProfile;
}

interface ImprovementApiError {
  error: string;
}

const DEFAULT_LOAN_REQUEST: LoanRequest = {
  amount: 10000,
  collateralValue: 17000,
  durationDays: 30,
  maxApr: 9,
};

export function ImprovementPanel() {
  const [loanRequest, setLoanRequest] = useState<LoanRequest>(DEFAULT_LOAN_REQUEST);
  const [lenderPersonaId, setLenderPersonaId] = useState<string>("");
  const [evidenceMode, setEvidenceMode] = useState<EvidenceMode>("verify");
  const [txHashes, setTxHashes] = useState<string[]>([EXAMPLE_SEPOLIA_TX_HASH]);
  const [claimedSummary, setClaimedSummary] = useState("");
  const [borrowerAddress, setBorrowerAddress] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ImprovementApiError | null>(null);
  const [result, setResult] = useState<ImprovementApiResult | null>(null);

  async function runSimulation() {
    setLoading(true);
    setError(null);
    setResult(null);

    const financialEvidence = buildFinancialEvidence({ mode: evidenceMode, txHashes, claimedSummary, borrowerAddress });

    try {
      const res = await fetch("/api/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanRequest, financialEvidence, lenderPersonaId: lenderPersonaId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data as ImprovementApiError);
        return;
      }
      setResult(data as ImprovementApiResult);
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
          Your Current Evidence
        </h2>
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
        onClick={runSimulation}
        disabled={loading || !canResolveEvidence({ mode: evidenceMode, borrowerAddress })}
        className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        {loading ? "Simulating…" : "How Can I Get Better Terms?"}
      </button>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <p className="font-semibold">Simulation failed</p>
          <p className="mt-1">{error.error}</p>
        </div>
      )}

      {result && (
        <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Suggestions
          </h2>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Every projected number below is computed by this protocol&apos;s real, unmodified pricing formula against
            a concrete hypothetical — never an invented future rate.
          </p>
          <div className="mt-4 flex flex-col gap-4">
            {result.suggestions.map((s, i) => (
              <div key={i} className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">{s.title}</p>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{s.detail}</p>
                {s.projected && (
                  <div className="mt-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
                    <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{s.projected.hypothesis}</p>
                    <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <ProjectedRow label="Risk discount" value={`${(s.projected.riskDiscount * 100).toFixed(0)}%`} />
                      <ProjectedRow label="Min APR" value={`${s.projected.constraints.minApr.toFixed(2)}%`} />
                      <ProjectedRow label="Min collateral ratio" value={s.projected.constraints.minCollateralRatio.toFixed(3)} />
                      <ProjectedRow label="Max amount" value={String(s.projected.constraints.maxAmount)} />
                    </dl>
                  </div>
                )}
              </div>
            ))}
          </div>
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

function ProjectedRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="font-mono text-zinc-900 dark:text-zinc-100">{value}</dd>
    </div>
  );
}

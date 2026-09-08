"use client";

import { useState } from "react";

import { EXAMPLE_SEPOLIA_TX_HASH } from "@/lib/attestcoin";
import type { VerifiedFinancialProfile } from "@/lib/negotiation/types";

import { buildFinancialEvidence, canResolveEvidence, EvidenceModeSelector, type EvidenceMode } from "./EvidenceModeSelector";
import { FinancialProfileSummary } from "./FinancialProfileSummary";

interface CreditProfileApiError {
  error: string;
}

/**
 * Standalone "build your credit profile" flow — the same real evidence
 * resolution the negotiation engine uses (server-side, independently
 * re-verified), but without running a negotiation. Lets a borrower see
 * exactly what evidence they can bring to a negotiation before starting
 * one.
 */
export function CreditProfilePanel() {
  const [mode, setMode] = useState<EvidenceMode>("verify");
  const [txHashes, setTxHashes] = useState<string[]>([EXAMPLE_SEPOLIA_TX_HASH]);
  const [claimedSummary, setClaimedSummary] = useState("");
  const [borrowerAddress, setBorrowerAddress] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<CreditProfileApiError | null>(null);
  const [profile, setProfile] = useState<VerifiedFinancialProfile | null>(null);

  async function buildProfile() {
    setLoading(true);
    setError(null);
    setProfile(null);

    const financialEvidence = buildFinancialEvidence({ mode, txHashes, claimedSummary, borrowerAddress });

    try {
      const res = await fetch("/api/credit-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ financialEvidence }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data as CreditProfileApiError);
      } else {
        setProfile((data as { profile: VerifiedFinancialProfile }).profile);
      }
    } catch (err) {
      setError({ error: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <section className="acoris-card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Bring Evidence
        </h2>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Choose what to verify. The server independently re-verifies everything below — nothing you submit here is
          trusted as-is.
        </p>
        <div className="mt-3">
          <EvidenceModeSelector
            mode={mode}
            onModeChange={setMode}
            txHashes={txHashes}
            onTxHashesChange={setTxHashes}
            claimedSummary={claimedSummary}
            onClaimedSummaryChange={setClaimedSummary}
            borrowerAddress={borrowerAddress}
            onBorrowerAddressChange={setBorrowerAddress}
          />
        </div>
        <button
          onClick={buildProfile}
          disabled={loading || !canResolveEvidence({ mode, borrowerAddress })}
          className="mt-4 w-full rounded-lg bg-indigo-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-deep disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {loading ? "Verifying evidence…" : "Build Credit Profile"}
        </button>
        {error && (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            {error.error}
          </p>
        )}
      </section>

      {profile && (
        <section className="acoris-card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Acoris Credit Profile
          </h2>
          <div className="mt-4">
            <FinancialProfileSummary profile={profile} />
          </div>
        </section>
      )}

      {profile && (
        <section className="acoris-card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Next Steps
          </h2>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            This evidence isn&apos;t stored here — bring the same evidence mode and inputs to any of these to act on
            it.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <a
              href="/underwriting"
              className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-center text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              See how a lender would price this →
            </a>
            <a
              href="/marketplace"
              className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-center text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Compare lender offers →
            </a>
            <a
              href="/improve"
              className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-center text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              How can I get better terms? →
            </a>
            <a
              href="/negotiation"
              className="flex-1 rounded-lg bg-indigo-ink px-3 py-2 text-center text-xs font-medium text-white transition hover:bg-indigo-deep dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Start a negotiation →
            </a>
          </div>
        </section>
      )}
    </div>
  );
}

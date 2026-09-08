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
      <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
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
          className="mt-4 w-full rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
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
        <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Acoris Credit Profile
          </h2>
          <div className="mt-4">
            <FinancialProfileSummary profile={profile} />
          </div>
        </section>
      )}
    </div>
  );
}

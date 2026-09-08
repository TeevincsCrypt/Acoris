"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { buildFinancialEvidence, canResolveEvidence, EvidenceModeSelector, type EvidenceMode } from "@/components/credit/EvidenceModeSelector";
import { FinancialProfileSummary } from "@/components/credit/FinancialProfileSummary";
import { EXAMPLE_SEPOLIA_TX_HASH } from "@/lib/attestcoin";
import type { LenderOffer } from "@/lib/negotiation/marketplace-compare";
import type { LoanRequest, VerifiedFinancialProfile } from "@/lib/negotiation/types";

interface MarketplaceApiResult {
  offers: LenderOffer[];
  financialProfileUsed: VerifiedFinancialProfile;
  chosen: LenderOffer | null;
  chosenReasoning: string;
}

interface MarketplaceApiError {
  error: string;
  code?: string;
}

const DEFAULT_LOAN_REQUEST: LoanRequest = {
  amount: 10000,
  collateralValue: 17000,
  durationDays: 30,
  maxApr: 9,
};

export function MarketplacePanel() {
  const router = useRouter();

  const [loanRequest, setLoanRequest] = useState<LoanRequest>(DEFAULT_LOAN_REQUEST);
  const [evidenceMode, setEvidenceMode] = useState<EvidenceMode>("verify");
  const [txHashes, setTxHashes] = useState<string[]>([EXAMPLE_SEPOLIA_TX_HASH]);
  const [claimedSummary, setClaimedSummary] = useState("");
  const [borrowerAddress, setBorrowerAddress] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<MarketplaceApiError | null>(null);
  const [result, setResult] = useState<MarketplaceApiResult | null>(null);

  async function getOffers() {
    setLoading(true);
    setError(null);
    setResult(null);

    const financialEvidence = buildFinancialEvidence({ mode: evidenceMode, txHashes, claimedSummary, borrowerAddress });

    try {
      const res = await fetch("/api/marketplace/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanRequest, financialEvidence }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data as MarketplaceApiError);
        return;
      }
      setResult(data as MarketplaceApiResult);
    } catch (err) {
      setError({ error: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setLoading(false);
    }
  }

  function continueToNegotiation(personaId: string) {
    const params = new URLSearchParams({
      lenderPersonaId: personaId,
      amount: String(loanRequest.amount),
      collateralValue: String(loanRequest.collateralValue),
      durationDays: String(loanRequest.durationDays),
      maxApr: String(loanRequest.maxApr),
    });
    router.push(`/negotiation?${params.toString()}`);
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      {/* Borrow Request */}
      <section className="acoris-card p-6">
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
      <section className="acoris-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Verified Credit
          </h2>
          <a
            href="/credit-profile"
            className="text-xs text-zinc-400 underline hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200"
          >
            Build a credit profile first →
          </a>
        </div>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          The same verified evidence is priced independently by all three lenders below. A self-reported claim never
          counts as verified.
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
        onClick={getOffers}
        disabled={loading || !canResolveEvidence({ mode: evidenceMode, borrowerAddress })}
        className="rounded-lg bg-indigo-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-deep disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        {loading ? "Comparing lenders…" : "Get Offers"}
      </button>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <p className="font-semibold">
            {error.code === "ai-unavailable" ? "AI negotiation is unavailable" : "Failed to get lender offers"}
          </p>
          <p className="mt-1">{error.error}</p>
        </div>
      )}

      {/* Offers */}
      {result && (
        <section className="acoris-card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Lender Offers
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Three independent lenders, each with a different risk posture, priced this same request in a real,
            separate AI call.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {result.offers.map((offer) => {
              const isChosen = result.chosen?.personaId === offer.personaId;
              return (
                <div
                  key={offer.personaId}
                  className={`flex flex-col gap-2 rounded-lg border p-4 text-sm ${
                    isChosen
                      ? "border-emerald-500/40 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/30"
                      : "border-black/10 dark:border-white/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100">{offer.personaName}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{offer.personaStyle}</p>
                    </div>
                    {isChosen && (
                      <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                        Strong Match
                      </span>
                    )}
                  </div>
                  <dl className="mt-1 space-y-1 text-xs">
                    <OfferRow label="APR" value={`${offer.apr}%`} />
                    <OfferRow label="Amount" value={String(offer.amount)} />
                    <OfferRow label="Collateral" value={String(offer.collateral)} />
                    <OfferRow label="Duration" value={`${offer.durationDays}d`} />
                  </dl>
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{offer.reasoning}</p>
                  {offer.wasClamped && (
                    <p className="text-[11px] italic text-amber-700 dark:text-amber-400">
                      Adjusted by deterministic constraint enforcement.
                    </p>
                  )}
                  <button
                    onClick={() => continueToNegotiation(offer.personaId)}
                    className="mt-2 rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Negotiate with {offer.personaName}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-lg bg-zinc-50 p-4 text-sm dark:bg-zinc-800">
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">
              Comparing {result.offers.length} offers
              {result.chosen ? ` — Best match: ${result.chosen.personaName}` : " — no affordable match"}
            </p>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{result.chosenReasoning}</p>
            {result.chosen && (
              <button
                onClick={() => continueToNegotiation(result.chosen!.personaId)}
                className="mt-3 rounded-lg bg-indigo-ink px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-deep dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Continue to Negotiation with {result.chosen.personaName}
              </button>
            )}
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

function OfferRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="font-mono text-zinc-900 dark:text-zinc-100">{value}</dd>
    </div>
  );
}

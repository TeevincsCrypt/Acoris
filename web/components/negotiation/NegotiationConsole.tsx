"use client";

import { useState } from "react";

import { EXAMPLE_SEPOLIA_TX_HASH } from "@/lib/attestcoin";
import type {
  AgentRole,
  BorrowerConstraints,
  LenderConstraints,
  LoanRequest,
  NegotiationRound,
  LoanTerms,
  VerifiedFinancialProfile,
} from "@/lib/negotiation/types";

import { buildFinancialEvidence, canResolveEvidence, EvidenceModeSelector, type EvidenceMode } from "@/components/credit/EvidenceModeSelector";
import { FinancialProfileSummary } from "@/components/credit/FinancialProfileSummary";
import { explainNegotiation } from "@/lib/negotiation/explain";
import { estimateTotalRepayment } from "@/lib/loan-contract";
import { ExecuteOnCreditcoin } from "./ExecuteOnCreditcoin";

interface NegotiationApiResult {
  negotiationId: string;
  rounds: NegotiationRound[];
  finalTerms: LoanTerms;
  financialProfileUsed: VerifiedFinancialProfile;
  borrowerConstraints: BorrowerConstraints;
  lenderConstraints: LenderConstraints;
}

interface NegotiationApiError {
  error: string;
  code?: string;
}

type StreamMessage =
  | { type: "round"; round: NegotiationRound }
  | { type: "complete"; result: NegotiationApiResult }
  | { type: "error"; error: string; code?: string };

const DEFAULT_LOAN_REQUEST: LoanRequest = {
  amount: 10000,
  collateralValue: 17000,
  durationDays: 30,
  maxApr: 9,
};

const ACTION_STYLES: Record<NegotiationRound["action"], string> = {
  OFFER: "border-blue-500/30 bg-blue-50 dark:bg-blue-950/40",
  COUNTER: "border-amber-500/30 bg-amber-50 dark:bg-amber-950/40",
  ACCEPT: "border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40",
  REJECT: "border-red-500/30 bg-red-50 dark:bg-red-950/40",
};

function ActionBadge({ action }: { action: NegotiationRound["action"] }) {
  const styles: Record<NegotiationRound["action"], string> = {
    OFFER: "bg-blue-600 text-white",
    COUNTER: "bg-amber-600 text-white",
    ACCEPT: "bg-emerald-600 text-white",
    REJECT: "bg-red-600 text-white",
  };
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ${styles[action]}`}>{action}</span>;
}

function agentLabel(agent: AgentRole): string {
  return agent === "borrower" ? "Borrower AI" : "Lender AI";
}

export function NegotiationConsole() {
  const [loanRequest, setLoanRequest] = useState<LoanRequest>(DEFAULT_LOAN_REQUEST);
  const [evidenceMode, setEvidenceMode] = useState<EvidenceMode>("verify");
  const [txHashes, setTxHashes] = useState<string[]>([EXAMPLE_SEPOLIA_TX_HASH]);
  const [claimedSummary, setClaimedSummary] = useState("");
  const [borrowerAddress, setBorrowerAddress] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<NegotiationApiError | null>(null);
  const [rounds, setRounds] = useState<NegotiationRound[]>([]);
  const [result, setResult] = useState<NegotiationApiResult | null>(null);

  async function startNegotiation() {
    setLoading(true);
    setError(null);
    setResult(null);
    setRounds([]);

    const financialEvidence = buildFinancialEvidence({ mode: evidenceMode, txHashes, claimedSummary, borrowerAddress });

    try {
      const res = await fetch("/api/negotiation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanRequest, financialEvidence }),
      });

      // Pre-flight failures (validation, evidence resolution, AI not
      // configured) come back as a single plain JSON error response — never
      // as a stream. A successful run streams newline-delimited JSON.
      if (!res.ok) {
        const data = (await res.json()) as NegotiationApiError;
        setError(data);
        setLoading(false);
        return;
      }

      if (!res.body) {
        setError({ error: "Server did not return a response body" });
        setLoading(false);
        return;
      }

      await consumeNegotiationStream(res.body, {
        onRound: (round) => setRounds((prev) => [...prev, round]),
        onComplete: (r) => {
          setResult(r);
          setLoading(false);
        },
        onError: (err) => {
          setError(err);
          setLoading(false);
        },
      });
    } catch (err) {
      setError({ error: err instanceof Error ? err.message : "Request failed" });
      setLoading(false);
    }
  }

  const explanation = result
    ? explainNegotiation({
        finalTerms: result.finalTerms,
        borrowerConstraints: result.borrowerConstraints,
        lenderConstraints: result.lenderConstraints,
        financialProfileUsed: result.financialProfileUsed,
        rounds: result.rounds,
      })
    : null;

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
          Only genuinely verified evidence is ever priced as verified history. A self-reported claim never counts as
          verified.
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
        onClick={startNegotiation}
        disabled={loading || !canResolveEvidence({ mode: evidenceMode, borrowerAddress })}
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

      {/* AI Negotiation — a visual flow of structured events, rounds appended live as they stream in */}
      {rounds.length > 0 && (
        <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            AI Negotiation
          </h2>
          <div className="mt-4 flex flex-col items-stretch">
            {rounds.map((round, i) => (
              <div key={round.round} className="flex flex-col items-center">
                {i > 0 && <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700" aria-hidden />}
                <div className={`w-full rounded-lg border p-3 text-sm ${ACTION_STYLES[round.action]}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Round {round.round} · {agentLabel(round.agent)}
                    </span>
                    <ActionBadge action={round.action} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-700 dark:text-zinc-300 sm:grid-cols-4">
                    <span>
                      <span className="text-zinc-500 dark:text-zinc-400">Principal</span> {round.amount}
                    </span>
                    <span>
                      <span className="text-zinc-500 dark:text-zinc-400">Collateral</span> {round.collateral}
                    </span>
                    <span>
                      <span className="text-zinc-500 dark:text-zinc-400">APR</span> {round.apr}%
                    </span>
                    <span>
                      <span className="text-zinc-500 dark:text-zinc-400">Duration</span> {round.durationDays}d
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{round.reasoning}</p>
                  {round.wasClamped && (
                    <p className="mt-1 text-xs italic text-amber-700 dark:text-amber-400">
                      Adjusted by deterministic constraint enforcement before being recorded.
                    </p>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <>
                <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700" aria-hidden />
                <div className="w-full rounded-lg border border-dashed border-black/10 p-3 text-center text-xs text-zinc-400 dark:border-white/10 dark:text-zinc-600">
                  Waiting for the next round…
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* Why these terms */}
      {result && explanation && explanation.terms.length > 0 && (
        <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Why you received these terms
          </h2>
          <dl className="mt-4 space-y-4">
            {explanation.terms.map((t) => (
              <div key={t.field}>
                <div className="flex items-baseline justify-between">
                  <dt className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t.label}</dt>
                  <dd className="font-mono text-sm text-zinc-900 dark:text-zinc-100">{t.value}</dd>
                </div>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{t.reason}</p>
              </div>
            ))}
          </dl>
          {explanation.decidingRoundReasoning && (
            <p className="mt-4 rounded-lg bg-zinc-50 p-3 text-xs italic text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              &ldquo;{explanation.decidingRoundReasoning}&rdquo;
            </p>
          )}
        </section>
      )}

      {/* Final Agreement */}
      {result && (
        <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Final Agreement
            </h2>
            {result.finalTerms.status === "accepted" && (
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                Negotiated · not yet on-chain
              </span>
            )}
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Borrower" value="Connected wallet (proposes below)" />
            <Row label="Lender" value="Named at execution time" />
            <Row label="Loan amount (principal)" value={String(result.finalTerms.amount)} />
            <Row label="Collateral" value={String(result.finalTerms.collateral)} />
            <Row label="APR" value={`${result.finalTerms.apr}%`} />
            <Row label="Duration" value={`${result.finalTerms.duration} days`} />
            {result.finalTerms.status === "accepted" && (
              <>
                <Row
                  label="Estimated interest"
                  value={(estimateTotalRepayment(result.finalTerms.amount, result.finalTerms.apr, result.finalTerms.duration) - result.finalTerms.amount).toFixed(6)}
                />
                <Row
                  label="Estimated total repayment"
                  value={estimateTotalRepayment(result.finalTerms.amount, result.finalTerms.apr, result.finalTerms.duration).toFixed(6)}
                />
              </>
            )}
            <Row label="Negotiation rounds" value={String(result.rounds.length)} />
            <Row label="Verified evidence used" value={result.financialProfileUsed.status.toUpperCase()} />
            <Row label="Agreement status" value={result.finalTerms.status.toUpperCase()} />
          </dl>
          {result.finalTerms.status === "accepted" && (
            <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-600">
              Interest and total repayment are estimates using the same simple-interest formula the on-chain
              contract uses — once proposed and funded, the real contract-confirmed amount is shown below instead.
            </p>
          )}

          <ExecuteOnCreditcoin negotiationId={result.negotiationId} finalTerms={result.finalTerms} />
        </section>
      )}
    </div>
  );
}

/**
 * Reads the response body as newline-delimited JSON, dispatching each
 * decoded message as it arrives — this is the genuine live stream, not a
 * client-side reveal timer over an already-complete result.
 */
async function consumeNegotiationStream(
  body: ReadableStream<Uint8Array>,
  handlers: {
    onRound: (round: NegotiationRound) => void;
    onComplete: (result: NegotiationApiResult) => void;
    onError: (error: NegotiationApiError) => void;
  },
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  function handleLine(line: string) {
    if (!line.trim()) return;
    const msg = JSON.parse(line) as StreamMessage;
    if (msg.type === "round") handlers.onRound(msg.round);
    else if (msg.type === "complete") handlers.onComplete(msg.result);
    else if (msg.type === "error") handlers.onError({ error: msg.error, code: msg.code });
  }

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) handleLine(line);
  }
  if (buffer.trim()) handleLine(buffer);
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

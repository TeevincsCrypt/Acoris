"use client";

import { useState } from "react";

import { EXAMPLE_SEPOLIA_TX_HASH } from "@/lib/attestcoin";
import { isLoanRegistryDeployed } from "@/lib/loan-contract";
import { useWallet } from "@/lib/wallet-context";
import type {
  AgentRole,
  FinancialProfileStatus,
  LoanRequest,
  NegotiationRound,
  LoanTerms,
  VerifiedFinancialProfile,
} from "@/lib/negotiation/types";

import { ExecuteOnCreditcoin } from "./ExecuteOnCreditcoin";

type EvidenceMode = "none" | "unverified" | "verify" | "onchain";
const MAX_TX_HASHES = 10;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

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

function canStartNegotiation(input: {
  evidenceMode: EvidenceMode;
  borrowerAddress: string;
  isLoanRegistryDeployed: boolean;
}): boolean {
  if (input.evidenceMode !== "onchain") return true;
  return input.isLoanRegistryDeployed && ADDRESS_PATTERN.test(input.borrowerAddress.trim());
}

export function NegotiationConsole() {
  const wallet = useWallet();
  const [loanRequest, setLoanRequest] = useState<LoanRequest>(DEFAULT_LOAN_REQUEST);
  const [evidenceMode, setEvidenceMode] = useState<EvidenceMode>("verify");
  const [txHashes, setTxHashes] = useState<string[]>([EXAMPLE_SEPOLIA_TX_HASH]);
  const [claimedSummary, setClaimedSummary] = useState("");
  const [borrowerAddress, setBorrowerAddress] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<NegotiationApiError | null>(null);
  const [rounds, setRounds] = useState<NegotiationRound[]>([]);
  const [result, setResult] = useState<NegotiationApiResult | null>(null);

  function updateTxHash(index: number, value: string) {
    setTxHashes((prev) => prev.map((h, i) => (i === index ? value : h)));
  }
  function addTxHashField() {
    setTxHashes((prev) => (prev.length >= MAX_TX_HASHES ? prev : [...prev, ""]));
  }
  function removeTxHashField(index: number) {
    setTxHashes((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function startNegotiation() {
    setLoading(true);
    setError(null);
    setResult(null);
    setRounds([]);

    const financialEvidence =
      evidenceMode === "verify"
        ? { mode: "verify" as const, transactionHashes: txHashes.map((h) => h.trim()).filter((h) => h.length > 0) }
        : evidenceMode === "unverified"
          ? { mode: "unverified" as const, claimedSummary: claimedSummary.trim() || undefined }
          : evidenceMode === "onchain"
            ? { mode: "onchain" as const, borrowerAddress: borrowerAddress.trim() }
            : { mode: "none" as const };

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
          Only genuinely verified evidence is ever priced as verified history. A self-reported claim never counts as
          verified.
        </p>
        <div className="mt-3 flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={evidenceMode === "verify"} onChange={() => setEvidenceMode("verify")} />
            Verify real Sepolia repayment transaction(s) via Attestcoin
          </label>
          {evidenceMode === "verify" && (
            <div className="ml-6 flex flex-col gap-1.5">
              {txHashes.map((hash, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={hash}
                    onChange={(e) => updateTxHash(i, e.target.value)}
                    className="flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-1.5 font-mono text-xs dark:border-white/10"
                    placeholder="0x… Sepolia transaction hash"
                  />
                  {txHashes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTxHashField(i)}
                      className="text-xs text-zinc-400 hover:text-red-500"
                      aria-label="Remove transaction hash"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {txHashes.length < MAX_TX_HASHES && (
                <button
                  type="button"
                  onClick={addTxHashField}
                  className="self-start text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  + Add another transaction
                </button>
              )}
            </div>
          )}

          <label className="flex items-center gap-2">
            <input type="radio" checked={evidenceMode === "onchain"} onChange={() => setEvidenceMode("onchain")} />
            Use native CC3 on-chain loan history (AcorisLoanRegistry)
          </label>
          {evidenceMode === "onchain" && (
            <div className="ml-6 flex flex-col gap-1.5">
              {!isLoanRegistryDeployed() ? (
                <p className="text-xs text-zinc-400 dark:text-zinc-600">
                  AcorisLoanRegistry is not deployed on CC3 Testnet in this environment (see
                  docs/ACORIS_LOAN_CONTRACT.md) — this evidence source has nothing to read yet.
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <input
                      value={borrowerAddress}
                      onChange={(e) => setBorrowerAddress(e.target.value)}
                      className="flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-1.5 font-mono text-xs dark:border-white/10"
                      placeholder="0x… borrower wallet address"
                    />
                    {wallet.status === "connected" && wallet.address && (
                      <button
                        type="button"
                        onClick={() => setBorrowerAddress(wallet.address as string)}
                        className="whitespace-nowrap text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                      >
                        Use connected wallet
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Reads this borrower&apos;s repaid/defaulted agreements directly from CC3 Testnet — due dates and
                    on-time repayment are computed from real on-chain timestamps, not just one transaction.
                  </p>
                </>
              )}
            </div>
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
                {result.financialProfileUsed.onTimeRepaymentRate !== null &&
                  ` — ${Math.round(result.financialProfileUsed.onTimeRepaymentRate * 100)}% on time`}
              </span>
            )}
          </div>
        )}
      </section>

      <button
        onClick={startNegotiation}
        disabled={loading || !canStartNegotiation({ evidenceMode, borrowerAddress, isLoanRegistryDeployed: isLoanRegistryDeployed() })}
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

      {/* AI Negotiation — rounds are appended live as they stream in */}
      {rounds.length > 0 && (
        <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            AI Negotiation
          </h2>
          <ol className="mt-4 space-y-3">
            {rounds.map((round) => (
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
            {loading && (
              <li className="rounded-lg border border-dashed border-black/10 p-3 text-xs text-zinc-400 dark:border-white/10 dark:text-zinc-600">
                Waiting for the next round…
              </li>
            )}
          </ol>
        </section>
      )}

      {/* Final Agreement */}
      {result && (
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

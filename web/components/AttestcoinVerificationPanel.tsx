"use client";

import { useState } from "react";

import { EXAMPLE_SEPOLIA_TX_HASH } from "@/lib/attestcoin";

interface VerifiedRepayLoanFact {
  kind: string;
  transactionStatus: "success" | "failed";
  transactionFrom: string;
  transactionTo: string;
  loanEvent: { contract: string; loanHash: string; lender: string; borrower: string; amountWei: string };
  transferEvent: { contract: string; from: string; to: string; valueWei: string };
}

interface VerificationResult {
  stage: string;
  ok: boolean;
  networkBlocked: boolean;
  error?: string;
  transactionHash: string;
  sourceChain?: { chainKey: number; chainId: number; chainName: string };
  sourceBlockHeight?: number;
  attested?: boolean;
  proofVerified?: boolean;
  proof?: { headerNumber: number; txIndex: number; cached: boolean; generatedAt: string };
  fact?: VerifiedRepayLoanFact;
}

const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

function StatusMark({ state }: { state: "pending" | "yes" | "no" }) {
  if (state === "pending") return <span className="text-zinc-400 dark:text-zinc-600">…</span>;
  if (state === "yes") return <span className="text-emerald-600 dark:text-emerald-400">✓</span>;
  return <span className="text-red-600 dark:text-red-400">✗</span>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-black/5 py-2.5 text-sm last:border-0 dark:border-white/5">
      <span className="shrink-0 font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="min-w-0 break-all text-right font-mono text-xs text-zinc-900 dark:text-zinc-100">{children}</span>
    </div>
  );
}

export function AttestcoinVerificationPanel() {
  const [txHash, setTxHash] = useState(EXAMPLE_SEPOLIA_TX_HASH);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);

  async function runVerification() {
    if (!TX_HASH_PATTERN.test(txHash.trim())) {
      setInputError("Enter a 0x-prefixed, 32-byte transaction hash.");
      return;
    }
    setInputError(null);
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/attestcoin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: txHash.trim() }),
      });
      const data = (await res.json()) as VerificationResult;
      setResult(data);
    } catch (err) {
      setResult({
        stage: "resolving-source-chain",
        ok: false,
        networkBlocked: false,
        transactionHash: txHash.trim(),
        error: err instanceof Error ? err.message : "Request to /api/attestcoin/verify failed",
      });
    } finally {
      setLoading(false);
    }
  }

  const attestedState: "pending" | "yes" | "no" =
    result?.attested === undefined ? "pending" : result.attested ? "yes" : "no";
  const verifiedState: "pending" | "yes" | "no" =
    result?.proofVerified === undefined ? "pending" : result.proofVerified ? "yes" : "no";

  const proofMoment: "idle" | "verifying" | "verified" | "failed" = loading
    ? "verifying"
    : result
      ? result.ok && result.proofVerified
        ? "verified"
        : "failed"
      : "idle";

  return (
    <div className="w-full max-w-2xl rounded-xl border border-black/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Attestcoin Verification
      </h2>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Verifies a real Sepolia transaction on CC3 Testnet via @gluwa/usc-sdk&apos;s BlockProver
        precompile, then extracts a structured fact with QueryBuilder. Nothing here is simulated —
        every stage below is a genuine network call.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={txHash}
          onChange={(e) => setTxHash(e.target.value)}
          placeholder="0x… Sepolia transaction hash"
          className="min-w-0 flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-2 font-mono text-xs text-zinc-900 outline-none focus:border-black/30 dark:border-white/10 dark:text-zinc-100 dark:focus:border-white/30"
        />
        <button
          onClick={runVerification}
          disabled={loading}
          className="shrink-0 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {loading ? "Verifying…" : "Verify"}
        </button>
      </div>
      {inputError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{inputError}</p>}
      <button
        onClick={() => setTxHash(EXAMPLE_SEPOLIA_TX_HASH)}
        className="mt-1 text-xs text-zinc-400 underline hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
      >
        Reset to example transaction
      </button>

      {proofMoment === "verifying" && (
        <div className="mt-5 flex items-center gap-3 rounded-lg border border-blue-500/20 bg-blue-50 p-4 dark:border-blue-400/20 dark:bg-blue-950">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
          </span>
          <p className="text-sm font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">
            Verifying cross-chain evidence…
          </p>
        </div>
      )}

      {proofMoment === "verified" && (
        <div className="mt-5 rounded-lg border border-emerald-600/20 bg-emerald-50 p-4 text-center dark:border-emerald-400/20 dark:bg-emerald-950">
          <p className="text-base font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Cryptographic proof verified ✓
          </p>
          <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">
            Independently proven on Creditcoin CC3 Testnet via the BlockProver precompile — not because a hash was
            supplied, because the proof actually checked out.
          </p>
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <Row label="Source Chain">{result.sourceChain?.chainName ?? "sepolia"}</Row>
          <Row label="Source Transaction">{result.transactionHash}</Row>
          <Row label="Source Block">{result.sourceBlockHeight ?? "—"}</Row>
          <Row label="Attested">
            <StatusMark state={attestedState} />
          </Row>
          <Row label="Proof Verified by CC3">
            <StatusMark state={verifiedState} />
          </Row>
          <Row label="Verified Fact">
            {result.fact ? (
              <span className="block text-left">
                Wallet {result.fact.transactionFrom} repaid loan {result.fact.loanEvent.loanHash.slice(0, 10)}… to
                lender {result.fact.loanEvent.lender.slice(0, 10)}…, transferring {result.fact.transferEvent.valueWei}{" "}
                wei of token {result.fact.transferEvent.contract.slice(0, 10)}… on Sepolia at block{" "}
                {result.sourceBlockHeight}.
              </span>
            ) : (
              "—"
            )}
          </Row>

          {!result.ok && (
            <div
              className={`mt-3 rounded-lg p-3 text-xs ${
                result.networkBlocked
                  ? "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                  : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
              }`}
            >
              <p className="text-sm font-bold uppercase tracking-wide">
                {result.networkBlocked ? "Verification blocked" : "Verification failed"}
              </p>
              <p className="mt-1 font-semibold">
                Stopped at stage: <span className="font-mono">{result.stage}</span>
                {result.networkBlocked ? " — looks like a network/connectivity block, not a proof failure." : ""}
              </p>
              {result.error && <p className="mt-1 break-all font-mono">{result.error}</p>}
            </div>
          )}

          {result.proof && (
            <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
              Proof header #{result.proof.headerNumber}, tx index {result.proof.txIndex}
              {result.proof.cached ? " (cached)" : ""}, generated {result.proof.generatedAt}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

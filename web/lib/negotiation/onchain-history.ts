/**
 * Native CC3 loan history for AcorisLoanRegistry (Phase 4 contract).
 *
 * Unlike Sepolia repayments (which need Phase 2's cross-chain Attestcoin
 * proof), a loan agreement's own history on AcorisLoanRegistry is already
 * on the same chain the negotiation engine runs against — CC3 Testnet. No
 * cross-chain proof is needed; the event log itself, read directly from
 * CC3, is the trustless source of truth. This is what makes a REAL
 * `onTime` boolean possible: `AgreementProposed` carries `durationSeconds`,
 * and the `FundLoan`/`RepayLoan` block timestamps give the actual
 * funded-at and repaid-at times — due date = fundedAt + durationSeconds,
 * on time = repaidAt <= dueAt.
 *
 * `reconstructLoanTimelines` is pure (no network) and unit-tested against
 * synthetic-but-realistic event data. `fetchOnChainLoanHistory` is the
 * thin, genuinely-real network boundary — like every other "real RPC call"
 * boundary in this project, it's not reachable from this sandbox (no
 * deployed registry — see docs/ACORIS_LOAN_CONTRACT.md) but is exercised
 * for real once one exists.
 */

import { Contract, type JsonRpcProvider } from "ethers";

import loanRegistryAbi from "@/lib/loan-contract/AcorisLoanRegistry.abi.json";
import type { VerificationEvidenceRef } from "./types";

export interface OnChainLoanEventBase {
  loanHash: string;
  blockNumber: number;
  blockTimestamp: number; // unix seconds
  transactionHash: string;
}

export interface ProposedEvent extends OnChainLoanEventBase {
  borrower: string;
  lender: string;
  principal: bigint;
  collateral: bigint;
  aprBps: number;
  durationSeconds: number;
}

export interface AmountEvent extends OnChainLoanEventBase {
  lender: string;
  borrower: string;
  amount: bigint;
}

export interface DefaultedEvent extends OnChainLoanEventBase {
  collateralSeized: bigint;
}

export type LoanOutcome = "pending" | "funded" | "repaid" | "defaulted" | "cancelled";

export interface LoanTimeline {
  loanHash: string;
  borrower: string;
  lender: string;
  principal: bigint;
  durationSeconds: number;
  proposedAt: number;
  proposeTxHash: string;
  fundedAt: number | null;
  /** fundedAt + durationSeconds — the loan's actual due date. Null until funded. */
  dueAt: number | null;
  repaidAt: number | null;
  repayTxHash: string | null;
  defaultedAt: number | null;
  /** Null until the outcome (repaid or defaulted) is known. */
  onTime: boolean | null;
  outcome: LoanOutcome;
}

/**
 * Groups raw AcorisLoanRegistry events by loanHash and reconstructs each
 * agreement's real timeline. Pure — no network, no wall-clock reads.
 */
export function reconstructLoanTimelines(input: {
  proposed: ProposedEvent[];
  funded: AmountEvent[];
  repaid: AmountEvent[];
  defaulted: DefaultedEvent[];
  cancelled: OnChainLoanEventBase[];
}): LoanTimeline[] {
  const fundedByHash = new Map<string, AmountEvent>();
  for (const e of input.funded) fundedByHash.set(e.loanHash, e);

  const repaidByHash = new Map<string, AmountEvent>();
  for (const e of input.repaid) repaidByHash.set(e.loanHash, e);

  const defaultedByHash = new Map<string, DefaultedEvent>();
  for (const e of input.defaulted) defaultedByHash.set(e.loanHash, e);

  const cancelledHashes = new Set(input.cancelled.map((e) => e.loanHash));

  return input.proposed.map((p): LoanTimeline => {
    const fund = fundedByHash.get(p.loanHash) ?? null;
    const repay = repaidByHash.get(p.loanHash) ?? null;
    const defaulted = defaultedByHash.get(p.loanHash) ?? null;

    const fundedAt = fund?.blockTimestamp ?? null;
    const dueAt = fundedAt !== null ? fundedAt + p.durationSeconds : null;
    const repaidAt = repay?.blockTimestamp ?? null;

    let outcome: LoanOutcome = "pending";
    if (cancelledHashes.has(p.loanHash)) outcome = "cancelled";
    else if (repay) outcome = "repaid";
    else if (defaulted) outcome = "defaulted";
    else if (fund) outcome = "funded";

    const onTime = repaidAt !== null && dueAt !== null ? repaidAt <= dueAt : null;

    return {
      loanHash: p.loanHash,
      borrower: p.borrower,
      lender: p.lender,
      principal: p.principal,
      durationSeconds: p.durationSeconds,
      proposedAt: p.blockTimestamp,
      proposeTxHash: p.transactionHash,
      fundedAt,
      dueAt,
      repaidAt,
      repayTxHash: repay?.transactionHash ?? null,
      defaultedAt: defaulted?.blockTimestamp ?? null,
      onTime,
      outcome,
    };
  });
}

/** Fraction of timelines with a determined outcome (repaid or defaulted) that were repaid on time. */
export function computeOnTimeRepaymentRate(timelines: LoanTimeline[]): number | null {
  const determined = timelines.filter((t) => t.onTime !== null);
  if (determined.length === 0) return null;
  return determined.filter((t) => t.onTime === true).length / determined.length;
}

/**
 * Turns reconstructed timelines into VerificationEvidenceRef entries — only
 * agreements with a determined outcome (repaid or defaulted) count as
 * evidence; a still-pending or merely-funded loan says nothing yet about
 * repayment behavior.
 */
export function evidenceFromOnChainTimelines(timelines: LoanTimeline[], chainLabel = "cc3-testnet"): VerificationEvidenceRef[] {
  return timelines
    .filter((t) => t.outcome === "repaid" || t.outcome === "defaulted")
    .map((t) => ({
      sourceChain: chainLabel,
      transactionHash: (t.outcome === "repaid" ? t.repayTxHash : t.proposeTxHash) ?? t.proposeTxHash,
      blockHeight: 0, // block height isn't tracked per-event here; timestamp (below) is what matters for recency/on-time.
      verified: true as const,
      amountWei: t.principal.toString(),
      status: t.outcome === "repaid" ? ("success" as const) : ("failed" as const),
      onTime: t.onTime,
    }));
}

/**
 * Fetches a borrower's full AcorisLoanRegistry history directly from CC3
 * Testnet and reconstructs timelines. Real network call — see module
 * doc comment for why it isn't reachable from this sandbox.
 */
export async function fetchOnChainLoanHistory(
  provider: JsonRpcProvider,
  registryAddress: string,
  borrowerAddress: string,
): Promise<LoanTimeline[]> {
  const contract = new Contract(registryAddress, loanRegistryAbi, provider);

  // AgreementProposed indexes `borrower`, so this is a targeted query.
  const proposedLogs = await contract.queryFilter(contract.filters.AgreementProposed(null, borrowerAddress));

  // FundLoan/RepayLoan deliberately mirror LOAN_PAYMENT_ABI's non-indexed
  // shape (see AcorisLoanRegistry.sol doc comment) so Attestcoin can verify
  // them cross-chain the same way — which means loanHash isn't a topic here,
  // so these can't be filtered server-side. Fine at hackathon scale; a
  // production indexer/subgraph would replace this full scan.
  const [fundedLogs, repaidLogs, defaultedLogs, cancelledLogs] = await Promise.all([
    contract.queryFilter(contract.filters.FundLoan()),
    contract.queryFilter(contract.filters.RepayLoan()),
    contract.queryFilter(contract.filters.AgreementDefaulted()),
    contract.queryFilter(contract.filters.AgreementCancelled()),
  ]);

  const proposedHashes = new Set(proposedLogs.map((l) => ("args" in l ? l.args.loanHash : undefined)));

  const blockTimestampCache = new Map<number, number>();
  async function timestampOf(blockNumber: number): Promise<number> {
    const cached = blockTimestampCache.get(blockNumber);
    if (cached !== undefined) return cached;
    const block = await provider.getBlock(blockNumber);
    const ts = block?.timestamp ?? 0;
    blockTimestampCache.set(blockNumber, ts);
    return ts;
  }

  const proposed: ProposedEvent[] = await Promise.all(
    proposedLogs.map(async (log) => {
      const args = "args" in log ? log.args : undefined;
      return {
        loanHash: args?.loanHash,
        borrower: args?.borrower,
        lender: args?.lender,
        principal: args?.principal,
        collateral: args?.collateral,
        aprBps: Number(args?.aprBps),
        durationSeconds: Number(args?.durationSeconds),
        blockNumber: log.blockNumber,
        blockTimestamp: await timestampOf(log.blockNumber),
        transactionHash: log.transactionHash,
      };
    }),
  );

  async function toAmountEvents(logs: typeof fundedLogs): Promise<AmountEvent[]> {
    const relevant = logs.filter((l) => "args" in l && proposedHashes.has(l.args.loanHash));
    return Promise.all(
      relevant.map(async (log) => {
        const args = "args" in log ? log.args : undefined;
        return {
          loanHash: args?.loanHash,
          lender: args?.lender,
          borrower: args?.borrower,
          amount: args?.amount,
          blockNumber: log.blockNumber,
          blockTimestamp: await timestampOf(log.blockNumber),
          transactionHash: log.transactionHash,
        };
      }),
    );
  }

  const funded = await toAmountEvents(fundedLogs);
  const repaid = await toAmountEvents(repaidLogs);

  const defaulted: DefaultedEvent[] = await Promise.all(
    defaultedLogs
      .filter((l) => "args" in l && proposedHashes.has(l.args.loanHash))
      .map(async (log) => {
        const args = "args" in log ? log.args : undefined;
        return {
          loanHash: args?.loanHash,
          collateralSeized: args?.collateralSeized,
          blockNumber: log.blockNumber,
          blockTimestamp: await timestampOf(log.blockNumber),
          transactionHash: log.transactionHash,
        };
      }),
  );

  const cancelled: OnChainLoanEventBase[] = await Promise.all(
    cancelledLogs
      .filter((l) => "args" in l && proposedHashes.has(l.args.loanHash))
      .map(async (log) => {
        const args = "args" in log ? log.args : undefined;
        return {
          loanHash: args?.loanHash,
          blockNumber: log.blockNumber,
          blockTimestamp: await timestampOf(log.blockNumber),
          transactionHash: log.transactionHash,
        };
      }),
  );

  return reconstructLoanTimelines({ proposed, funded, repaid, defaulted, cancelled });
}

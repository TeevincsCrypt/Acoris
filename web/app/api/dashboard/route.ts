import { JsonRpcProvider } from "ethers";
import { z } from "zod";

import { CC3_TESTNET_RPC_HTTP } from "@/lib/creditcoin";
import { isLoanRegistryDeployed, LOAN_REGISTRY_ADDRESS } from "@/lib/loan-contract";
import type { LoanTimelineDto } from "@/lib/dashboard";
import { fetchOnChainLoanHistory, LOAN_REGISTRY_DEPLOY_BLOCK, type LoanTimeline } from "@/lib/negotiation/onchain-history";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

const RequestSchema = z.object({
  address: z.string().regex(ADDRESS_PATTERN),
  /** Which side of AgreementProposed to query by — defaults to "borrower" (this route's original, only behavior). */
  role: z.enum(["borrower", "lender"]).optional().default("borrower"),
});

function toDto(t: LoanTimeline): LoanTimelineDto {
  return {
    loanHash: t.loanHash,
    borrower: t.borrower,
    lender: t.lender,
    principalWei: t.principal.toString(),
    collateralWei: t.collateral.toString(),
    aprBps: t.aprBps,
    durationSeconds: t.durationSeconds,
    proposedAt: t.proposedAt,
    proposeTxHash: t.proposeTxHash,
    fundedAt: t.fundedAt,
    dueAt: t.dueAt,
    repaidAt: t.repaidAt,
    repayTxHash: t.repayTxHash,
    defaultedAt: t.defaultedAt,
    onTime: t.onTime,
    outcome: t.outcome,
  };
}

/**
 * Returns one address's full AcorisLoanRegistry timeline — every agreement
 * they've ever been party to as either borrower or lender (see `role`),
 * whatever its outcome (pending/funded/repaid/defaulted/cancelled) — read
 * directly from CC3 Testnet. This is the same real network boundary
 * /api/credit-profile's "onchain" evidence mode uses, just returning
 * everything rather than filtering to repaid/defaulted evidence only; the
 * dashboard needs the full picture (e.g. an active loan's real due date,
 * or a still-pending agreement awaiting the lender's review) that
 * evidence-only filtering would drop.
 */
export async function POST(request: Request) {
  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(parsedBody);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }

  if (!isLoanRegistryDeployed()) {
    return Response.json(
      {
        error:
          "AcorisLoanRegistry is not deployed on CC3 Testnet in this environment (NEXT_PUBLIC_LOAN_REGISTRY_ADDRESS is unset). See docs/ACORIS_LOAN_CONTRACT.md.",
      },
      { status: 502 },
    );
  }
  if (LOAN_REGISTRY_DEPLOY_BLOCK === undefined) {
    return Response.json(
      {
        error:
          "LOAN_REGISTRY_DEPLOY_BLOCK is not configured — reading on-chain history needs a starting block so it doesn't have to scan the entire chain from genesis. Set it to the block number AcorisLoanRegistry was deployed at. See docs/ACORIS_LOAN_CONTRACT.md.",
      },
      { status: 502 },
    );
  }

  const provider = new JsonRpcProvider(CC3_TESTNET_RPC_HTTP);
  try {
    const timelines = await fetchOnChainLoanHistory(
      provider,
      LOAN_REGISTRY_ADDRESS as string,
      parsed.data.address,
      LOAN_REGISTRY_DEPLOY_BLOCK,
      parsed.data.role,
    );
    return Response.json({ timelines: timelines.map(toDto) });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to read on-chain loan history" },
      { status: 502 },
    );
  } finally {
    provider.destroy();
  }
}

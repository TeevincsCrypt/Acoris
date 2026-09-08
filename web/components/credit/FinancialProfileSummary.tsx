import { formatEther } from "ethers";

import type { FinancialProfileStatus, VerifiedFinancialProfile } from "@/lib/negotiation/types";

export function ProfileStatusBadge({ status }: { status: FinancialProfileStatus }) {
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="text-right font-mono text-xs text-zinc-900 dark:text-zinc-100">{value}</dd>
    </div>
  );
}

/**
 * The one place a VerifiedFinancialProfile gets rendered — used by both
 * the standalone Credit Profile page and the negotiation console's
 * "Verified Credit" summary, so the two never show inconsistent numbers
 * for the same underlying evidence. Every field either comes straight from
 * a real VerificationEvidenceRef or is explicitly NOT AVAILABLE — there is
 * no invented credit score anywhere in this component.
 */
export function FinancialProfileSummary({ profile }: { profile: VerifiedFinancialProfile }) {
  if (profile.status === "not-available") {
    return (
      <div className="flex items-center gap-3">
        <ProfileStatusBadge status="not-available" />
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          No financial evidence was submitted or attempted. This is not the same as bad credit — it&apos;s an
          unknown borrower, priced accordingly.
        </span>
      </div>
    );
  }

  if (profile.status === "unverified") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <ProfileStatusBadge status="unverified" />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Self-reported, not backed by proof — never priced as if it were verified.
          </span>
        </div>
        {profile.claimedSummary && (
          <p className="rounded-lg bg-amber-50 p-2.5 text-xs italic text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            &ldquo;{profile.claimedSummary}&rdquo;
          </p>
        )}
      </div>
    );
  }

  // status === "verified"
  const totalVolume = formatEther(profile.verifiedRepaymentVolume);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <ProfileStatusBadge status="verified" />
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          VERIFIED FINANCIAL HISTORY — {profile.verifiedRepaymentCount} event{profile.verifiedRepaymentCount === 1 ? "" : "s"}
        </span>
      </div>

      <dl className="divide-y divide-black/5 dark:divide-white/5">
        <Row label="Verified repayment activity" value={`${profile.verifiedRepaymentCount} repayment(s)`} />
        <Row label="Verified repayment volume" value={`${totalVolume} (native units)`} />
        <Row
          label="Successful repayments"
          value={`${profile.successfulRepaymentCount} successful, ${profile.failedRepaymentCount} failed`}
        />
        <Row
          label="On-time repayment rate"
          value={profile.onTimeRepaymentRate === null ? "NOT AVAILABLE (no due-date evidence)" : `${Math.round(profile.onTimeRepaymentRate * 100)}%`}
        />
        <Row label="Source chains" value={profile.sourceChains.join(", ")} />
        <Row label="Most recent verified activity" value={profile.mostRecentVerifiedActivity} />
      </dl>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Verification evidence ({profile.verificationEvidence.length})
        </p>
        <ol className="mt-2 space-y-1.5">
          {profile.verificationEvidence.map((e, i) => (
            <li
              key={`${e.transactionHash}-${i}`}
              className="rounded-lg border border-black/5 p-2 text-xs dark:border-white/5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-zinc-900 dark:text-zinc-100">{e.transactionHash}</span>
                <span
                  className={
                    e.status === "success"
                      ? "rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      : "rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700 dark:bg-red-950 dark:text-red-300"
                  }
                >
                  {e.status.toUpperCase()}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-zinc-500 dark:text-zinc-400">
                <span>Chain: {e.sourceChain}</span>
                {e.blockHeight > 0 && <span>Block: {e.blockHeight}</span>}
                <span>Amount: {formatEther(e.amountWei)}</span>
                <span>On time: {e.onTime === null ? "n/a" : e.onTime ? "yes" : "no"}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

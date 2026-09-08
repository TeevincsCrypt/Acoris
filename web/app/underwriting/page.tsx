import Link from "next/link";

import { PageHeader, PageNote, PageShell } from "@/components/site/PageShell";
import { UnderwritingPanel } from "@/components/underwriting/UnderwritingPanel";

export default function UnderwritingPage() {
  return (
    <PageShell>
      <PageHeader
        title="AI Credit Underwriter"
        description="See exactly how a lender would price this request from real evidence — the same deterministic formula that governs actual negotiations, narrated in plain language. No AI call, no invented confidence score."
      />

      <div className="flex justify-center">
        <UnderwritingPanel />
      </div>

      <p className="mt-8 text-center text-sm">
        <Link href="/improve" className="font-medium text-violet transition-colors hover:text-indigo-deep">
          Want better terms than this? See the Credit Improvement Simulator →
        </Link>
      </p>

      <PageNote>
        See lib/negotiation/underwrite.ts and constraints.ts for the exact formulas — this view runs no AI call and
        works even without ANTHROPIC_API_KEY configured.
      </PageNote>
    </PageShell>
  );
}

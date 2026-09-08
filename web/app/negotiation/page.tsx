import { Suspense } from "react";

import { NegotiationConsole } from "@/components/negotiation/NegotiationConsole";
import { PageHeader, PageNote, PageShell } from "@/components/site/PageShell";

export default function NegotiationPage() {
  return (
    <PageShell>
      <PageHeader
        title="Negotiate a Loan"
        description="A Borrower AI and a Lender AI negotiate structured loan terms. Financial constraints are enforced by deterministic code — the AI proposes, it never enforces. Verified credit history comes only from genuine cryptographic proofs."
      />

      <div className="flex justify-center">
        <Suspense fallback={<p className="text-sm text-ink-mute">Loading…</p>}>
          <NegotiationConsole />
        </Suspense>
      </div>

      <PageNote>
        See docs/ACORIS_NEGOTIATION_ENGINE.md for the architecture and this environment&apos;s limitations.
      </PageNote>
    </PageShell>
  );
}

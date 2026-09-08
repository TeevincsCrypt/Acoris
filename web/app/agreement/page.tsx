import { Suspense } from "react";

import { AgreementLookupPanel } from "@/components/agreement/AgreementLookupPanel";
import { PageHeader, PageNote, PageShell } from "@/components/site/PageShell";

export default function AgreementPage() {
  return (
    <PageShell>
      <PageHeader
        title="Find an Agreement"
        description="A lender doesn't get notified when a borrower proposes a deal — there's no email, no push, nothing sent for you. This is where you go with the link or loanHash they sent you: connect the wallet they named as lender, and review or fund it directly from what's on-chain."
      />

      <div className="flex justify-center">
        <Suspense fallback={<p className="text-sm text-ink-mute">Loading…</p>}>
          <AgreementLookupPanel />
        </Suspense>
      </div>

      <PageNote>
        AcorisLoanRegistry itself is the source of truth here — this page does nothing but resolve an id to a
        loanHash and read the contract. See docs/ACORIS_LOAN_CONTRACT.md.
      </PageNote>
    </PageShell>
  );
}

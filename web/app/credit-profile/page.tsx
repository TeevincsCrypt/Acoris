import { CreditProfilePanel } from "@/components/credit/CreditProfilePanel";
import { PageHeader, PageNote, PageShell } from "@/components/site/PageShell";

export default function CreditProfilePage() {
  return (
    <PageShell>
      <PageHeader
        title="Acoris Credit Profile"
        description="Verified financial activity, not a guess. Bring real evidence — a Sepolia repayment proven cross-chain via Attestcoin, or native CC3 loan history — and see exactly what a lender would see."
      />

      <div className="flex justify-center">
        <CreditProfilePanel />
      </div>

      <PageNote>
        This is the same evidence-resolution path the negotiation engine uses — a profile built here is exactly what a
        negotiation would price against. See docs/ACORIS_NEGOTIATION_ENGINE.md.
      </PageNote>
    </PageShell>
  );
}

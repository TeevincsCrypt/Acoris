import { ImprovementPanel } from "@/components/improve/ImprovementPanel";
import { PageHeader, PageNote, PageShell } from "@/components/site/PageShell";

export default function ImprovePage() {
  return (
    <PageShell>
      <PageHeader
        title="Credit Improvement Simulator"
        description="See how specific, real changes to your verified evidence would change your terms — computed by this protocol's actual pricing formula, not a promise."
      />

      <div className="flex justify-center">
        <ImprovementPanel />
      </div>

      <PageNote>
        See lib/negotiation/improve.ts — every projected number is produced by feeding a concrete hypothetical through
        the same deriveLenderConstraints function that prices real negotiations.
      </PageNote>
    </PageShell>
  );
}

import { MarketplacePanel } from "@/components/marketplace/MarketplacePanel";
import { PageHeader, PageNote, PageShell } from "@/components/site/PageShell";

export default function MarketplacePage() {
  return (
    <PageShell>
      <PageHeader
        title="Lender Marketplace"
        description="Three lenders with different risk postures — Conservative, Balanced, and Aggressive — each independently price the same loan request. Pick one to continue negotiating."
      />

      <div className="flex justify-center">
        <MarketplacePanel />
      </div>

      <PageNote>
        See docs/ACORIS_NEGOTIATION_ENGINE.md for how lender personas derive constraints and how the negotiation engine
        itself is unchanged once a lender is chosen.
      </PageNote>
    </PageShell>
  );
}

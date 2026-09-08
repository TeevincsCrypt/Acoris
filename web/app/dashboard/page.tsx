import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { PageHeader, PageShell } from "@/components/site/PageShell";

export default function DashboardPage() {
  return (
    <PageShell>
      <PageHeader
        title="Your Loan Portfolio"
        description="Every number here is read directly from AcorisLoanRegistry on CC3 Testnet for your connected wallet — no simulated activity, no placeholder history."
      />

      <div className="flex justify-center">
        <DashboardPanel />
      </div>
    </PageShell>
  );
}

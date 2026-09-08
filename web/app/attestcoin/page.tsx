import { AttestcoinVerificationPanel } from "@/components/AttestcoinVerificationPanel";
import { PageHeader, PageNote, PageShell } from "@/components/site/PageShell";

export default function AttestcoinPage() {
  return (
    <PageShell>
      <PageHeader
        title="Attestcoin Verification"
        description="One end-to-end cross-chain verification: a real Sepolia transaction, attested and proven on Creditcoin CC3 Testnet via the BlockProver precompile, decoded into a structured fact a lending decision can consume."
      />

      <div className="flex justify-center">
        <AttestcoinVerificationPanel />
      </div>

      <PageNote>
        See docs/ACORIS_ATTESTCOIN_VERIFICATION.md for the exact live flow and this environment&apos;s network
        limitations.
      </PageNote>
    </PageShell>
  );
}

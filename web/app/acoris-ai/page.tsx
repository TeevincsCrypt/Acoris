import { AcorisAIChat } from "@/components/assistant/AcorisAIChat";
import { PageHeader, PageNote, PageShell } from "@/components/site/PageShell";

export default function AcorisAIPage() {
  return (
    <PageShell>
      <PageHeader
        title="Acoris AI"
        description="A read-only assistant grounded in the real protocol. It explains how Acoris works, and — with a wallet connected — answers questions about your own on-chain loans from real AcorisLoanRegistry data, never a guess."
      />

      <AcorisAIChat />

      <PageNote>
        Acoris AI never proposes loan terms or writes on-chain state — that&apos;s the Borrower AI / Lender AI on
        /negotiation and /marketplace. It only explains and looks up real data; see lib/assistant/chat-agent.ts.
      </PageNote>
    </PageShell>
  );
}

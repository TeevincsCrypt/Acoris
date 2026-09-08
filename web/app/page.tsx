import Link from "next/link";

import { NetworkInfoCard } from "@/components/NetworkInfoCard";
import { AcorisLogo } from "@/components/site/AcorisLogo";
import { HeroVisual } from "@/components/site/HeroVisual";
import { WalletPanel } from "@/components/WalletPanel";

const BUILT_ON = [
  "Creditcoin CC3",
  "Attestcoin",
  "Claude",
  "ethers.js",
  "Hardhat",
  "Next.js",
];

const USE_CASES = [
  {
    title: "Borrowers",
    body: "Prove a repayment you have already made — on Sepolia or on Creditcoin itself — and negotiate terms that actually reflect it, instead of starting from zero on every new protocol.",
    href: "/credit-profile",
  },
  {
    title: "Lenders",
    body: "Price risk against evidence that cannot be faked. Three lender agents with distinct risk postures compete for the same request, and every offer states the reasoning behind it.",
    href: "/marketplace",
  },
  {
    title: "Developers",
    body: "Inspect the exact deterministic pricing the protocol runs — the scores, the constraints, and the reasoning — through an underwriting view that makes no AI call at all.",
    href: "/underwriting",
  },
];

const STEPS = [
  {
    title: "Verify",
    body: "Bring a real repayment. Attestcoin proves it cross-chain, or Acoris reads your native CC3 history directly.",
  },
  {
    title: "Negotiate",
    body: "A Borrower AI and a Lender AI exchange structured offers. Deterministic code clamps every limit.",
  },
  {
    title: "Fund",
    body: "The agreed terms become a real agreement on Creditcoin. Collateral is escrowed by the contract.",
  },
  {
    title: "Repay",
    body: "Repayment returns your collateral — and becomes verified evidence for the next negotiation.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-4 pt-4 sm:px-8">
      {/* Hero ------------------------------------------------------------ */}
      <section className="relative isolate overflow-hidden rounded-[var(--radius-hero)]">
        <HeroVisual />
        <div className="relative flex min-h-[27rem] flex-col items-center px-6 pb-32 pt-14 text-center sm:min-h-[33rem] sm:pb-44 sm:pt-20 lg:min-h-[36rem]">
          <AcorisLogo className="h-14 w-14 drop-shadow-sm" priority />
          <h1 className="mt-6 max-w-3xl text-[2.6rem] font-semibold leading-[1.03] text-indigo-ink sm:text-6xl lg:text-[4.25rem]">
            Credit that proves itself
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-indigo-deep/85 sm:text-[15px]">
            A DeFi credit protocol where AI agents negotiate real loan terms — priced only on financial history that
            has been cryptographically proven.
          </p>
          <Link href="/credit-profile" className="acoris-btn mt-7">
            Try it now
          </Link>
        </div>
      </section>

      {/* What is Acoris --------------------------------------------------- */}
      <section className="grid gap-8 pb-14 pt-20 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="text-4xl font-semibold leading-[1.08] text-ink sm:text-5xl">What is Acoris?</h2>
          <Link href="/underwriting" className="acoris-btn mt-6">
            Explore now
          </Link>
        </div>
        <p className="text-lg leading-relaxed text-ink-soft lg:pt-2">
          Acoris turns verifiable financial activity into credit. Bring proof of a real repayment and two AI agents
          negotiate your terms, while deterministic code enforces every limit — then the agreement settles on
          Creditcoin.
        </p>
      </section>

      {/* Three pillars ---------------------------------------------------- */}
      <section className="grid gap-4 lg:grid-cols-4">
        <article className="acoris-card-lavender relative flex min-h-[19rem] flex-col overflow-hidden p-6 lg:col-span-2">
          <h3 className="relative z-10 max-w-[13rem] text-2xl font-semibold leading-tight">Credit that compounds</h3>
          <p className="relative z-10 mt-auto max-w-[19rem] text-sm leading-relaxed text-indigo-ink/75">
            Every repayment you settle on-chain becomes verified evidence — and measurably better terms the next time
            you borrow.
          </p>
          <div aria-hidden className="pointer-events-none absolute -bottom-14 -right-10 h-52 w-52">
            <div
              className="absolute -inset-8 rounded-full opacity-70 blur-2xl"
              style={{ background: "radial-gradient(circle, rgba(139,92,246,0.55) 0%, rgba(139,92,246,0) 70%)" }}
            />
            <div className="hero-coin relative h-full w-full -rotate-6">
              <div className="hero-coin-face absolute inset-[11%]" />
            </div>
          </div>
        </article>

        <article className="acoris-card-deep flex min-h-[19rem] flex-col p-6">
          <h3 className="text-2xl font-semibold leading-tight">
            Always liquid,
            <br />
            always provable
          </h3>
          <p className="mt-auto text-sm leading-relaxed text-lavender/75">
            Repayments are verified cross-chain through Attestcoin. A self-reported claim is priced exactly like no
            claim at all.
          </p>
        </article>

        <article className="acoris-card-deep flex min-h-[19rem] flex-col p-6">
          <h3 className="text-2xl font-semibold leading-tight">
            AI proposes,
            <br />
            code enforces
          </h3>
          <p className="mt-auto text-sm leading-relaxed text-lavender/75">
            Agents argue the terms. Deterministic constraints clamp every number, so a model can never over-promise.
          </p>
        </article>
      </section>

      {/* Built on --------------------------------------------------------- */}
      <section className="flex flex-col gap-6 py-14 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
        <p className="max-w-xs text-sm leading-relaxed text-ink-mute">
          Built on real infrastructure. Every integration here is live, not mocked.
        </p>
        <ul className="flex flex-wrap items-center gap-x-8 gap-y-4">
          {BUILT_ON.map((name) => (
            <li key={name} className="text-[15px] font-medium tracking-tight text-ink-soft/70">
              {name}
            </li>
          ))}
        </ul>
      </section>

      {/* Use cases -------------------------------------------------------- */}
      <section className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="acoris-eyebrow">Acoris in action</p>
          <h2 className="mt-2 text-4xl font-semibold leading-[1.08] text-ink sm:text-5xl">Use cases</h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-soft">
            Acoris serves borrowers building a credit history, lenders pricing risk from real evidence, and developers
            who need a credit primitive they can verify rather than trust.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {USE_CASES.map((useCase) => (
            <article key={useCase.title} className="acoris-card p-6 sm:p-7">
              <h3 className="text-2xl font-semibold text-ink">{useCase.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">{useCase.body}</p>
              <Link
                href={useCase.href}
                className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-violet transition-colors hover:text-indigo-deep"
              >
                <span aria-hidden>→</span> Learn more
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* How it works ----------------------------------------------------- */}
      <section className="pt-20">
        <p className="acoris-eyebrow">The full loop</p>
        <h2 className="mt-2 text-4xl font-semibold leading-[1.08] text-ink sm:text-5xl">How it works</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="acoris-card flex flex-col p-5">
              <span className="font-mono text-xs text-ink-mute">0{i + 1}</span>
              <h3 className="mt-3 text-lg font-semibold text-ink">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Live proof ------------------------------------------------------- */}
      <section className="mt-20 rounded-[var(--radius-hero)] bg-indigo-deep px-6 py-12 text-white sm:px-10">
        <div className="max-w-xl">
          <p className="text-xs font-medium uppercase tracking-wider text-lavender/60">No mockups</p>
          <h2 className="mt-2 text-3xl font-semibold leading-tight sm:text-4xl">This is live, not a demo</h2>
          <p className="mt-3 text-sm leading-relaxed text-lavender/75">
            Connect a wallet on CC3 Testnet to see a real balance and a real block number, read straight from the
            chain. No state anywhere in this product is simulated.
          </p>
        </div>
        <div className="mt-9 flex flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-center">
          <WalletPanel />
          <NetworkInfoCard />
        </div>
      </section>
    </main>
  );
}

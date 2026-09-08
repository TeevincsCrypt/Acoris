import Link from "next/link";

import { CC3_TESTNET_CHAIN_ID } from "@/lib/creditcoin";
import { AcorisLogo } from "./AcorisLogo";

const COLUMNS = [
  {
    heading: "Build credit",
    links: [
      { href: "/credit-profile", label: "Credit profile" },
      { href: "/attestcoin", label: "Cross-chain verification" },
      { href: "/improve", label: "Improvement simulator" },
    ],
  },
  {
    heading: "Borrow",
    links: [
      { href: "/marketplace", label: "Lender marketplace" },
      { href: "/negotiation", label: "Negotiate a loan" },
      { href: "/underwriting", label: "AI underwriter" },
    ],
  },
  {
    heading: "Track",
    links: [{ href: "/dashboard", label: "Loan portfolio" }],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-20 bg-indigo-ink px-5 pb-10 pt-14 text-white sm:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_repeat(3,1fr)]">
          <div>
            <div className="flex items-center gap-2">
              <AcorisLogo className="h-7 w-7" />
              <span className="text-[15px] font-semibold tracking-tight">Acoris</span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-lavender/70">
              Credit that proves itself. AI-negotiated loans priced only on financial history that has been
              cryptographically verified.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.heading}>
              <p className="text-xs font-medium uppercase tracking-wider text-lavender/50">{column.heading}</p>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-lavender/80 transition-colors hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-lavender/50">
            Running on Creditcoin CC3 Testnet (chain {CC3_TESTNET_CHAIN_ID}). Testnet only — no real funds.
          </p>
          <p className="text-xs text-lavender/50">
            Every figure shown in this product is read from a live chain or a real verification. Nothing is simulated.
          </p>
        </div>
      </div>
    </footer>
  );
}

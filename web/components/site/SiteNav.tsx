"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { usePendingLenderReviews } from "@/lib/pending-lender-reviews-context";
import { useWallet } from "@/lib/wallet-context";
import { AcorisLogo } from "./AcorisLogo";
import { NavWalletButton } from "./NavWalletButton";

// Ordered to match the actual journey: build credit, find a lender,
// negotiate terms, then the deal that comes out of it — a real on-chain
// agreement someone (often a second person, the lender) needs to find and
// fund — before tracking everything in the portfolio.
const NAV_LINKS = [
  { href: "/credit-profile", label: "Credit profile" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/negotiation", label: "Negotiate" },
  { href: "/agreement", label: "Agreement" },
  { href: "/underwriting", label: "Underwriter" },
  { href: "/dashboard", label: "Portfolio" },
];

// The mobile sheet has vertical space the desktop bar doesn't, so it also
// carries the two routes that don't fit the primary six.
const MOBILE_LINKS = [
  ...NAV_LINKS,
  { href: "/improve", label: "Improvement simulator" },
  { href: "/attestcoin", label: "Cross-chain verification" },
];

/**
 * The one navigation bar, mounted once in the root layout so every route
 * shares identical chrome.
 */
export function SiteNav() {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const [menuOpen, setMenuOpen] = useState(false);

  // Only trust the shared poll while a wallet is actually connected — see
  // PendingLenderReviewsProvider's own comment on why it doesn't clear
  // stale state itself on disconnect.
  const wallet = useWallet();
  const { reviews } = usePendingLenderReviews();
  const pendingCount = wallet.status === "connected" ? reviews.length : 0;

  return (
    <header className="sticky top-0 z-50 border-b border-ink/5 bg-cream/85 backdrop-blur-md">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 py-3 sm:gap-6 sm:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-ink">
          <AcorisLogo className="h-7 w-7" priority />
          <span className="text-[15px] font-semibold tracking-tight">Acoris</span>
        </Link>

        <ul className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm transition-colors ${
                    active ? "bg-ink/5 text-ink" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {link.label}
                  {link.href === "/dashboard" && pendingCount > 0 && <NavBadge count={pendingCount} />}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="flex shrink-0 items-center gap-2">
          {/* The landing page sells the product and carries its own full
              WalletPanel, so it gets the entry-point CTA. Everywhere else the
              user is already inside the app and needs the wallet itself —
              connecting used to be possible only back on the landing page. */}
          {isLanding ? (
            <Link href="/negotiation" className="acoris-btn shrink-0 px-5 py-2 text-[13px]">
              Launch app
            </Link>
          ) : (
            <NavWalletButton />
          )}

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-ink transition-colors hover:bg-ink/5 lg:hidden"
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div id="mobile-nav" className="border-t border-ink/5 bg-cream lg:hidden">
          <ul className="mx-auto w-full max-w-6xl px-5 py-2 sm:px-8">
            {MOBILE_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-[15px] transition-colors ${
                      active ? "bg-ink/5 font-medium text-ink" : "text-ink-soft hover:bg-ink/5 hover:text-ink"
                    }`}
                  >
                    {link.label}
                    {link.href === "/dashboard" && pendingCount > 0 && <NavBadge count={pendingCount} />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </header>
  );
}

/** A real count, not a generic dot — someone glancing at the nav should be able to tell "1" from "6" without opening the page. */
function NavBadge({ count }: { count: number }) {
  return (
    <span
      aria-label={`${count} loan${count === 1 ? "" : "s"} awaiting your review`}
      className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-violet px-1 text-[10px] font-bold leading-none text-white"
    >
      {count}
    </span>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

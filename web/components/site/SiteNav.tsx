"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { AcorisLogo } from "./AcorisLogo";
import { NavWalletButton } from "./NavWalletButton";

const NAV_LINKS = [
  { href: "/credit-profile", label: "Credit profile" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/negotiation", label: "Negotiate" },
  { href: "/underwriting", label: "Underwriter" },
  { href: "/dashboard", label: "Portfolio" },
];

// The desktop bar only has room for the primary five; the mobile sheet has
// vertical space, so it carries every route rather than hiding two of them
// in the footer.
const MOBILE_LINKS = [
  ...NAV_LINKS,
  { href: "/agreement", label: "Find an agreement" },
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

  return (
    <header className="sticky top-0 z-50 border-b border-ink/5 bg-cream/85 backdrop-blur-md">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 py-3 sm:gap-6 sm:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-ink">
          <AcorisLogo className="h-7 w-7" priority />
          <span className="text-[15px] font-semibold tracking-tight">Acoris</span>
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-3.5 py-2 text-sm transition-colors ${
                    active ? "bg-ink/5 text-ink" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {link.label}
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
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-ink transition-colors hover:bg-ink/5 md:hidden"
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div id="mobile-nav" className="border-t border-ink/5 bg-cream md:hidden">
          <ul className="mx-auto w-full max-w-6xl px-5 py-2 sm:px-8">
            {MOBILE_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-lg px-3 py-2.5 text-[15px] transition-colors ${
                      active ? "bg-ink/5 font-medium text-ink" : "text-ink-soft hover:bg-ink/5 hover:text-ink"
                    }`}
                  >
                    {link.label}
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

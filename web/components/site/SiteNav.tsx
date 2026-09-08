"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AcorisMark } from "./AcorisMark";

const NAV_LINKS = [
  { href: "/credit-profile", label: "Credit profile" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/negotiation", label: "Negotiate" },
  { href: "/underwriting", label: "Underwriter" },
  { href: "/dashboard", label: "Portfolio" },
];

/**
 * The one navigation bar, mounted once in the root layout so every route
 * shares identical chrome.
 */
export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-ink/5 bg-cream/85 backdrop-blur-md">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-5 py-3.5 sm:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-ink">
          <AcorisMark className="h-4 w-4 text-violet" />
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

        <Link href="/negotiation" className="acoris-btn shrink-0 px-5 py-2 text-[13px]">
          Launch app
        </Link>
      </nav>
    </header>
  );
}

import type { ReactNode } from "react";

import { NetworkStatusBadge } from "@/components/NetworkStatusBadge";

/**
 * The shared frame every feature route sits in, so page width, rhythm and
 * header treatment stay identical across the product. Back-navigation lives
 * in SiteNav (mounted in the root layout), so pages no longer carry their
 * own back links.
 */
export function PageShell({ children }: { children: ReactNode }) {
  return <main className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8 sm:py-20">{children}</main>;
}

export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-10 text-center">
      <div className="flex justify-center">
        <NetworkStatusBadge />
      </div>
      <h1 className="mt-5 text-4xl font-semibold leading-[1.08] text-ink sm:text-5xl">{title}</h1>
      <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-ink-soft">{description}</p>
    </header>
  );
}

/** The small pointer to the design docs that closes most feature pages. */
export function PageNote({ children }: { children: ReactNode }) {
  return <p className="mt-10 text-center text-xs leading-relaxed text-ink-mute">{children}</p>;
}

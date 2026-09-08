"use client";

import { useState } from "react";

/**
 * The one place a borrower gets told, explicitly, that nothing about
 * funding is automatic: no email, no push notification, nothing sent on
 * their behalf. Proposing an agreement only writes it to
 * AcorisLoanRegistry — the counterparty finds out by being handed this
 * link (or the loanHash it carries) and opening it themselves.
 *
 * Only ever mounted after a client-side action (a successful on-chain
 * propose, or an already-proposed check that itself needs a connected
 * wallet) — never present in the server-rendered shell — so reading
 * `window` directly here has no hydration-mismatch risk and doesn't need
 * a useEffect+useState round trip just to become available a tick later.
 */
export function ShareAgreementLink({ loanHash }: { loanHash: string }) {
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = `${origin}/agreement?loanHash=${loanHash}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission can be denied — the input below is still
      // selectable, so this is a nice-to-have, not the only way to copy it.
    }
  }

  return (
    <div className="rounded-lg border border-violet/20 bg-lavender-mist p-3 text-xs">
      <p className="font-semibold text-indigo-ink">Share this with your lender</p>
      <p className="mt-1 text-indigo-ink/70">
        Nothing is sent automatically — no email, no notification. Send them this link. They need to open it
        themselves, connect the exact wallet you named as lender, and fund it from there.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          className="flex-1 truncate rounded-md border border-violet/20 bg-white px-2 py-1.5 font-mono text-[11px] text-ink"
        />
        <button
          onClick={copyLink}
          className="shrink-0 rounded-md bg-indigo-ink px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-indigo-deep"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

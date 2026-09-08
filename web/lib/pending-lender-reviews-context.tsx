"use client";

/**
 * One shared poll for "agreements awaiting this wallet's review as lender",
 * mounted once (see layout.tsx) so every consumer — the nav's Portfolio
 * badge, the dashboard's own review section — reads the same fetch instead
 * of each running an independent one that could disagree while both are on
 * screen. Mirrors WalletProvider's own pattern in this file's sibling
 * (single provider near the root, consumed via a hook).
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { findPendingLenderReviews, type LoanTimelineDto, type PendingLenderReview } from "./dashboard";
import { isLoanRegistryDeployed } from "./loan-contract";
import { useWallet } from "./wallet-context";

/** Matches LoanLifecycle's own polling interval — the same "did anything change" cadence already established elsewhere in this app. */
const POLL_MS = 20000;

interface PendingLenderReviewsValue {
  reviews: PendingLenderReview[];
  loading: boolean;
}

const PendingLenderReviewsContext = createContext<PendingLenderReviewsValue>({ reviews: [], loading: false });

export function PendingLenderReviewsProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const [reviews, setReviews] = useState<PendingLenderReview[]>([]);
  const [loading, setLoading] = useState(false);
  const deployed = isLoanRegistryDeployed();

  useEffect(() => {
    // No wallet, wrong network, or no registry: nothing to poll. Consumers
    // are expected to check wallet.status themselves before trusting
    // `reviews` — this deliberately doesn't clear stale state here (that
    // would mean a synchronous setState as the first statement in an
    // effect body, which cascades renders for no real benefit — the
    // guard above already prevents anything stale from ever being shown).
    if (!deployed || wallet.status !== "connected" || !wallet.address) return;
    const address = wallet.address;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/dashboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, role: "lender" }),
        });
        if (cancelled) return;
        if (!res.ok) {
          setReviews([]);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setReviews(findPendingLenderReviews((data as { timelines: LoanTimelineDto[] }).timelines));
      } catch {
        if (!cancelled) setReviews([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const interval = setInterval(() => {
      if (!cancelled) void load();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [deployed, wallet.status, wallet.address]);

  return <PendingLenderReviewsContext.Provider value={{ reviews, loading }}>{children}</PendingLenderReviewsContext.Provider>;
}

/** Consumers must gate on their own `useWallet().status === "connected"` before treating `reviews` as current — see the provider's effect comment above for why. */
export function usePendingLenderReviews(): PendingLenderReviewsValue {
  return useContext(PendingLenderReviewsContext);
}

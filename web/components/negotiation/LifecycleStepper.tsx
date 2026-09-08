export type LifecycleStage = "proposed" | "funded" | "repaid" | "cancelled" | "defaulted";

const MAIN_STEPS: { stage: LifecycleStage; label: string }[] = [
  { stage: "proposed", label: "Proposed" },
  { stage: "funded", label: "Funded" },
  { stage: "repaid", label: "Repaid" },
];

/**
 * Visual PROPOSED -> FUNDED -> REPAID indicator driven by the real
 * on-chain AgreementStatus (via the stage LoanLifecycle maps it to) — no
 * separate "Active" enum value invented here since the contract itself
 * doesn't have one; "Funded" is labeled to make clear that's the loan's
 * active/outstanding state. Cancelled/Defaulted render as a distinct
 * terminal branch rather than forcing them onto the happy-path line.
 */
export function LifecycleStepper({ current }: { current: LifecycleStage }) {
  const terminalBranch = current === "cancelled" || current === "defaulted";
  const currentIndex = MAIN_STEPS.findIndex((s) => s.stage === current);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {MAIN_STEPS.map((step, i) => {
        const reached = !terminalBranch && currentIndex >= i;
        const isCurrent = !terminalBranch && currentIndex === i;
        return (
          <div key={step.stage} className="flex items-center gap-1.5">
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                isCurrent
                  ? "bg-indigo-ink text-white dark:bg-white dark:text-black"
                  : reached
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600"
              }`}
            >
              {step.stage === "funded" ? "Funded · Active" : step.label}
            </span>
            {i < MAIN_STEPS.length - 1 && <span className="text-zinc-300 dark:text-zinc-700">→</span>}
          </div>
        );
      })}
      {terminalBranch && (
        <>
          <span className="text-zinc-300 dark:text-zinc-700">→</span>
          <span className="rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-950 dark:text-red-300">
            {current === "cancelled" ? "Cancelled" : "Defaulted"}
          </span>
        </>
      )}
    </div>
  );
}

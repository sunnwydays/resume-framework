"use client";

import { buttonCls, type Move } from "@/lib/tracker/format";
import type { NextStep, NextStepKind } from "@/lib/tracker/nextSteps";

const ICONS: Record<NextStepKind, string> = {
  start: "→",
  reply: "↩",
  follow_up: "↻",
  nudge: "↻",
  close: "✕",
  referral: "★",
  rework_template: "✎",
  send_more: "✉",
  build: "⚒",
  rebalance: "⚖",
};

const URGENT: NextStepKind[] = ["reply", "follow_up", "referral"];

interface Props {
  steps: NextStep[];
  movesById: Map<string, Move>;
  onShowMove: (id: string) => void;
  onDraftFollowUp: (move: Move) => void;
  onReplied: (move: Move) => void;
  onClose: (move: Move) => void;
  onOpenTemplate: (key: string) => void;
  onLogProject: () => void;
  onOpenWorkshop: () => void;
}

// Rule-based to-do list for the page (lib/tracker/nextSteps.ts). Each item
// has the one action that clears it.
export default function NextSteps({
  steps,
  movesById,
  onShowMove,
  onDraftFollowUp,
  onReplied,
  onClose,
  onOpenTemplate,
  onLogProject,
  onOpenWorkshop,
}: Props) {
  if (steps.length === 0) {
    return (
      <section className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
        Nothing pressing. You&rsquo;re on top of it.
      </section>
    );
  }

  function action(step: NextStep) {
    const move = step.moveId ? movesById.get(step.moveId) : undefined;
    switch (step.kind) {
      case "reply":
        return move && (
          <button type="button" onClick={() => onReplied(move)} className={buttonCls}>
            I replied
          </button>
        );
      case "follow_up":
      case "nudge":
        return move && (
          <button type="button" onClick={() => onDraftFollowUp(move)} className={buttonCls}>
            Draft follow-up
          </button>
        );
      case "close":
        return move && (
          <button type="button" onClick={() => onClose(move)} className={buttonCls}>
            Close it
          </button>
        );
      case "rework_template":
        return step.templateKey && (
          <button type="button" onClick={() => onOpenTemplate(step.templateKey!)} className={buttonCls}>
            Edit template
          </button>
        );
      case "build":
        return (
          <button type="button" onClick={onLogProject} className={buttonCls}>
            Log a project
          </button>
        );
      case "start":
      case "send_more":
        return (
          <button type="button" onClick={onOpenWorkshop} className={buttonCls}>
            Write one
          </button>
        );
      default:
        return null;
    }
  }

  return (
    <section className="space-y-2 rounded-lg border border-neutral-200 bg-surface p-4 dark:border-neutral-800">
      <h2 className="text-sm font-semibold">Next steps</h2>
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-900">
        {steps.map((step, i) => (
          <li key={`${step.kind}-${step.moveId ?? step.templateKey ?? i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span
              aria-hidden
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                URGENT.includes(step.kind)
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  : "bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400"
              }`}
            >
              {ICONS[step.kind]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {step.moveId ? (
                  <button type="button" onClick={() => onShowMove(step.moveId!)} className="text-left hover:underline">
                    {step.text}
                  </button>
                ) : (
                  step.text
                )}
              </p>
              {step.detail && <p className="text-xs text-neutral-500">{step.detail}</p>}
            </div>
            {action(step)}
          </li>
        ))}
      </ul>
    </section>
  );
}

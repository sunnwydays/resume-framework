"use client";

import { useState, type ReactNode } from "react";
import ModalBackdrop from "@/components/tracker/ModalBackdrop";
import { buttonCls } from "@/lib/tracker/format";

interface Props {
  title: string;
  // What gets deleted, shown on the first step.
  summary: ReactNode;
  // Shown on the second step, under "no undo".
  advice: string;
  // Resolves to an error message, or null once everything is deleted.
  onConfirm: () => Promise<string | null>;
  onClose: () => void;
}

const PHRASE = "delete all";
const dangerCls =
  "rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:opacity-50";

// Deliberately slow: wipes a whole table, so it takes three separate
// confirmations (continue, acknowledge, type a phrase).
export default function ClearAllDialog({ title, summary, advice, onConfirm, onClose }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [understood, setUnderstood] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    const message = await onConfirm();
    setBusy(false);
    if (message) setError(message);
    else onClose();
  }

  return (
    <ModalBackdrop onDismiss={busy ? undefined : onClose}>
      <div className="w-full max-w-md space-y-4 rounded-lg border-2 border-red-700 bg-surface p-5 shadow-xl">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold text-red-700 dark:text-red-400">{title}</h2>
          <span className="text-xs text-neutral-500">Step {step} of 3</span>
        </div>

        {step === 1 && (
          <>
            <p className="text-sm">{summary}</p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setStep(2)} className={dangerCls}>
                Continue
              </button>
              <button type="button" onClick={onClose} className={buttonCls}>
                Cancel
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-sm">There is no undo and no backup. {advice}</p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={understood}
                onChange={(e) => setUnderstood(e.target.checked)}
                className="mt-0.5"
              />
              I understand this permanently deletes everything above.
            </label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setStep(3)} disabled={!understood} className={dangerCls}>
                Continue
              </button>
              <button type="button" onClick={onClose} className={buttonCls}>
                Cancel
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <label className="block space-y-1 text-sm">
              <span>
                Type <strong>{PHRASE}</strong> to confirm.
              </span>
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && typed.trim().toLowerCase() === PHRASE && !busy && run()}
                className="w-full rounded border border-neutral-300 bg-surface px-2 py-1 dark:border-neutral-700"
              />
            </label>
            {error && <p className="text-sm text-red-700 dark:text-red-400">Delete failed: {error}</p>}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={run}
                disabled={busy || typed.trim().toLowerCase() !== PHRASE}
                className={dangerCls}
              >
                {busy ? "Deleting…" : "Delete everything"}
              </button>
              <button type="button" onClick={onClose} disabled={busy} className={buttonCls}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </ModalBackdrop>
  );
}

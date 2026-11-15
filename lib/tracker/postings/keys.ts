// Keyboard triage on the Postings table: which key does what, and where the
// focused row goes. Pure, so the listener in PostingsTable stays thin.

export type KeyAction = "next" | "prev" | "open" | "applied" | "dismiss" | "save";

const KEY_ACTIONS: Record<string, KeyAction> = {
  j: "next",
  k: "prev",
  o: "open",
  a: "applied",
  d: "dismiss",
  s: "save",
};

export interface KeyInput {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  // Focus is in a text field, or a dialog is open: shortcuts stand down.
  typing: boolean;
  modalOpen: boolean;
}

export function keyAction(input: KeyInput): KeyAction | null {
  if (input.typing || input.modalOpen) return null;
  if (input.ctrlKey || input.metaKey || input.altKey) return null;
  return KEY_ACTIONS[input.key.toLowerCase()] ?? null;
}

// The focused row after a move. No focus yet: j lands on the first row, k on the last.
export function moveIndex(current: number | null, delta: 1 | -1, length: number): number | null {
  if (length === 0) return null;
  if (current === null || current < 0) return delta === 1 ? 0 : length - 1;
  return Math.min(length - 1, Math.max(0, current + delta));
}

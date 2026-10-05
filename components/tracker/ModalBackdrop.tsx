import type { ReactNode } from "react";

interface Props {
  // Called when the dimmed area outside the dialog is pressed. Omit it (or pass
  // undefined) to make the dialog ignore outside presses, e.g. while busy.
  onDismiss?: () => void;
  children: ReactNode;
}

// The dimmed full-screen layer behind a dialog. Listens for mousedown rather
// than click so selecting text inside the dialog and releasing outside it
// doesn't close it.
export default function ModalBackdrop({ onDismiss, children }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onDismiss?.();
      }}
    >
      {children}
    </div>
  );
}

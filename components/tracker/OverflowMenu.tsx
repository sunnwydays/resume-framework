"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export const menuItemCls =
  "block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-100 disabled:opacity-50 disabled:hover:bg-transparent dark:hover:bg-neutral-900";
export const dangerMenuItemCls = `${menuItemCls} text-red-700 dark:text-red-400`;

// A borderless hamburger button that opens a small dropdown of the less-used actions. The
// children get a `close` function; items that open a dialog call it, items
// that show progress (a download) leave the menu open.
export default function OverflowMenu({
  label = "More actions",
  children,
}: {
  label?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-md p-1.5 text-neutral-500 transition-colors hover:text-neutral-900 aria-expanded:text-neutral-900 dark:hover:text-neutral-100 dark:aria-expanded:text-neutral-100"
      >
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M3 5h14M3 10h14M3 15h14" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-44 overflow-hidden rounded-lg border border-neutral-200 bg-surface py-1 shadow-lg dark:border-neutral-800"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

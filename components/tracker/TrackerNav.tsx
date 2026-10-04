"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/tracker", label: "Applications" },
  { href: "/tracker/arbitrage", label: "Arbitrage" },
] as const;

// Pages that aren't part of the day-to-day tracker get no nav.
const HIDDEN = ["/tracker/login", "/tracker/gmail-debug"];

export default function TrackerNav() {
  const pathname = usePathname();
  if (HIDDEN.some((p) => pathname.startsWith(p))) return null;
  return (
    <nav aria-label="Tracker" className="mb-6 flex gap-1 text-sm">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3 py-1 font-medium transition-colors ${
              active
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

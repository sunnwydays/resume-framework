"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/tracker/useTracker";

const LINKS = [
  { href: "/tracker", label: "Applications" },
  { href: "/tracker/postings", label: "Postings" },
  { href: "/tracker/arbitrage", label: "Arbitrage" },
] as const;

// Pages that aren't part of the day-to-day tracker get no nav.
const HIDDEN = ["/tracker/login", "/tracker/gmail-debug"];

export default function TrackerNav() {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function signOut() {
    await supabase().auth.signOut();
    window.location.href = "/tracker/login";
  }

  if (HIDDEN.some((p) => pathname.startsWith(p))) return null;
  return (
    <nav aria-label="Tracker" className="mb-6 flex flex-wrap items-center gap-1 text-sm">
      <Link
        href="/"
        className="mr-2 text-neutral-500 underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:decoration-neutral-700 dark:hover:text-neutral-100"
      >
        &larr; Resume Framework
      </Link>
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
      {email && (
        <span className="ml-auto text-xs text-neutral-500">
          {email} ·{" "}
          <button type="button" onClick={signOut} className="underline">
            Sign out
          </button>
        </span>
      )}
    </nav>
  );
}

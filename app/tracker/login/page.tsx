"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/tracker/useTracker";
import { inputCls, primaryButtonCls } from "@/lib/tracker/format";

// useSearchParams needs a Suspense boundary to prerender.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const errorParam = useSearchParams().get("error");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(
    errorParam === "link"
      ? "That sign-in link was invalid or expired. Request a new one."
      : errorParam === "private"
        ? "This tracker is private."
        : null
  );

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    const { error } = await supabase().auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/tracker/auth/confirm`,
        // Sign-ups are closed; an unknown address must not create an account.
        shouldCreateUser: false,
      },
    });
    // An address with no account gets the same screen as one that does, so
    // the form can't be used to find out who has an account.
    if (error && !/signups? not allowed|user not found/i.test(error.message)) {
      setError(error.message);
      setState("idle");
    } else {
      setState("sent");
    }
  }

  return (
    <div className="mx-auto max-w-sm pt-16">
      <h1 className="text-2xl font-semibold tracking-tight">Job Tracker</h1>
      {state === "sent" ? (
        <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
          Check <span className="font-medium">{email}</span> for a sign-in link.
          Open it in this browser.
        </p>
      ) : (
        <form onSubmit={send} className="mt-6 space-y-3">
          <label className="block text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
          <button type="submit" disabled={state === "sending"} className={primaryButtonCls}>
            {state === "sending" ? "Sending…" : "Email me a sign-in link"}
          </button>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </form>
      )}
    </div>
  );
}

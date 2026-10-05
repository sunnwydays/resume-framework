import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isTrackerUser } from "@/lib/tracker/access";
import type { Database } from "@/lib/tracker/database.types";

// Server client for route handlers. Create one per request.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component, which can't write cookies.
            // proxy.ts refreshes the session, so this is safe to ignore.
          }
        },
      },
    }
  );
}

// For routes that cost money or make outbound requests: the signed-in user's
// id if they're also on the tracker allowlist, else null. proxy.ts already
// gates these paths; this is the second check.
export async function getTrackerUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  return claims?.sub && isTrackerUser(claims.email) ? claims.sub : null;
}

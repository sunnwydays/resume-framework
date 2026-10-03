import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/tracker/database.types";

// Browser client for the job tracker. RLS on every table scopes reads and
// writes to the signed-in user, so the page talks to Supabase directly.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}

// Who may use the tracker once it's hosted. The list is a server-only env var
// (TRACKER_ALLOWED_EMAILS, comma-separated) checked in proxy.ts and again in
// the routes that cost money or make outbound requests. It backs up turning
// off Supabase sign-ups, so one dashboard mistake can't open the tracker up.

export function parseAllowedEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// Fails closed in production: an unset or empty list denies everyone. In
// development an unset list allows any signed-in user, so local dev works
// without the variable.
export function isAllowedEmail(
  email: string | null | undefined,
  { raw, production }: { raw: string | undefined; production: boolean }
): boolean {
  const allowed = parseAllowedEmails(raw);
  if (allowed.length === 0) return !production;
  return email ? allowed.includes(email.trim().toLowerCase()) : false;
}

// Reads the environment, for the callers that aren't pure.
export function isTrackerUser(email: string | null | undefined): boolean {
  return isAllowedEmail(email, {
    raw: process.env.TRACKER_ALLOWED_EMAILS,
    production: process.env.NODE_ENV === "production",
  });
}

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isTrackerUser } from "@/lib/tracker/access";

// Only covers the job tracker (see config.matcher); the resume-framework
// pages never hit this. Signed-out requests go to the login page; signed-in
// ones must also be on TRACKER_ALLOWED_EMAILS.
const PUBLIC_TRACKER_PATHS = ["/tracker/login", "/tracker/auth/confirm"];

export async function proxy(request: NextRequest) {
  // Refresh the Supabase session cookie on every tracker request.
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value)
          );
        },
      },
    }
  );

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const { pathname } = request.nextUrl;

  if (PUBLIC_TRACKER_PATHS.includes(pathname)) return response;

  if (!claims) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/tracker/login", request.url));
  }

  // Signed in, but not on the allowlist (see lib/tracker/access.ts).
  if (!isTrackerUser(claims.email)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/tracker/login?error=private", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/tracker/:path*", "/api/tracker/:path*"],
};

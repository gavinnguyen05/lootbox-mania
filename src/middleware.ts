import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SESSION_COOKIE_OPTIONS } from "@/lib/supabase/session-options";

/**
 * Runs on every page request:
 * 1. Builds a Content-Security-Policy with a fresh nonce. Next.js reads the
 *    nonce from the request header and adds it to its own <script> tags, so
 *    only scripts this server rendered can run.
 * 2. On /admin and /login only, refreshes the admin session cookie. Public
 *    pages never contact Supabase Auth.
 */
export async function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID()); // edge runtime: no Buffer
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    // 'unsafe-eval' only in dev, where React Refresh needs it.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Style attributes (next/image sets some) need 'unsafe-inline'. Styles can't run code.
    "style-src 'self' 'unsafe-inline'",
    // Images come from our own origin: next/image proxies Discord avatars.
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const next = () => NextResponse.next({ request: { headers: requestHeaders } });
  let res = next();

  const path = req.nextUrl.pathname;
  if (path.startsWith("/admin") || path === "/login") {
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookieOptions: SESSION_COOKIE_OPTIONS,
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = next();
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, { ...options, ...SESSION_COOKIE_OPTIONS }));
        },
      },
    });
    const { data } = await supabase.auth.getUser();
    // Convenience redirect only. The real check is requireAdmin() on the server.
    if (!data.user && path.startsWith("/admin")) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  // Pages only. Static files, optimized images, and /assets skip middleware.
  matcher: ["/((?!_next/static|_next/image|assets/|favicon.ico).*)"],
};

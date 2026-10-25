/**
 * Admin session cookie settings. The browser never talks to Supabase directly,
 * so the cookie can be HttpOnly (page JavaScript can't read it), Secure in
 * production, and SameSite=Lax (not sent on cross-site POSTs).
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

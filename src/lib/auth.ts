import "server-only";
import { redirect } from "next/navigation";
import { sessionClient } from "./supabase/session";

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

/**
 * The one authorization check. getUser() verifies the session token with
 * Supabase on every call, so a forged or expired cookie fails here.
 */
async function currentAdmin() {
  const { data } = await (await sessionClient()).auth.getUser();
  return data.user && isAdminEmail(data.user.email) ? data.user : null;
}

/** Pages: send non-admins to the login page. */
export async function requireAdminPage() {
  const user = await currentAdmin();
  if (!user) redirect("/login");
  return user;
}

/** Server actions: refuse non-admins. Called first in every admin action. */
export async function requireAdmin() {
  const user = await currentAdmin();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

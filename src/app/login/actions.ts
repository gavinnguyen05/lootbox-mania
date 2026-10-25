"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/auth";
import { rateLimited } from "@/lib/rate-limit";
import { sessionClient } from "@/lib/supabase/session";

// One message for every failure, so the form doesn't reveal which emails are admins.
const FAILED = { error: "Wrong email or password." };

export async function signIn(_prev: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(`login:${ip}`, 5, 60_000)) return { error: "Too many attempts. Wait a minute and try again." };

  const email = String(form.get("email") ?? "").trim().slice(0, 254);
  const password = String(form.get("password") ?? "").slice(0, 200);
  if (!email || !password || !isAdminEmail(email)) return FAILED;

  const { error } = await (await sessionClient()).auth.signInWithPassword({ email, password });
  if (error) return FAILED;
  redirect("/admin");
}

export async function signOut() {
  await (await sessionClient()).auth.signOut();
  redirect("/login");
}

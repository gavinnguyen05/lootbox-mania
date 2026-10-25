import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SESSION_COOKIE_OPTIONS } from "./session-options";

/** Supabase client bound to the admin's session cookies. */export async function sessionClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, { ...options, ...SESSION_COOKIE_OPTIONS }));
        } catch {
          // Server components can't set cookies. Middleware refreshes the session instead.
        }
      },
    },
  });
}

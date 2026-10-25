# Lootbox Mania

Checklist tracker, lootbox engine, and admin panel for Lootbox Royale III.
Next.js 15 (App Router) + Supabase + Vercel.

## Setup

1. Supabase SQL Editor: run `supabase/migrations/0001_lootbox_mania.sql`, then `0002_hardening.sql`.
2. Supabase Auth: create a user for each admin.
3. Discord: a bot in the event server. No permissions or privileged intents needed.
4. Copy `.env.example` to `.env.local` and fill it in.
5. Put art in `public/assets/` (logo, `no-candy.png`, `roberts-rule.png`, `candy/<item-id>.png`).
6. `npm install`, then `npm run dev`.

Checks: `npm run typecheck`, `npm run lint`, `npm run build`, `npm audit`.

## How it's built

**Data flow.** Pages are server components. Each page loads its data on the server
in one parallel batch and sends HTML. The browser never talks to Supabase. Client
JavaScript is only used for the nav highlight, local-time display, the login form,
and the admin dashboard.

**Security model.** Assume anyone can read the source, inspect the Network panel,
and call any endpoint directly.
- The public anon key can only read the columns public pages show
  (`0002_hardening.sql`). It cannot write anything or call any game function.
- Admin actions are server actions. Each one calls `requireAdmin()`, which verifies
  the session with Supabase, then validates every argument at runtime (`lib/validate.ts`).
- Lootbox rolls run entirely inside Postgres (`open_lootbox`): crypto-strength RNG,
  every rule, and the history row in one transaction, with the player row locked.
  Each click carries an idempotency key, so a repeated request returns the saved
  result instead of rolling again.
- Session cookie: HttpOnly, Secure, SameSite=Lax. Next.js rejects cross-origin
  server action calls (CSRF).
- Strict Content-Security-Policy with a per-request nonce, plus HSTS, X-Frame-Options,
  nosniff, Referrer-Policy, and Permissions-Policy.

**Caching.** Game pages are rendered per request and never cached. `/assets` is
cached for a day, hashed JS/CSS for a year. Images go through `next/image`, which
resizes them to their displayed size and serves WebP.

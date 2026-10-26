"use server";
// Every function here is a public POST endpoint: anyone can call it with any
// arguments, whether or not they use our UI. So each one:
//   1. checks the admin session (requireAdmin),
//   2. validates every argument at runtime,
//   3. lets the database decide the outcome (RNG, rules, limits),
//   4. returns a safe message and logs details on the server only.
// CSRF: Next.js only accepts server actions as POSTs whose Origin matches the
// site, and the session cookie is SameSite=Lax, so other sites can't trigger them.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase/service";
import { fetchDiscordProfile } from "@/lib/discord";
import { discordMessage } from "@/lib/discord-message";
import { rateLimited } from "@/lib/rate-limit";
import * as v from "@/lib/validate";
import type { RollResult } from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
  notice?: string;
}

export interface OpenResult extends ActionResult {
  results: RollResult[];
  discordText: string;
}

// Error codes raised by the SQL functions, mapped to messages for the admin.
const GAME_ERRORS: Record<string, string> = {
  NO_BOXES_LEFT: "No boxes left in this window.",
  PLAYER_ESCAPED: "This player already escaped.",
  PLAYER_INACTIVE: "This player is deactivated.",
  PLAYER_NOT_FOUND: "Player not found.",
  NO_ELIGIBLE_ITEMS: "No eligible items left. Check this player's exclusions.",
  NOTHING_TO_UNDO: "No roll to undo.",
  MANUAL_EDIT_AFTER_ROLL: "This player was edited by hand after their last roll. Undo would erase that edit, so fix it manually instead.",
  ITEM_NOT_FOUND: "Item not found.",
  NO_BONUS_TO_REMOVE: "This player has no bonus boxes to remove.",
  TOO_MANY_BONUS: "That's the most bonus boxes a player can hold (99).",
  INVALID_COUNT: "Invalid number.",
};

/** Turn any failure into a safe message. Unknown errors are logged, never shown. */
function fail(e: unknown, fallback = "Something went wrong. Try again."): ActionResult {
  const message = e instanceof Error ? e.message : String(e);
  if (e instanceof v.InvalidInput) return { ok: false, error: message };
  if (message === "UNAUTHORIZED") return { ok: false, error: "Your session expired. Sign in again." };
  const code = Object.keys(GAME_ERRORS).find((k) => message.includes(k));
  if (code) return { ok: false, error: GAME_ERRORS[code] };
  console.error("[admin action]", message);
  return { ok: false, error: fallback };
}

/** Run a database function; throw its error so fail() can map it. */
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await serviceClient().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

async function logAction(action_type: string, player_id: string | null, metadata: Record<string, unknown> = {}) {
  const { error } = await serviceClient().from("admin_actions").insert({ action_type, player_id, metadata });
  if (error) console.error("[admin log]", error.message);
}

/** Clears Next's client router cache so public pages show the change. */
function refreshPages() {
  revalidatePath("/", "layout");
}

/** Public site address for the Discord link. */
async function siteUrl() {
  const fixed = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (fixed) return fixed;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
}

/**
 * Opens one or two boxes. The browser only says which player; the database
 * picks the candy (crypto-strength RNG), applies every rule, and records the
 * roll in one transaction per box. Each requestId is an idempotency key:
 * resending the same click returns the saved result instead of rolling again.
 */
export async function openBoxes(playerId: unknown, requestIds: unknown): Promise<OpenResult> {
  const results: RollResult[] = [];
  try {
    await requireAdmin();
    const player = v.uuid(playerId, "player");
    if (!Array.isArray(requestIds) || requestIds.length < 1 || requestIds.length > 2) throw new v.InvalidInput("Invalid request.");
    const ids = requestIds.map((id) => v.uuid(id, "request"));

    for (const id of ids) {
      const r = await rpc<RollResult>("open_lootbox", { p_player_id: player, p_request_id: id });
      results.push(r);
      if (r.status === "escaped") break; // nothing left to roll for
    }
    refreshPages();
    return { ok: true, results, discordText: discordMessage(results, await siteUrl()) };
  } catch (e) {
    const err = fail(e, "Couldn't open the lootbox. Try again.");
    if (results.length) {
      refreshPages();
      return { ...err, ok: true, error: `Opened ${results.length}. ${err.error}`, results, discordText: discordMessage(results, await siteUrl()) };
    }
    return { ...err, results, discordText: "" };
  }
}

export async function undoLastRoll(playerId: unknown): Promise<ActionResult> {
  try {
    await requireAdmin();
    const data = await rpc<{ roll_id: number }>("undo_last_roll", { p_player_id: v.uuid(playerId, "player") });
    refreshPages();
    return { ok: true, notice: `Undid roll #${data.roll_id}.` };
  } catch (e) {
    return fail(e);
  }
}

/** +1 or -1 bonus box. Bonus boxes never expire and are used after the window's 2. */
export async function grantBox(playerId: unknown, delta: unknown): Promise<ActionResult> {
  try {
    await requireAdmin();
    const d = v.int(delta, -1, 1, "change");
    if (d === 0) throw new v.InvalidInput("Invalid change.");
    const now = await rpc<number>("admin_grant_box", { p_player_id: v.uuid(playerId, "player"), p_delta: d });
    refreshPages();
    return { ok: true, notice: d > 0 ? `Added a bonus box (${now} bonus).` : `Removed a bonus box (${now} bonus).` };
  } catch (e) {
    return fail(e);
  }
}

export async function setItem(playerId: unknown, itemId: unknown, timesRolled: unknown, collected: unknown, excluded: unknown): Promise<ActionResult> {
  try {
    await requireAdmin();
    await rpc("admin_set_item", {
      p_player_id: v.uuid(playerId, "player"),
      p_item_id: v.itemId(itemId),
      p_times_rolled: v.int(timesRolled, 0, 999, "copy count"),
      p_collected: v.bool(collected),
      p_excluded: v.bool(excluded),
    });
    refreshPages();
    return { ok: true, notice: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function resetProgress(playerId: unknown): Promise<ActionResult> {
  try {
    await requireAdmin();
    await rpc("admin_reset_progress", { p_player_id: v.uuid(playerId, "player") });
    refreshPages();
    return { ok: true, notice: "Progress reset." };
  } catch (e) {
    return fail(e);
  }
}

export async function setStatus(playerId: unknown, status: unknown): Promise<ActionResult> {
  try {
    await requireAdmin();
    const s = v.oneOf(status, ["trapped", "escaped"] as const, "status");
    await rpc("admin_set_status", { p_player_id: v.uuid(playerId, "player"), p_status: s });
    refreshPages();
    return { ok: true, notice: `Marked ${s}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function setActive(playerId: unknown, active: unknown): Promise<ActionResult> {
  try {
    await requireAdmin();
    const id = v.uuid(playerId, "player");
    const on = v.bool(active);
    const { error } = await serviceClient().from("players").update({ active: on }).eq("id", id);
    if (error) throw new Error(error.message);
    await logAction(on ? "reactivate_player" : "deactivate_player", id);
    refreshPages();
    return { ok: true, notice: on ? "Player reactivated." : "Player deactivated." };
  } catch (e) {
    return fail(e);
  }
}

function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "player";
}

export async function addPlayer(discordUserId: unknown): Promise<ActionResult> {
  try {
    await requireAdmin();
    const id = v.discordId(discordUserId);
    const db = serviceClient();

    const { data: existing } = await db.from("players").select("id").eq("discord_user_id", id).maybeSingle();
    if (existing) return { ok: false, error: "That Discord user is already a player." };

    const profile = await fetchDiscordProfile(id);

    // Readable, unique URL slug. One query for all taken slugs with this base.
    const base = slugify(profile.username);
    const { data: taken } = await db.from("players").select("slug").like("slug", `${base}%`);
    const used = new Set((taken ?? []).map((r) => r.slug));
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;

    const { data: row, error } = await db.from("players").insert({
      discord_user_id: id,
      slug,
      discord_username: profile.username,
      discord_display_name: profile.displayName,
      discord_avatar_url: profile.avatarUrl,
      profile_synced_at: new Date().toISOString(),
    }).select("id").single();
    if (error) throw new Error(error.message);

    await logAction("add_player", row.id, { discord_user_id: id, username: profile.username });
    refreshPages();
    return { ok: true, notice: `Added ${profile.displayName}.` };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("DISCORD_")) {
      console.error("[addPlayer]", e.message);
      return { ok: false, error: "Couldn't load that Discord profile. Check the ID and that the bot is in the server." };
    }
    return fail(e);
  }
}

/**
 * Refreshes names and avatars from Discord. Only runs when the admin asks,
 * never on page loads, and at most once per 30 seconds per admin.
 */
export async function syncProfiles(playerId?: unknown): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    if (rateLimited(`sync:${admin.id}`, 1, 30_000)) return { ok: false, error: "Synced recently. Wait 30 seconds." };
    const db = serviceClient();
    let q = db.from("players").select("id, discord_user_id");
    if (playerId !== undefined) q = q.eq("id", v.uuid(playerId, "player"));
    const { data: players, error } = await q;
    if (error) throw new Error(error.message);

    let updated = 0;
    let failed = 0;
    for (const p of players ?? []) {
      try {
        const prof = await fetchDiscordProfile(p.discord_user_id);
        await db.from("players").update({
          discord_username: prof.username,
          discord_display_name: prof.displayName,
          discord_avatar_url: prof.avatarUrl,
          profile_synced_at: new Date().toISOString(),
        }).eq("id", p.id);
        updated++;
      } catch (e) {
        failed++;
        console.error("[syncProfiles]", p.discord_user_id, e instanceof Error ? e.message : e);
      }
    }
    await logAction("sync_profiles", typeof playerId === "string" ? playerId : null, { updated, failed });
    refreshPages();
    return failed
      ? { ok: updated > 0, error: `Synced ${updated}. ${failed} couldn't be loaded from Discord.` }
      : { ok: true, notice: `Synced ${updated} profile${updated === 1 ? "" : "s"}.` };
  } catch (e) {
    return fail(e);
  }
}

import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicClient } from "./supabase/public";
import { serviceClient } from "./supabase/service";
import { SLUG } from "./validate";
import type { AdminAction, AdminPlayer, Item, PlayerWithItems, Roll } from "./types";

// Explicit columns only. Public queries can't use * anyway: the anon key is
// only granted these columns.
const ITEM_COLS = "id, name, rarity, base_probability, required, sort_order, icon_path, active";
const PLAYER_COLS = "id, slug, discord_username, discord_display_name, discord_avatar_url, lootbox_status, escaped_via";
const PLAYER_ITEM_COLS = "item_id, times_rolled, collected, excluded_by_roberts_rule, first_rolled_at";
const ROLL_COLS = "id, player_id, item_id, rarity, rolled_at, times_rolled_after, was_new_item, triggered_roberts_rule, triggered_completion, triggered_reset";

/** Throws a plain error. Next.js logs the detail server-side and shows error.tsx. */
function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Database query failed: ${res.error.message}`);
  return res.data as T;
}

// cache() de-duplicates within one request (e.g. generateMetadata + page both
// asking for the same player run one query). Nothing is kept between requests.

export const getItems = cache(async (): Promise<Item[]> =>
  must(await publicClient().from("lootbox_items").select(ITEM_COLS).order("sort_order")),
);

export const getPlayers = cache(async (): Promise<PlayerWithItems[]> =>
  must(await publicClient().from("players").select(`${PLAYER_COLS}, player_lootbox_items(${PLAYER_ITEM_COLS})`).order("discord_display_name")),
);

export const getPlayerBySlug = cache(async (slug: string): Promise<PlayerWithItems | null> => {
  if (!SLUG.test(slug)) return null;
  return must(
    await publicClient().from("players").select(`${PLAYER_COLS}, player_lootbox_items(${PLAYER_ITEM_COLS})`).eq("slug", slug).maybeSingle(),
  );
});

/** Newest drops, optionally for one player. Only as many rows as are shown. */
export async function getRecentRolls(limit: number, playerId?: string): Promise<Roll[]> {
  let q = publicClient().from("lootbox_rolls").select(ROLL_COLS).order("id", { ascending: false }).limit(limit);
  if (playerId) q = q.eq("player_id", playerId);
  return must(await q);
}

const DROPS_PER_PAGE = 50;

/** One page of a player's history. Fetches one extra row to know if there's a next page. */
export async function getRollPage(playerId: string, page: number) {
  const from = (page - 1) * DROPS_PER_PAGE;
  const rows: Roll[] = must(
    await publicClient().from("lootbox_rolls").select(ROLL_COLS).eq("player_id", playerId)
      .order("id", { ascending: false }).range(from, from + DROPS_PER_PAGE),
  );
  return { rolls: rows.slice(0, DROPS_PER_PAGE), hasMore: rows.length > DROPS_PER_PAGE };
}

/** Boxes opened per player in a claim window (undone rolls give the box back). */
export async function getWindowUsage(windowKey: string, db: SupabaseClient = publicClient()): Promise<Record<string, number>> {
  const rows: { player_id: string }[] = must(
    await db.from("lootbox_rolls").select("player_id").eq("claim_window", windowKey).eq("undone", false),
  );
  const used: Record<string, number> = {};
  for (const r of rows) used[r.player_id] = (used[r.player_id] ?? 0) + 1;
  return used;
}

/** Everything the admin dashboard needs, in parallel. Service role, admin only. */
export async function getAdminData(windowKey: string) {
  const db = serviceClient();
  const [items, players, rolls, actions, used] = await Promise.all([
    db.from("lootbox_items").select(ITEM_COLS).order("sort_order").then(must<Item[]>),
    db.from("players").select(`${PLAYER_COLS}, discord_user_id, active, player_lootbox_items(${PLAYER_ITEM_COLS})`)
      .order("discord_display_name").then(must<AdminPlayer[]>),
    db.from("lootbox_rolls").select(`${ROLL_COLS}, undone`).order("id", { ascending: false }).limit(200).then(must<Roll[]>),
    db.from("admin_actions").select("id, action_type, player_id, metadata, created_at")
      .order("id", { ascending: false }).limit(100).then(must<AdminAction[]>),
    getWindowUsage(windowKey, db),
  ]);
  return { items, players, rolls, actions, used };
}

export function byId<T extends { id: string }>(rows: T[]): Record<string, T> {
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

import type { Player } from "@/lib/types";
import { displayName } from "@/lib/names";

/**
 * Names shown on Candy Island instead of a player's Discord display name.
 * Key: their Discord display name exactly as it is now. Value: the name to show.
 */
export const ISLAND_NAMES: Record<string, string> = {
  "*": "Nathan",
};

export function islandName(p: Player): string {
  const name = displayName(p);
  return ISLAND_NAMES[name] ?? ISLAND_NAMES[p.discord_display_name ?? ""] ?? name;
}

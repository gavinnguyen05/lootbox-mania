import type { Item, PlayerWithItems } from "./types";
import { displayName } from "./names";
import { progress } from "./progress";
import { estimateBoxesLeft } from "./estimate";

export interface RankedPlayer {
  player: PlayerWithItems;
  rank: number;
  collected: number;
  total: number;
  /** Estimated boxes still needed. null for escaped players. */
  boxesToGo: number | null;
}

/**
 * Leaderboard order: escaped players first (earliest escape first), then
 * everyone else by fewest estimated boxes left. Ties go to whoever has more
 * of the checklist, then alphabetical.
 */
export function rankPlayers(players: PlayerWithItems[], items: Item[], escapeTimes: Record<string, string>): RankedPlayer[] {
  const rows = players.map((player) => {
    const { collected, total } = progress(items, player.player_lootbox_items);
    const escaped = player.lootbox_status === "escaped";
    return { player, collected, total, boxesToGo: escaped ? null : estimateBoxesLeft(items, player.player_lootbox_items) };
  });
  rows.sort((a, b) => {
    const ae = a.boxesToGo === null, be = b.boxesToGo === null;
    if (ae !== be) return ae ? -1 : 1;
    if (ae && be) return (escapeTimes[a.player.id] ?? "\uffff").localeCompare(escapeTimes[b.player.id] ?? "\uffff");
    return a.boxesToGo! - b.boxesToGo! || b.collected - a.collected || displayName(a.player).localeCompare(displayName(b.player));
  });
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

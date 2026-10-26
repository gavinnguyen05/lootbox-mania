import type { Player } from "./types";

export const BOXES_PER_WINDOW = 2;

/**
 * Boxes a player can open right now: what's left of this window's regular
 * boxes plus any bonus boxes. `used` counts only regular boxes (bonus rolls
 * are excluded when it's computed). Escaped players have none.
 */
export function boxesLeft(player: Pick<Player, "lootbox_status" | "bonus_boxes">, used: number): number {
  if (player.lootbox_status === "escaped") return 0;
  return Math.max(0, BOXES_PER_WINDOW - used) + player.bonus_boxes;
}

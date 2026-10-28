import type { Item, PlayerItem, Rarity } from "./types";
import { CHECKLIST_RARITIES } from "./rarity";

export interface ChecklistRow {
  item: Item;
  state: PlayerItem;
}

export function buildRows(items: Item[], playerItems: PlayerItem[]): ChecklistRow[] {
  const byId = new Map(playerItems.map((p) => [p.item_id, p]));
  return items
    .filter((i) => i.active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => ({
      item,
      state: byId.get(item.id) ?? {
        item_id: item.id,
        times_rolled: 0,
        collected: false,
        excluded_by_roberts_rule: false,
        first_rolled_at: null,
      },
    }));
}

export function progress(items: Item[], playerItems: PlayerItem[]) {
  const rows = buildRows(items, playerItems);
  const byRarity = {} as Record<Rarity, { collected: number; total: number }>;
  for (const r of CHECKLIST_RARITIES) {
    const tier = rows.filter((x) => x.item.rarity === r && x.item.required);
    byRarity[r] = { collected: tier.filter((x) => x.state.collected).length, total: tier.length };
  }
  const required = rows.filter((x) => x.item.required);
  return {
    rows,
    byRarity,
    collected: required.filter((x) => x.state.collected).length,
    total: required.length,
  };
}

/** Once a trapped player has this many required candies, show what's left
 *  (checklist highlight, result image, Discord message). */
export const ALMOST_THERE = 8;

/** Names of required candies still missing, in checklist order. */
export function missingNames(items: Item[], playerItems: PlayerItem[]): string[] {
  return buildRows(items, playerItems).filter((r) => r.item.required && !r.state.collected).map((r) => r.item.name);
}

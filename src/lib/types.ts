export type Rarity = "common" | "uncommon" | "rare" | "legendary" | "cursed";
export type LootboxStatus = "trapped" | "escaped";

export interface Item {
  id: string;
  name: string;
  rarity: Rarity;
  base_probability: number;
  required: boolean;
  sort_order: number;
  icon_path: string;
  active: boolean;
}

export interface PlayerItem {
  item_id: string;
  times_rolled: number;
  collected: boolean;
  excluded_by_roberts_rule: boolean;
  first_rolled_at: string | null;
}

/** The player fields public pages are allowed to see. */
export interface Player {
  id: string;
  slug: string;
  discord_username: string | null;
  discord_display_name: string | null;
  discord_avatar_url: string | null;
  lootbox_status: LootboxStatus;
  escaped_via: "checklist" | "golden_kitkat" | "manual" | null;
  bonus_boxes: number;
}

export interface PlayerWithItems extends Player {
  player_lootbox_items: PlayerItem[];
}

/** Admin-only extras. Never sent to public pages. */
export interface AdminPlayer extends PlayerWithItems {
  discord_user_id: string;
  active: boolean;
  candy: number;
  candy_reached_at: string;
  bonus_treats: number;
}

export interface NeighborOutcome {
  weight: number;
  candy: number;
  message: string;
  sort_order: number;
}

export interface Neighbor {
  id: string;
  name: string;
  flag: string;
  emoji_code: string;
  sort_order: number;
  icon_path: string | null;
  neighbor_outcomes: NeighborOutcome[];
}

/** What the database returns after a treat (see treat_result in SQL). */
export interface TreatResult {
  treat_id: number;
  player_id: string;
  neighbor_id: string;
  neighbor: string;
  flag: string;
  emoji_code: string;
  candy: number;
  message: string;
  /** Image to post alongside this outcome's message, if any (e.g. /assets/orangebar.png). */
  attach_image: string | null;
  total: number;
  treats_left: number;
  used_bonus: boolean;
  replayed: boolean;
}

export interface CandyEvent {
  id: number;
  name: string;
  amount: number;
  created_at: string;
  undone: boolean;
  players: { player_id: string; candy_before: number; candy_after: number }[];
}

/** One player's answers from the sign-up form ("about me" card). */
export interface AboutMe {
  formName: string;
  age: string;
  color: string;
  food: string;
  fact: string;
  spend: string;
  horse: string;
  notWin: string;
}

export interface IslandRound {
  id: number;
  round: number;
  picked: string[];      // player ids, in draw order
  remaining: string[];   // player ids left over (out of the island)
  created_at: string;
}

export interface IslandState {
  season: number;
  rounds: IslandRound[]; // this game, oldest first, not undone
}

export interface TreatRow {
  id: number;
  player_id: string;
  neighbor_id: string;
  candy: number;
  created_at: string;
  undone: boolean;
}

export interface Roll {
  id: number;
  player_id: string;
  item_id: string;
  rarity: Rarity;
  rolled_at: string;
  times_rolled_after: number;
  was_new_item: boolean;
  triggered_roberts_rule: boolean;
  triggered_completion: boolean;
  triggered_reset: boolean;
  undone?: boolean; // admin only
}

/** What the database returns after opening a box (see roll_result in SQL). */
export interface RollResult {
  roll_id: number;
  player_id: string;
  player_slug: string;
  discord_user_id: string;
  item_id: string;
  item_name: string;
  item_odds: number;
  icon_path: string;
  rarity: Rarity;
  times_rolled: number;
  was_new_item: boolean;
  triggered_roberts_rule: boolean;
  triggered_completion: boolean;
  triggered_reset: boolean;
  status: LootboxStatus;
  checklist_collected: number;
  replayed: boolean;
}

export interface AdminAction {
  id: number;
  action_type: string;
  player_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

import type { Rarity } from "./types";

export const RARITY: Record<Rarity, { label: string; emoji: string; className: string }> = {
  common: { label: "Common", emoji: "⚪", className: "r-common" },
  uncommon: { label: "Uncommon", emoji: "🟢", className: "r-uncommon" },
  rare: { label: "Rare", emoji: "🔵", className: "r-rare" },
  legendary: { label: "Legendary", emoji: "🟡", className: "r-legendary" },
  cursed: { label: "Cursed", emoji: "🔴", className: "r-cursed" },
};

export const CHECKLIST_RARITIES: Rarity[] = ["common", "uncommon", "rare"];

export const RARITIES: Rarity[] = ["common", "uncommon", "rare", "legendary", "cursed"];

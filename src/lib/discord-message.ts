import type { Rarity, RollResult } from "./types";
import { RARITY } from "./rarity";

/** Custom emoji from the event's Discord server. Only renders inside that server. */
const EXCLAMATION_EMOJI = "<:exclamation:1564903035682037810>";

/** Checklist facts read from the database right after the roll. */
export interface ChecklistSummary {
  completedSets: Rarity[]; // rarities finished by this batch of boxes
  stillNeeded: string[]; // shown only when the player is close to escaping
}

/**
 * Copyable Discord message, one line per box:
 *
 * ## __Results from [2] Loot Boxes__ <@123>
 * `  1x Fun Dip [COMMON]` [49.0%, DUPE - MAXED 😭]
 * ✅ **Rare set complete!**
 * <:exclamation:…> **Only 2 left:** Dots, 100 Grand
 *
 * [Tap here to view your candy checklist!](<https://site/players/slug>) 📋
 */
export function discordMessage(results: RollResult[], siteUrl: string, summary?: ChecklistSummary): string {
  const first = results[0];
  const n = results.length;
  const head = `## __Results from [${n}] Loot Box${n === 1 ? "" : "es"}__ <@${first.discord_user_id}>`;

  const lines = results.map((r) => {
    const tags = [`${Number(r.item_odds).toFixed(1)}%`];
    if (r.rarity === "cursed") tags.push("CHECKLIST RESET 💀");
    else if (r.rarity === "legendary") tags.push("ESCAPED 🎉");
    else if (r.was_new_item) tags.push("NEW");
    else if (r.triggered_roberts_rule) tags.push("DUPE - MAXED 😭");
    else tags.push("DUPE");
    if (r.triggered_completion && r.rarity !== "legendary") tags.push("CHECKLIST COMPLETE - ESCAPED 🎉");
    return `\`  1x ${r.item_name} [${r.rarity.toUpperCase()}]\` [${tags.join(", ")}]`;
  });

  const extras: string[] = [];
  for (const rarity of summary?.completedSets ?? []) extras.push(`✅ **${RARITY[rarity].label} set complete!**`);
  const needed = summary?.stillNeeded ?? [];
  if (needed.length) extras.push(`${EXCLAMATION_EMOJI} **Only ${needed.length} left:** ${needed.join(", ")}`);

  // The <> around the URL stops Discord from adding a preview card.
  return [head, ...lines, ...extras, "", `[Tap here to view your candy checklist!](<${siteUrl}/players/${first.player_slug}>) 📋`].join("\n");
}

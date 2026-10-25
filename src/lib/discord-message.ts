import type { RollResult } from "./types";

/**
 * Copyable Discord message, one line per box:
 *
 * ## __Results from [2] Loot Boxes__ <@123>
 * `  1x Fun Dip [COMMON]` [49.0%, DUPE - MAXED 😭]
 *
 * [See full checklist here](<https://site/players/slug>) 📋
 */
export function discordMessage(results: RollResult[], siteUrl: string): string {
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

  // The <> around the URL stops Discord from adding a preview card.
  return [head, ...lines, "", `[See full checklist here](<${siteUrl}/players/${first.player_slug}>) 📋`].join("\n");
}

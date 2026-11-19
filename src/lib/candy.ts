// Candy leaderboard (Discord) and trick-or-treat message text.

export const CANDY_EMOJI = "<:johan:1291256144299560980>";
/** Shown after a Liatao-boosted player's candy, and on boost lines. */
export const LIATAO_EMOJI = "<:liatao:1433556876930453707>";
export const LIATAO_MULTIPLIER = 1.3;
export const LEADERBOARD_TITLE = "CANDY LEADERBOARD 2026";
/** The Discord message the leaderboard gets pasted over. */
export const LEADERBOARD_MESSAGE_URL = "https://discord.com/channels/339852875968806928/650031074730311727/1555118760392925186";

export interface CandyPlayer {
  id: string;
  discord_user_id: string;
  candy: number;
  candy_reached_at: string;
  active: boolean;
  liatao?: boolean;
}

/** Most candy first. Ties: whoever reached that amount first ranks higher. */
export function rankCandy<T extends CandyPlayer>(players: T[]): T[] {
  return players
    .filter((p) => p.active)
    .sort((a, b) => b.candy - a.candy || a.candy_reached_at.localeCompare(b.candy_reached_at));
}

/** The full leaderboard message, ready to paste over the old one. */
export function leaderboardText(players: CandyPlayer[]): string {
  const lines = rankCandy(players).map((p, i) =>
    `> #${i + 1}. <@${p.discord_user_id}> - ${p.candy} ${CANDY_EMOJI}${p.liatao ? ` ${LIATAO_EMOJI}` : ""}`);
  return [`> ## ${CANDY_EMOJI} __**${LEADERBOARD_TITLE}**__:`, ...lines].join("\n");
}

/**
 * A neighbor's line with their emoji (and one candy emoji per candy for {candies}).
 * If the player has the Liatao boost, a second line shows what they actually get.
 */
export function treatMessage(template: string, neighborEmoji: string, baseCandy: number, boostedCandy?: number): string {
  const line = template.replace("{neighbor}", neighborEmoji).replace("{candies}", CANDY_EMOJI.repeat(baseCandy));
  if (boostedCandy === undefined || boostedCandy === baseCandy) return line;
  return `${line}\n${LIATAO_EMOJI} **Liatao boost x${LIATAO_MULTIPLIER}:** ${baseCandy} → **${boostedCandy} Candy** ${CANDY_EMOJI}`;
}

/** The same line for reading on the admin page: no Discord emoji codes or bold marks. */
export function treatMessagePlain(template: string): string {
  return template
    .replace("{neighbor}", "")
    .replace("{candies}", "")
    .replace(/<a?:\w+:\d+>/g, "") // custom Discord emojis like <:johan:123>
    .replace(/\*\*/g, "")
    .replace(/\s+([?.!,])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Announcement for a candy event, e.g. 🎉 **Costume contest**: <@1>, <@2> get **+10 Candy** <:johan:…> */
export function eventMessage(name: string, amount: number, discordIds: string[], boosted: { id: string; amount: number }[] = []): string {
  const who = discordIds.map((id) => `<@${id}>`).join(", ");
  const title = name.trim() || "Bonus candy";
  const verb = amount > 0 ? (discordIds.length === 1 ? "gets" : "get") : (discordIds.length === 1 ? "loses" : "lose");
  const lines = [`${amount > 0 ? "🎉" : "💸"} **${title}**: ${who} ${verb} **${amount > 0 ? `+${amount}` : Math.abs(amount)} Candy** ${CANDY_EMOJI}`];
  if (boosted.length) {
    const each = boosted.map((b) => `<@${b.id}> **+${b.amount}**`).join(", ");
    lines.push(`${LIATAO_EMOJI} **Liatao boost x${LIATAO_MULTIPLIER}:** ${each} ${CANDY_EMOJI}`);
  }
  return lines.join("\n");
}

/** Candy Island results for Discord: draw order, then who's left over. */
export function islandMessage(round: number, picked: string[], remaining: string[], immune?: string | null): string {
  const lines = picked.map((id, i) => `${i + 1}. <@${id}>${id === immune ? " 🗿 IMMUNE" : ""}`);
  return [
    `🏝️ **CANDY ISLAND: ROUND ${round}**`,
    ...(immune ? [`🗿 **Immunity:** <@${immune}>`, ""] : []),
    ...lines,
    "",
    `**Remaining (${remaining.length}):** ${remaining.map((id) => `<@${id}>`).join(", ")}`,
  ].join("\n");
}

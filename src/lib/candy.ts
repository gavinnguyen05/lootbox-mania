// Candy leaderboard (Discord) and trick-or-treat message text.

export const CANDY_EMOJI = "<:johan:1291256144299560980>";
export const LEADERBOARD_TITLE = "CANDY LEADERBOARD 2026";
/** The Discord message the leaderboard gets pasted over. */
export const LEADERBOARD_MESSAGE_URL = "https://discord.com/channels/339852875968806928/650031074730311727/1555118760392925186";

export interface CandyPlayer {
  id: string;
  discord_user_id: string;
  candy: number;
  candy_reached_at: string;
  active: boolean;
}

/** Most candy first. Ties: whoever reached that amount first ranks higher. */
export function rankCandy<T extends CandyPlayer>(players: T[]): T[] {
  return players
    .filter((p) => p.active)
    .sort((a, b) => b.candy - a.candy || a.candy_reached_at.localeCompare(b.candy_reached_at));
}

/** The full leaderboard message, ready to paste over the old one. */
export function leaderboardText(players: CandyPlayer[]): string {
  const lines = rankCandy(players).map((p, i) => `> #${i + 1}. <@${p.discord_user_id}> - ${p.candy} ${CANDY_EMOJI}`);
  return [`> ## ${CANDY_EMOJI} __**${LEADERBOARD_TITLE}**__:`, ...lines].join("\n");
}

/** A neighbor's line with their emoji and one candy emoji per candy. */
export function treatMessage(template: string, neighborEmoji: string, candy: number): string {
  return template.replace("{neighbor}", neighborEmoji).replace("{candies}", CANDY_EMOJI.repeat(candy));
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
export function eventMessage(name: string, amount: number, discordIds: string[]): string {
  const who = discordIds.map((id) => `<@${id}>`).join(", ");
  const title = name.trim() || "Bonus candy";
  const verb = amount > 0 ? (discordIds.length === 1 ? "gets" : "get") : (discordIds.length === 1 ? "loses" : "lose");
  return `🎉 **${title}**: ${who} ${verb} **${amount > 0 ? "+" : ""}${amount} Candy** ${CANDY_EMOJI}`;
}

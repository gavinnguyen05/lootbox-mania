export function displayName(p: { discord_display_name: string | null; discord_username: string | null }) {
  return p.discord_display_name || p.discord_username || "Unknown player";
}

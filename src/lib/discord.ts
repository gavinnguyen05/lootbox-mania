import "server-only";

export interface DiscordProfile {
  username: string;
  displayName: string;
  avatarUrl: string;
}

const API = "https://discord.com/api/v10";
const AVATAR_HASH = /^(a_)?[0-9a-f]{32}$/;

/**
 * Only called when the admin adds or syncs a player. Public pages read the
 * cached profile from the database and never contact Discord.
 */
async function discordGet(path: string): Promise<Response> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not set.");
  const request = () =>
    fetch(`${API}${path}`, { headers: { Authorization: `Bot ${token}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  let res = await request();
  if (res.status === 429) {
    const body = (await res.json().catch(() => ({}))) as { retry_after?: number };
    const waitMs = Math.min(5000, Math.ceil((body.retry_after ?? 1) * 1000));
    await new Promise((r) => setTimeout(r, waitMs));
    res = await request();
  }
  return res;
}

function avatarUrl(userId: string, hash: unknown, guildId?: string): string | null {
  if (typeof hash !== "string" || !AVATAR_HASH.test(hash)) return null;
  return guildId
    ? `https://cdn.discordapp.com/guilds/${guildId}/users/${userId}/avatars/${hash}.png?size=256`
    : `https://cdn.discordapp.com/avatars/${userId}/${hash}.png?size=256`;
}

function defaultAvatar(userId: string) {
  return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(userId) >> 22n) % 6n)}.png`;
}

/** Plain text, trimmed, length-capped. Rendered as escaped text by React. */
function cleanName(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, 64) : "";
}

/** Server nickname and avatar first, then the global profile. userId is already validated. */
export async function fetchDiscordProfile(userId: string): Promise<DiscordProfile> {
  const guild = process.env.DISCORD_GUILD_ID;
  if (!guild) throw new Error("DISCORD_GUILD_ID is not set.");

  const res = await discordGet(`/guilds/${guild}/members/${userId}`);
  if (res.ok) {
    const m = await res.json();
    const username = cleanName(m.user?.username);
    return {
      username,
      displayName: cleanName(m.nick) || cleanName(m.user?.global_name) || username,
      avatarUrl: avatarUrl(userId, m.avatar, guild) ?? avatarUrl(userId, m.user?.avatar) ?? defaultAvatar(userId),
    };
  }
  if (res.status === 404) {
    const r2 = await discordGet(`/users/${userId}`);
    if (!r2.ok) throw new Error("DISCORD_USER_NOT_FOUND");
    const u = await r2.json();
    const username = cleanName(u.username);
    return {
      username,
      displayName: cleanName(u.global_name) || username,
      avatarUrl: avatarUrl(userId, u.avatar) ?? defaultAvatar(userId),
    };
  }
  throw new Error(`DISCORD_API_${res.status}`);
}

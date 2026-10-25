import "server-only";

/**
 * Small fixed-window limiter kept in server memory. On serverless hosting each
 * instance has its own memory, so this is a speed bump against scripted
 * spamming, not a hard global limit. Supabase Auth adds its own login limits.
 * The map is capped so it can't grow without bound.
 */
const MAX_KEYS = 1000;
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    if (hits.size >= MAX_KEYS) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      if (hits.size >= MAX_KEYS) hits.clear();
    }
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > limit;
}

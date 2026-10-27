import type { Item, PlayerItem } from "./types";

/**
 * Estimated boxes a trapped player still needs to escape.
 *
 * Simulates the rest of their game many times with the exact rules the
 * database uses for a real roll (supabase open_lootbox):
 *  - pick a rarity by its odds, among rarities that still have an eligible candy
 *  - pick evenly among that rarity's eligible candies
 *  - Robert's Rule IV: a 3rd copy removes the candy from their pool
 *  - Golden KitKat escapes instantly; the Ring Pop curse resets the checklist
 *  - escape when all required candies are collected
 * and returns the average number of boxes. Rare candies left = more boxes.
 *
 * The random numbers come from a seed made from the player's checklist, so the
 * same checklist always gives the same estimate (ranks don't jitter on reload).
 * Results are cached by checklist state, and the cache is size-capped.
 */

const RUNS = 1200; // average is within about ±0.3 boxes
const MAX_BOXES = 1000; // safety stop for a single simulated run
const cache = new Map<string, number>();
const CACHE_LIMIT = 500;

/** Small, fast, seedable PRNG (mulberry32). Not for anything security-related. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function estimateBoxesLeft(items: Item[], playerItems: PlayerItem[]): number {
  const pool = items.filter((i) => i.active).sort((a, b) => a.sort_order - b.sort_order);
  const byId = new Map(playerItems.map((p) => [p.item_id, p]));
  const start = pool.map((i) => {
    const s = byId.get(i.id);
    return { times: s?.times_rolled ?? 0, collected: s?.collected ?? false, excluded: s?.excluded_by_roberts_rule ?? false };
  });

  const key = JSON.stringify([pool.map((i) => `${i.id}:${i.rarity}:${i.base_probability}:${i.required}`), start]);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const tiers = [...new Set(pool.map((i) => i.rarity))];
  const tierWeight = new Map(tiers.map((t) => [t, Math.max(...pool.filter((i) => i.rarity === t).map((i) => Number(i.base_probability)))]));
  const tierItems = new Map(tiers.map((t) => [t, pool.map((i, idx) => (i.rarity === t ? idx : -1)).filter((idx) => idx >= 0)]));
  const required = pool.map((i) => i.required);
  const random = rng(hash(key));

  const tierList = tiers.map((t) => ({ name: t, weight: tierWeight.get(t)!, items: tierItems.get(t)! }));
  const eligible = new Array<number>(pool.length);
  let total = 0;
  const times = new Array<number>(pool.length);
  const collected = new Array<boolean>(pool.length);
  const excluded = new Array<boolean>(pool.length);

  for (let run = 0; run < RUNS; run++) {
    for (let i = 0; i < pool.length; i++) {
      times[i] = start[i].times; collected[i] = start[i].collected; excluded[i] = start[i].excluded;
    }
    let boxes = 0;
    while (boxes < MAX_BOXES) {
      boxes++;
      // 1. Rarity, among rarities with at least one eligible candy.
      let sum = 0;
      for (const t of tierList) if (t.items.some((i) => !excluded[i])) sum += t.weight;
      let pick = random() * sum;
      let tier = tierList[tierList.length - 1];
      for (const t of tierList) {
        if (!t.items.some((i) => !excluded[i])) continue;
        tier = t;
        pick -= t.weight;
        if (pick < 0) break;
      }
      // 2. Candy, evenly among the eligible ones in that rarity.
      let n = 0;
      for (const i of tier.items) if (!excluded[i]) eligible[n++] = i;
      const it = eligible[Math.floor(random() * n)];
      times[it]++;
      collected[it] = true;
      // 3. Rules.
      if (tier.name === "legendary") break; // instant escape
      if (tier.name === "cursed") {
        for (let i = 0; i < pool.length; i++) if (required[i]) { times[i] = 0; collected[i] = false; excluded[i] = false; }
        continue;
      }
      if (required[it] && times[it] >= 3) excluded[it] = true;
      let done = true;
      for (let i = 0; i < pool.length; i++) if (required[i] && !collected[i]) { done = false; break; }
      if (done) break;
    }
    total += boxes;
  }

  const estimate = total / RUNS;
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, estimate);
  return estimate;
}

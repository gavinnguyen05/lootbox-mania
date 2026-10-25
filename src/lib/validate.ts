// Runtime checks for anything that arrives from the browser or the URL.
// TypeScript types disappear at runtime, so server actions call these first.

export class InvalidInput extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ITEM_ID = /^[a-z0-9-]{1,40}$/;
const DISCORD_ID = /^[0-9]{15,21}$/;
export const SLUG = /^[a-z0-9-]{1,60}$/;

function check(ok: boolean, what: string) {
  if (!ok) throw new InvalidInput(`Invalid ${what}.`);
}

export function uuid(v: unknown, what = "id"): string {
  check(typeof v === "string" && UUID.test(v), what);
  return v as string;
}

export function itemId(v: unknown): string {
  check(typeof v === "string" && ITEM_ID.test(v), "item");
  return v as string;
}

export function discordId(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  check(DISCORD_ID.test(s), "Discord user ID");
  return s;
}

export function int(v: unknown, min: number, max: number, what = "number"): number {
  check(typeof v === "number" && Number.isInteger(v) && v >= min && v <= max, what);
  return v as number;
}

export function bool(v: unknown, what = "flag"): boolean {
  check(typeof v === "boolean", what);
  return v as boolean;
}

export function oneOf<T extends string>(v: unknown, options: readonly T[], what: string): T {
  check(typeof v === "string" && (options as readonly string[]).includes(v), what);
  return v as T;
}

/** Page number from a query string. Anything odd becomes page 1. */
export function pageParam(v: unknown): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1;
}

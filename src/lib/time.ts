// Game rules run on Los Angeles time. Display uses each viewer's own timezone
// (see components/LocalTime.tsx).
export const TZ = "America/Los_Angeles";

function laParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
}

/** Milliseconds LA is offset from UTC at a given instant (negative). */
function laOffset(utcMs: number) {
  const p = laParts(new Date(utcMs));
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(utcMs / 1000) * 1000;
}

/** The real instant of an LA wall-clock time. Day overflow is fine (d + 1). */
function laWallToUtc(y: number, m: number, d: number, h: number) {
  const guess = Date.UTC(y, m - 1, d, h);
  let t = guess - laOffset(guess);
  const again = guess - laOffset(t);
  if (again !== t) t = again;
  return t;
}

/** Same key the database computes in current_claim_window(). */
function claimWindowKey(d = new Date()): string {
  const p = laParts(d);
  const date = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  return `${date}:${p.h >= 20 ? "W2" : "W1"}`;
}

/** Current claim window with real start/end instants, for local display. */
export function claimWindowInfo(now = new Date()) {
  const p = laParts(now);
  const evening = p.h >= 20;
  const start = laWallToUtc(p.y, p.m, p.d, evening ? 20 : 0);
  const end = evening ? laWallToUtc(p.y, p.m, p.d + 1, 0) : laWallToUtc(p.y, p.m, p.d, 20);
  return {
    key: claimWindowKey(now),
    name: evening ? "Evening drop" : "Day drop",
    startIso: new Date(start).toISOString(),
    lastMinuteIso: new Date(end - 60_000).toISOString(),
    endIso: new Date(end).toISOString(),
  };
}

export type WindowInfo = ReturnType<typeof claimWindowInfo>;

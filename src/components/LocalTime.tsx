"use client";
import { useEffect, useState } from "react";
import { TZ } from "@/lib/time";

type Mode = "day" | "time" | "dayTime";

function dateKey(d: Date, tz: string | undefined) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** "Today", "Yesterday", or "Oct 22", judged in the viewer's timezone. */
function dayLabel(d: Date, tz: string | undefined) {
  const today = dateKey(new Date(), tz);
  const [y, m, day] = today.split("-").map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, day - 1)).toISOString().slice(0, 10);
  const key = dateKey(d, tz);
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(d);
}

/**
 * A time in the viewer's own timezone. The server renders LA time, then the
 * browser swaps in local time right after load.
 */
export default function LocalTime({ iso, mode = "dayTime", zone = false }: { iso: string; mode?: Mode; zone?: boolean }) {
  const [tz, setTz] = useState<string | undefined>(TZ);
  useEffect(() => setTz(undefined), []);

  const d = new Date(iso);
  const day = dayLabel(d, tz);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", minute: "2-digit", ...(zone ? { timeZoneName: "short" as const } : {}),
  }).format(d);
  const text = mode === "day" ? day : mode === "time" ? time : `${day} · ${time}`;
  return <time dateTime={iso} suppressHydrationWarning>{text}</time>;
}

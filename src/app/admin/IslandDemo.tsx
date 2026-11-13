"use client";
// Candy Island demo: a short standalone animation for teasers. All 16 players
// sit on the stumps, each turns into an anonymous silhouette, then they vanish
// one at a time until a single mystery camper is left. Purely visual: it never
// touches the real ceremony (marshmallows, rounds, candy).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { AdminPlayer } from "@/lib/types";
import Avatar from "@/components/Avatar";
import { islandName } from "./islandNames";
import { AVATAR_W, BG, STUMPS, shuffled } from "./islandLayout";

const HOLD_MS = 1200;        // everyone visible before the change
const INCOG_STAGGER_MS = 70; // one after another turns anonymous
const INCOG_FADE_MS = 500;   // matches the CSS transition
const VANISH_EVERY_MS = 380; // one disappears every this often
const VANISH_SLOWDOWN_FROM = 4; // the last few vanish more slowly
const VANISH_LAST_MS = 800;

type Phase = "ready" | "playing" | "done";

/** Flat head-and-shoulders silhouette in the same cartoon style. */
function Silhouette() {
  return (
    <svg className="demo-silhouette" viewBox="0 0 100 100" aria-hidden>
      <circle cx="50" cy="50" r="50" fill="#2b2a33" />
      <circle cx="50" cy="38" r="17" fill="#6f6c7c" />
      <path d="M17 92c3-20 17-31 33-31s30 11 33 31z" fill="#6f6c7c" />
      <text x="50" y="45" textAnchor="middle" fontSize="20" fontWeight="700" fill="#2b2a33" fontFamily="Arial, sans-serif">?</text>
    </svg>
  );
}

export default function IslandDemo({ players }: { players: AdminPlayer[] }) {
  const active = useMemo(() => players.filter((p) => p.active).slice(0, STUMPS.length), [players]);
  const [seats, setSeats] = useState<string[]>([]);      // player id per stump
  const [phase, setPhase] = useState<Phase>("ready");
  const [incog, setIncog] = useState(false);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const byId = useMemo(() => Object.fromEntries(active.map((p) => [p.id, p])), [active]);

  const clearTimers = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };

  // Seat everyone (random stumps), picked in the browser after load.
  const reset = useCallback(() => {
    clearTimers();
    setSeats(shuffled(active.map((p) => p.id)));
    setIncog(false);
    setGone(new Set());
    setPhase("ready");
  }, [active, clearTimers]);
  useEffect(() => { reset(); }, [reset]);
  useEffect(() => clearTimers, [clearTimers]); // stop everything if the tab closes mid-demo

  function play() {
    if (phase === "playing" || seats.length < 2) return;
    clearTimers();
    setIncog(false);
    setGone(new Set());
    setPhase("playing");

    // 1) Everyone turns anonymous, one after another.
    later(HOLD_MS, () => setIncog(true));
    // 2) Then they vanish in random order until one is left.
    const vanishOrder = shuffled(seats).slice(0, seats.length - 1);
    let t = HOLD_MS + seats.length * INCOG_STAGGER_MS + INCOG_FADE_MS + 500;
    vanishOrder.forEach((id, i) => {
      const leftAfter = seats.length - 1 - i;
      t += leftAfter < VANISH_SLOWDOWN_FROM ? VANISH_LAST_MS : VANISH_EVERY_MS;
      later(t, () => setGone((g) => new Set(g).add(id)));
    });
    later(t + 600, () => setPhase("done"));
  }

  return (
    <section className="stage-wrap demo-wrap" aria-labelledby="demo-h">
      <div className="stage-bar">
        <h3 id="demo-h">Demo animation</h3>
        <div className="stage-buttons">
          <button className="btn btn-sm btn-primary" disabled={phase === "playing" || seats.length < 2} onClick={play}>
            {phase === "playing" ? "Playing..." : "▶ Play demo"}
          </button>
          <button className="btn btn-sm" disabled={phase === "ready"} onClick={reset}>Reset</button>
        </div>
      </div>
      <p className="muted small stage-hint">
        Everyone turns into a mystery camper, then they vanish one by one until one is left. Just for show: it doesn&apos;t change the ceremony.
      </p>
      <div className="stage demo-stage">
        <Image src={BG.src} alt="" width={BG.width} height={BG.height} className="stage-bg" />
        {seats.map((id, i) => {
          const p = byId[id];
          if (!p) return null;
          const [x, y] = STUMPS[i];
          return (
            <div key={id} className={`demo-seat${incog ? " incog" : ""}${gone.has(id) ? " gone" : ""}`}
              style={{ left: `${x}%`, top: `${y}%`, width: `${AVATAR_W}%`, zIndex: Math.round(y), "--i": i } as React.CSSProperties}>
              <span className="stage-name demo-name">{islandName(p)}</span>
              <span className="demo-face">
                <Avatar src={p.discord_avatar_url} name={islandName(p)} size={128} />
                <Silhouette />
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

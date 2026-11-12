"use client";
// Candy Island stage: everyone on a stump of the island picture.
// - Players out from earlier rounds are greyed automatically.
// - Click a player to make them safe: a marshmallow is tossed from the
//   campfire and stays beside them, and they grey out. Click again to undo.
// - As the safe count nears "how many should remain", a big overlay counts
//   down the marshmallows left.
// - Hover brings an avatar to the front. Export saves the scene as a PNG.

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { AdminPlayer } from "@/lib/types";
import { displayName } from "@/lib/names";
import { copyElementAsImage, downloadElementAsPng } from "@/lib/copy-image";
import Avatar from "@/components/Avatar";

const BG = { src: "/assets/stumps.png", width: 1672, height: 941 };
const MARSHMALLOW = "/assets/marshmallow.png";

/** Where each avatar's feet go, as % of the picture. Measured from stumps.png (rows of 5, 6, 5). */
const STUMPS: [number, number][] = [
  [18.24, 36.2], [32.18, 36.2], [45.75, 36.2], [59.69, 36.2], [73.68, 36.2],
  [12.38, 52.28], [26.85, 52.21], [41.09, 52.21], [55.02, 52.21], [68.9, 52.21], [82.95, 52.21],
  [16.81, 69.32], [32.12, 69.32], [47.37, 69.29], [62.44, 69.32], [77.87, 69.32],
];
const AVATAR_W = 7.06;            // % of picture width
const FIRE: [number, number] = [86.5, 83]; // campfire, % of picture: where marshmallows are tossed from
const ASPECT = BG.height / BG.width;
/** Show the "marshmallows remain" overlay once this many or fewer are left. */
const COUNTDOWN_FROM = 3;

function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function IslandStage({ players, outIds, safeIds, latestRound, toRemain }: {
  players: AdminPlayer[];
  /** Out in an earlier round: greyed automatically, no marshmallow. */
  outIds: Set<string>;
  /** Drawn (safe) in the latest round, for the quick "give all" button. */
  safeIds: string[];
  latestRound: number | null;
  /** "How many should remain" from the draw box; drives the countdown. */
  toRemain: number;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const fsRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  // Track full screen (it can also be left with Esc). Listener removed on unmount.
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === fsRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await fsRef.current?.requestFullscreen();
    } catch {
      // Browser refused (e.g. not allowed in this frame): nothing to do.
    }
  }
  const [order, setOrder] = useState<string[]>([]);       // player ids, one per stump
  const [safe, setSafe] = useState<Set<string>>(new Set()); // got a marshmallow
  const [tossing, setTossing] = useState<Map<string, number>>(new Map()); // marshmallow in the air → delay (ms)
  const [hover, setHover] = useState<string | null>(null);
  const [status, setStatus] = useState<"" | "exporting" | "copying" | "copied" | "error">("");
  const [capturing, setCapturing] = useState(false); // freezes the stage (no hover, no animation) while drawing the image

  const active = useMemo(() => players.filter((p) => p.active), [players]);
  const byId = useMemo(() => Object.fromEntries(active.map((p) => [p.id, p])), [active]);

  // Random seats, picked in the browser after load. Stable across data refreshes.
  useEffect(() => {
    setOrder((prev) => {
      const ids = active.map((p) => p.id);
      const kept = prev.filter((id) => ids.includes(id));
      const added = shuffled(ids.filter((id) => !kept.includes(id)));
      return kept.length ? [...kept, ...added] : shuffled(ids);
    });
  }, [active]);

  const seated = order.slice(0, STUMPS.length);
  const unseated = order.length - seated.length;
  const seatOf = (id: string) => STUMPS[seated.indexOf(id)];

  // Marshmallow countdown: everyone still on the island except the ones who'll remain gets one.
  const onIsland = active.filter((p) => !outIds.has(p.id));
  const given = onIsland.filter((p) => safe.has(p.id)).length;
  const toGive = onIsland.length - toRemain;
  const left = toGive - given;
  const showCountdown = Number.isInteger(toRemain) && toRemain >= 1 && toGive > 0 && left >= 1 && left <= COUNTDOWN_FROM;

  function give(ids: string[], stagger = 0) {
    const fresh = ids.filter((id) => !safe.has(id) && !outIds.has(id));
    if (!fresh.length) return;
    setSafe((s) => new Set([...s, ...fresh]));
    // Each marshmallow waits at the campfire (invisible) for its turn, then flies.
    setTossing((t) => { const n = new Map(t); fresh.forEach((id, i) => n.set(id, i * stagger)); return n; });
    const total = (fresh.length - 1) * stagger + 750;
    setTimeout(() => {
      setTossing((t) => { const n = new Map(t); fresh.forEach((id) => n.delete(id)); return n; });
      // Toss landed: let go of the player you clicked (they're greyed now, so no hover focus).
      setHover((h) => (h && fresh.includes(h) ? null : h));
      const el = document.activeElement as HTMLElement | null;
      if (el?.classList.contains("stage-seat")) el.blur();
    }, total);
  }

  function toggle(id: string) {
    if (outIds.has(id)) return; // already out: nothing to give
    if (safe.has(id)) setSafe((s) => { const n = new Set(s); n.delete(id); return n; });
    else give([id]);
  }

  async function capture(kind: "export" | "copy") {
    if (!stageRef.current) return;
    setHover(null);
    setTossing(new Map()); // land any marshmallows still in the air
    setCapturing(true);
    setStatus(kind === "export" ? "exporting" : "copying");
    // Wait for React to drop the hover/toss classes; with transitions off they settle instantly.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      if (kind === "export") {
        await downloadElementAsPng(stageRef.current, "candy-island.png", BG.width, BG.height);
        setStatus("");
      } else {
        await copyElementAsImage(stageRef.current);
        setStatus("copied");
      }
    } catch {
      setStatus("error");
    } finally {
      setCapturing(false);
    }
  }

  return (
    <section className="stage-wrap" aria-labelledby="stage-h">
      <div className="stage-bar">
        <h3 id="stage-h">Campfire stage</h3>
        <div className="stage-buttons">
          <button className="btn btn-sm" onClick={toggleFullscreen}>⛶ Full screen</button>
          <button className="btn btn-sm" onClick={() => setOrder(shuffled(active.map((p) => p.id)))}>Shuffle seats</button>
          {latestRound !== null && safeIds.length > 0 && (
            <button className="btn btn-sm" onClick={() => give(safeIds, 120)}>Marshmallows to round {latestRound} safe</button>
          )}
          <button className="btn btn-sm" disabled={safe.size === 0} onClick={() => setSafe(new Set())}>Reset</button>
          <button className="btn btn-sm" disabled={status === "copying" || status === "exporting"} onClick={() => capture("copy")}>
            {status === "copying" ? "Copying..." : status === "copied" ? "Image copied" : "Copy image"}
          </button>
          <button className="btn btn-sm btn-primary" disabled={status === "copying" || status === "exporting"} onClick={() => capture("export")}>
            {status === "exporting" ? "Exporting..." : "Export PNG"}
          </button>
        </div>
      </div>
      <p className="muted small stage-hint">
        Click someone to toss them a marshmallow (click again to take it back). Players out from earlier rounds are greyed.
        {status === "error" && <span className="error"> Couldn&apos;t make the image. Try again.</span>}
        {unseated > 0 && <span className="error"> {unseated} player{unseated === 1 ? "" : "s"} didn&apos;t fit: there are only 16 stumps.</span>}
      </p>

      <div ref={fsRef} className={`stage-fs${fullscreen ? " is-full" : ""}`}>
      {fullscreen && (
        <button className="stage-fs-exit" onClick={toggleFullscreen} aria-label="Exit full screen">✕ Exit full screen (Esc)</button>
      )}
      <div ref={stageRef} className={`stage${capturing ? " capturing" : ""}`} onMouseLeave={() => setHover(null)}>
        <Image src={BG.src} alt="" width={BG.width} height={BG.height} className="stage-bg" priority />
        {seated.map((id) => {
          const p = byId[id];
          const [x, y] = seatOf(id);
          const out = outIds.has(id);
          const isSafe = safe.has(id) && !out;
          // Toss path, from the campfire to this seat, in container units (cqw).
          const dx = FIRE[0] - x;
          const dy = (FIRE[1] - y) * ASPECT;
          const grey = out || isSafe;
          // Greyed players don't get the hover focus, except while their marshmallow is in the air.
          const focused = hover === id && (!grey || tossing.has(id));
          const cls = ["stage-seat", grey && "grey", focused && "focus"].filter(Boolean).join(" ");
          return (
            <button key={id} type="button" className={cls}
              style={{ left: `${x}%`, top: `${y}%`, width: `${AVATAR_W}%`, zIndex: focused ? 100 : Math.round(y) } as React.CSSProperties}
              onMouseEnter={() => !capturing && setHover(id)} onFocus={() => setHover(id)}
              onMouseLeave={() => setHover((h) => (h === id ? null : h))} onBlur={() => setHover((h) => (h === id ? null : h))}
              onClick={() => toggle(id)} aria-pressed={isSafe} aria-disabled={out}
              aria-label={`${displayName(p)}${out ? ", out" : isSafe ? ", safe" : ""}${out ? "" : isSafe ? ". Click to take back the marshmallow" : ". Click to toss a marshmallow"}`}>
              <span className="stage-name">{displayName(p)}</span>
              <Avatar src={p.discord_avatar_url} name={displayName(p)} size={128} />
              {isSafe && (
                <Image src={MARSHMALLOW} alt="" width={64} height={68}
                  className={`stage-mallow${tossing.has(id) ? " toss" : ""}`}
                  style={{ "--dx": `${dx}cqw`, "--dy": `${dy}cqw`, "--delay": `${tossing.get(id) ?? 0}ms` } as React.CSSProperties} />
              )}
            </button>
          );
        })}

        {showCountdown && (
          <p className="stage-countdown" role="status" key={left}>
            {left === 1 ? "1 marshmallow remains" : `${left} marshmallows remain`}
          </p>
        )}
      </div>
      </div>
    </section>
  );
}

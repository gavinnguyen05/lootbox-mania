"use client";
// Candy Island stage: everyone on a stump of the island picture. Players out
// from earlier rounds are greyed automatically; click anyone to grey/ungrey
// them by hand (e.g. while calling names live). Hover brings an avatar to the
// front and fades whatever overlaps it. Export saves the scene as a PNG.

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { AdminPlayer } from "@/lib/types";
import { displayName } from "@/lib/names";
import { copyElementAsImage, downloadElementAsPng } from "@/lib/copy-image";
import Avatar from "@/components/Avatar";

const BG = { src: "/assets/stumps.png", width: 1672, height: 941 };

/** Where each avatar's feet go, as % of the picture. Measured from stumps.png (rows of 5, 6, 5). */
const STUMPS: [number, number][] = [
  [18.24, 36.2], [32.18, 36.2], [45.75, 36.2], [59.69, 36.2], [73.68, 36.2],
  [12.38, 52.28], [26.85, 52.21], [41.09, 52.21], [55.02, 52.21], [68.9, 52.21], [82.95, 52.21],
  [16.81, 69.32], [32.12, 69.32], [47.37, 69.29], [62.44, 69.32], [77.87, 69.32],
];
const AVATAR_W = 7.06;                                // % of picture width
const AVATAR_H = (AVATAR_W * BG.width) / BG.height;   // same size, as % of height
const TAG_H = 3.2;                                    // name tag, % of height
const HOVER_SCALE = 1.3;

function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function IslandStage({ players, outIds, safeIds, latestRound }: {
  players: AdminPlayer[];
  /** Out in an earlier round: greyed automatically. */
  outIds: Set<string>;
  /** Drawn (safe) in the latest round, for the quick "grey safe" button. */
  safeIds: string[];
  latestRound: number | null;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [order, setOrder] = useState<string[]>([]);    // player ids, one per stump
  const [manual, setManual] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<string | null>(null);
  const [status, setStatus] = useState<"" | "exporting" | "copying" | "copied" | "error">("");
  const [capturing, setCapturing] = useState(false); // freezes the stage (no hover, no animation) while drawing the image

  const active = useMemo(() => players.filter((p) => p.active), [players]);
  const byId = useMemo(() => Object.fromEntries(active.map((p) => [p.id, p])), [active]);

  // Random seats, picked in the browser after load (so the server and browser agree on first paint).
  // Keeps seats stable when the page refreshes its data; newcomers get the free stumps.
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

  // Avatars that overlap the hovered (enlarged) one fade out.
  const faded = useMemo(() => {
    if (!hover || !seatOf(hover)) return new Set<string>();
    const [hx, hy] = seatOf(hover);
    const hw = (AVATAR_W * HOVER_SCALE) / 2, hTop = hy - (AVATAR_H + TAG_H) * HOVER_SCALE;
    return new Set(seated.filter((id) => {
      if (id === hover) return false;
      const [x, y] = seatOf(id);
      const top = y - AVATAR_H - TAG_H;
      return Math.abs(x - hx) < hw + AVATAR_W / 2 && top < hy && y > hTop;
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover, order]);

  function toggle(id: string) {
    setManual((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function capture(kind: "export" | "copy") {
    if (!stageRef.current) return;
    setHover(null);
    setCapturing(true);
    setStatus(kind === "export" ? "exporting" : "copying");
    // Wait for React to drop the hover classes; with transitions off they snap back instantly.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      if (kind === "export") {
        await downloadElementAsPng(stageRef.current, "candy-island.png", BG.width);
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
          <button className="btn btn-sm" onClick={() => setOrder(shuffled(active.map((p) => p.id)))}>Shuffle seats</button>
          {latestRound !== null && safeIds.length > 0 && (
            <button className="btn btn-sm" onClick={() => setManual((s) => new Set([...s, ...safeIds]))}>Grey round {latestRound} safe</button>
          )}
          <button className="btn btn-sm" disabled={manual.size === 0} onClick={() => setManual(new Set())}>Reset greys</button>
          <button className="btn btn-sm" disabled={status === "copying" || status === "exporting"} onClick={() => capture("copy")}>
            {status === "copying" ? "Copying..." : status === "copied" ? "Image copied" : "Copy image"}
          </button>
          <button className="btn btn-sm btn-primary" disabled={status === "copying" || status === "exporting"} onClick={() => capture("export")}>
            {status === "exporting" ? "Exporting..." : "Export PNG"}
          </button>
        </div>
      </div>
      <p className="muted small stage-hint">
        Click someone to grey them out (or back). Players out from earlier rounds are greyed automatically.
        {status === "error" && <span className="error"> Couldn&apos;t make the image. Try again.</span>}
        {unseated > 0 && <span className="error"> {unseated} player{unseated === 1 ? "" : "s"} didn&apos;t fit: there are only 16 stumps.</span>}
      </p>

      <div ref={stageRef} className={`stage${capturing ? " capturing" : ""}`} onMouseLeave={() => setHover(null)}>
        <Image src={BG.src} alt="" width={BG.width} height={BG.height} className="stage-bg" priority />
        {seated.map((id) => {
          const p = byId[id];
          const [x, y] = seatOf(id);
          const grey = outIds.has(id) || manual.has(id);
          const cls = ["stage-seat", grey && "grey", hover === id && "focus", faded.has(id) && "faded"].filter(Boolean).join(" ");
          return (
            <button key={id} type="button" className={cls}
              style={{ left: `${x}%`, top: `${y}%`, width: `${AVATAR_W}%`, zIndex: hover === id ? 100 : Math.round(y) } as React.CSSProperties}
              onMouseEnter={() => !capturing && setHover(id)} onFocus={() => setHover(id)} onBlur={() => setHover(null)}
              onClick={() => toggle(id)} aria-pressed={grey}
              aria-label={`${displayName(p)}${outIds.has(id) ? ", out" : ""}. ${manual.has(id) ? "Click to ungrey" : "Click to grey out"}`}>
              <span className="stage-name">{displayName(p)}</span>
              <Avatar src={p.discord_avatar_url} name={displayName(p)} size={128} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

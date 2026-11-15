"use client";
// The Dock of Shame: the latest draw's eliminated players stand on the boat.
// "Reveal player info" shows an about-me card (their sign-up form answers) over
// the scene; arrows switch between them, Hide puts it away.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { AboutMe, AdminPlayer } from "@/lib/types";
import Avatar from "@/components/Avatar";
import { islandName } from "./islandNames";
import { AVATAR_W } from "./islandLayout";

const NAME_MAX = 4; // cqw: biggest the card name gets

/**
 * The player's name, as big as fits on one line (long names shrink instead of
 * breaking mid-word). A hidden copy at full size is measured against the room.
 */
function FitName({ name }: { name: string }) {
  const shown = useRef<HTMLHeadingElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(NAME_MAX);
  useLayoutEffect(() => {
    let cancelled = false;
    const fit = () => {
      if (cancelled || !shown.current || !probe.current) return;
      const room = shown.current.clientWidth;
      const natural = probe.current.offsetWidth;
      setSize(natural > room ? Math.max(1.6, NAME_MAX * (room / natural) * 0.97) : NAME_MAX);
    };
    fit();
    document.fonts?.ready.then(fit); // re-fit once Samdan Evil has loaded
    return () => { cancelled = true; };
  }, [name]);
  return (
    <>
      <span ref={probe} className="about-name about-name-probe" style={{ fontSize: `${NAME_MAX}cqw` }} aria-hidden>{name}</span>
      <h4 ref={shown} className="about-name" style={{ fontSize: `${size.toFixed(2)}cqw` }}>{name}</h4>
    </>
  );
}

const DOCK = { src: "/assets/dock.png", width: 1672, height: 941 };
/** Where players stand on the boat deck (feet, % of the picture), in front of the cabin. */
const BOAT_SPOTS: [number, number][] = [[23.6, 69.6], [33.5, 69.3], [13.5, 70.2], [40.5, 68.9]];

export default function DockScene({ players, eliminatedIds, about }: {
  players: AdminPlayer[];
  eliminatedIds: string[];
  about: { byPlayer: Record<string, AboutMe>; missing: string[] };
}) {
  const byId = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const onBoat = eliminatedIds.filter((id) => byId[id]).slice(0, BOAT_SPOTS.length);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  // New draw: start over on the first player, card closed.
  const key = onBoat.join(",");
  useEffect(() => { setOpen(false); setIndex(0); }, [key]);

  const count = onBoat.length;
  const go = (step: number) => setIndex((i) => (i + step + count) % count);

  // Arrow keys and Esc while the card is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, count]);

  const current = onBoat[Math.min(index, count - 1)];
  const player = current ? byId[current] : undefined;
  const info = current ? about.byPlayer[current] : undefined;

  return (
    <section className="stage-wrap dock-wrap" aria-labelledby="dock-h">
      <div className="stage-bar">
        <h3 id="dock-h">Dock of Shame</h3>
        <div className="stage-buttons">
          {open ? (
            <button className="btn btn-sm" onClick={() => setOpen(false)}>Hide player info</button>
          ) : (
            <button className="btn btn-sm btn-primary" disabled={count === 0} onClick={() => { setIndex(0); setOpen(true); }}>
              Reveal player info
            </button>
          )}
        </div>
      </div>
      {about.missing.length > 0 && (
        <p className="error small stage-hint" role="alert">No form answers matched yet for: {about.missing.join(", ")}.</p>
      )}

      <div className="stage dock-stage">
        <Image src={DOCK.src} alt="" width={DOCK.width} height={DOCK.height} className="stage-bg" />
        {onBoat.map((id, i) => {
          const p = byId[id];
          const [x, y] = BOAT_SPOTS[i];
          return (
            <div key={id} className="dock-seat" style={{ left: `${x}%`, top: `${y}%`, width: `${AVATAR_W * 0.95}%`, zIndex: 10 + i }}>
              <span className="stage-name">{islandName(p)}</span>
              <Avatar src={p.discord_avatar_url} name={islandName(p)} size={128} />
            </div>
          );
        })}

        {open && player && (
          <div className="dock-overlay">
            <article key={current} className="about-card" aria-live="polite" aria-label={`About ${islandName(player)}`}>
              {/* Notebook trim: spiral rings down the left, binder clip on top. Decorative only. */}
              <span className="nb-rings" aria-hidden>{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</span>
              <Image src="/assets/clip.png" alt="" width={1254} height={1254} className="nb-clip" />
              <header className="about-head">
                <Avatar src={player.discord_avatar_url} name={islandName(player)} size={128} />
                <div className="about-who">
                  <FitName name={islandName(player)} />
                  {info && info.formName.toLowerCase() !== islandName(player).toLowerCase() && (
                    <p className="about-real">{info.formName}</p>
                  )}
                </div>
                {count > 1 && (
                  <span className="about-nav">
                    <button className="about-arrow" onClick={() => go(-1)} aria-label="Previous player">‹</button>
                    <span className="about-count">{index + 1} / {count}</span>
                    <button className="about-arrow" onClick={() => go(1)} aria-label="Next player">›</button>
                  </span>
                )}
              </header>
              {info ? (
                <dl className="about-grid">
                  <div className="about-item"><dt>Age</dt><dd>{info.age}</dd></div>
                  <div className="about-item"><dt>Favorite color</dt><dd>{info.color}</dd></div>
                  <div className="about-item"><dt>Favorite food</dt><dd>{info.food}</dd></div>
                  <div className="about-item wide"><dt>Interesting fact</dt><dd>{info.fact}</dd></div>
                  <div className="about-item wide"><dt>With the $30 candy prize</dt><dd>{info.spend}</dd></div>
                  <div className="about-item half"><dt>Favorite derby horse</dt><dd>{info.horse}</dd></div>
                  <div className="about-item half"><dt>Really doesn&apos;t want to win</dt><dd>{info.notWin}</dd></div>
                </dl>
              ) : (
                <p className="about-none">No form answers matched for this player yet.</p>
              )}
            </article>
          </div>
        )}
      </div>
    </section>
  );
}

"use client";
// Foreground layer for the final sequence: dims the stage, then Commandant
// Harrison's arm lifts a tag and flips it to show a camper's name.
// Layers (bottom to top): stage, dim, spotlighted seat, tag, arm (fingers over the tag's top edge).
// Placement knobs are the --fs-* values in admin.css.

import { useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import type { SequenceScene } from "./finalSequence";

const NAME_MAX = 4.2; // cqw: biggest the name gets; shrinks to fit the tag's light panel

/**
 * The name, as big as fits on one line inside the panel. A hidden copy at full
 * size is measured against the room available, so the visible text is never
 * resized behind React's back. Re-measured once Samdan Evil has loaded.
 */
function TagName({ name }: { name: string }) {
  const shown = useRef<HTMLSpanElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState(NAME_MAX);
  useLayoutEffect(() => {
    let cancelled = false;
    const fit = () => {
      if (cancelled || !shown.current || !probe.current) return;
      const room = shown.current.clientWidth;
      const natural = probe.current.offsetWidth;
      setSize(natural > room ? Math.max(1.2, NAME_MAX * (room / natural) * 0.96) : NAME_MAX);
    };
    fit();
    document.fonts?.ready.then(fit);
    return () => { cancelled = true; };
  }, [name]);
  return (
    <>
      <span ref={probe} className="fs-tag-name-probe" style={{ fontSize: `${NAME_MAX}cqw` }} aria-hidden>{name}</span>
      <span ref={shown} className="fs-tag-name" style={{ fontSize: `${size.toFixed(2)}cqw` }} role="status">{name}</span>
    </>
  );
}

export default function FinalSequenceOverlay({ scene, name }: { scene: SequenceScene; name: string }) {
  return (
    <>
      <div className={`fs-dim${scene.dim ? " on" : ""}`} aria-hidden />
      {scene.rig && (
        <div className={`fs-rig at-${scene.rig}`}>
          <div className="fs-tag">
            <div className={`fs-tag-card${scene.flipClosed ? " closed" : ""}`}>
              {scene.side === "back" ? (
                <Image src="/assets/tag-bottom.png" alt="" width={1774} height={887} className="fs-tag-img" priority />
              ) : (
                <>
                  <Image src="/assets/tag-top.png" alt="" width={1774} height={887} className="fs-tag-img" priority />
                  <TagName name={name} />
                </>
              )}
            </div>
            {/* Long version of commandant-arm.png (sleeve extended so it always reaches in from off-screen). */}
            <Image src="/assets/commandant-arm-long.png" alt="" width={3761} height={1560} className="fs-arm" priority />
          </div>
        </div>
      )}
    </>
  );
}

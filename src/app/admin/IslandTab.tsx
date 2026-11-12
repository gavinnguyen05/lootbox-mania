"use client";
// Candy Island: elimination draws. Choose how many should remain, and the
// server draws everyone else in random order. The ones left over are out and
// skip every later round. Undo brings the latest round's left-overs back;
// Start over begins a new game with everyone.

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminPlayer, IslandState } from "@/lib/types";
import { displayName } from "@/lib/names";
import { islandMessage } from "@/lib/candy";
import Avatar from "@/components/Avatar";
import IslandStage from "./IslandStage";
import { islandReset, islandRun, islandUndo, type ActionResult, type IslandActionResult } from "./actions";

export default function IslandTab({ players, island, setFlash }: {
  players: AdminPlayer[];
  island: IslandState;
  setFlash: (f: ActionResult | null) => void;
}) {
  const router = useRouter();
  const [remaining, setRemaining] = useState("2");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // blocks a second click before React re-renders
  const [copied, setCopied] = useState(false);
  const [fresh, setFresh] = useState<number | null>(null); // round just drawn, for the reveal animation

  const active = useMemo(() => players.filter((p) => p.active), [players]);
  const byId = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const outRound = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of island.rounds) for (const id of r.remaining) m[id] = r.round;
    return m;
  }, [island.rounds]);
  const onIsland = active.filter((p) => outRound[p.id] === undefined);
  const latestRound = island.rounds[island.rounds.length - 1];
  // On the stage: earlier rounds' left-overs are out (greyed); the latest draw's are at risk this ceremony.
  const stageOutIds = useMemo(
    () => new Set(island.rounds.slice(0, -1).flatMap((r) => r.remaining)),
    [island.rounds],
  );
  // Locked while the stage's final sequence runs, so nothing can change the round underneath it.
  const [locked, setLocked] = useState(false);
  const latest = island.rounds[island.rounds.length - 1];
  const n = Number(remaining);
  const nOk = Number.isInteger(n) && n >= 1 && n < onIsland.length;
  const name = (id: string) => (byId[id] ? displayName(byId[id]) : "Removed player");

  async function run(task: () => Promise<IslandActionResult>, onOk?: (res: IslandActionResult) => void) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFlash(null);
    try {
      const res = await task();
      if (!res.ok || res.notice) setFlash(res);
      if (res.ok) onOk?.(res);
      router.refresh();
    } catch {
      setFlash({ ok: false, error: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const draw = () => nOk && run(() => islandRun(n, crypto.randomUUID()), (res) => { setFresh(res.round ?? null); setCopied(false); });
  const undo = () => latest && confirm(`Undo round ${latest.round}? ${latest.remaining.map(name).join(", ")} will be back on the island.`) &&
    run(() => islandUndo(), () => setFresh(null));
  const reset = () => confirm("Start a new game? Everyone goes back on the island. Past games stay in the Activity log.") &&
    run(() => islandReset(), () => setFresh(null));

  async function copy() {
    if (!latest) return;
    const discord = (ids: string[]) => ids.map((id) => byId[id]?.discord_user_id ?? id);
    await navigator.clipboard.writeText(islandMessage(latest.round, discord(latest.picked), discord(latest.remaining)));
    setCopied(true);
  }

  return (
    <div className="isl">
      <div className="isl-top">
        <div>
          <h2 className="isl-title">🏝️ Candy Island <span className="isl-game">Game {island.season}</span></h2>
          <p className="isl-count"><strong>{onIsland.length}</strong> of {active.length} still on the island</p>
        </div>
        <div className="isl-top-actions">
          <button className="btn btn-danger" disabled={busy || locked || !latest} onClick={undo}>Undo last round</button>
          <button className="btn" disabled={busy || locked || island.rounds.length === 0} onClick={reset}>Start over</button>
        </div>
      </div>

      <div className="isl-grid">
        <div className="isl-left">
          <section className="isl-control" aria-labelledby="isl-control-h">
            <h3 id="isl-control-h">Round {island.rounds.length + 1}</h3>
            <div className="isl-control-row">
              <div className="field">
                <label htmlFor="isl-remaining">How many should remain?</label>
                <input id="isl-remaining" className="input isl-number" type="number" inputMode="numeric" min={1} max={Math.max(1, onIsland.length - 1)}
                  value={remaining} onChange={(e) => setRemaining(e.target.value)} />
              </div>
              <button className="btn btn-big isl-draw" disabled={busy || locked || !nOk} onClick={draw}>
                {busy ? "Drawing..." : "🌴 Run draw"}
              </button>
            </div>
            <p className="muted small">
              {onIsland.length < 2 ? "Not enough players left for another round. Start over for a new game."
                : nOk ? `Draws ${onIsland.length - n} name${onIsland.length - n === 1 ? "" : "s"} in random order. The last ${n} left over ${n === 1 ? "is" : "are"} out.`
                : `Enter a number from 1 to ${onIsland.length - 1}.`}
            </p>
          </section>

          {latest && (
            <section className="isl-result" aria-labelledby="isl-result-h">
              <div className="discord-head">
                <h3 id="isl-result-h">Round {latest.round} results</h3>
                <button className="btn btn-sm btn-primary" onClick={copy}>{copied ? "Copied" : "Copy for Discord"}</button>
              </div>
              <ol className={`isl-order${fresh === latest.round ? " reveal" : ""}`}>
                {latest.picked.map((id, i) => (
                  <li key={id} style={{ "--i": i } as React.CSSProperties}>
                    <span className="isl-pos">{i + 1}.</span>
                    <Avatar src={byId[id]?.discord_avatar_url ?? null} name={name(id)} size={28} />
                    <span className="isl-name">{name(id)}</span>
                  </li>
                ))}
              </ol>
              <div className={`isl-left-over${fresh === latest.round ? " reveal" : ""}`} style={{ "--i": latest.picked.length } as React.CSSProperties}>
                <p className="isl-left-over-title">Remaining ({latest.remaining.length}), out of the island</p>
                <ul>
                  {latest.remaining.map((id) => (
                    <li key={id}>
                      <Avatar src={byId[id]?.discord_avatar_url ?? null} name={name(id)} size={28} />
                      <span className="isl-name">{name(id)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {island.rounds.length > 1 && (
            <section className="panel" aria-labelledby="isl-history-h">
              <h3 id="isl-history-h" className="mini-title">Earlier rounds</h3>
              <ul className="isl-history">
                {island.rounds.slice(0, -1).reverse().map((r) => (
                  <li key={r.id}><strong>Round {r.round}:</strong> <span className="muted">out:</span> {r.remaining.map(name).join(", ")}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <section className="isl-roster" aria-labelledby="isl-roster-h">
          <h3 id="isl-roster-h">Islanders</h3>
          <ul>
            {/* Still on the island first (A-Z), then the out players in the order they went out. */}
            {[...active].sort((a, b) => (outRound[a.id] ?? 0) - (outRound[b.id] ?? 0) || displayName(a).localeCompare(displayName(b)))
              .map((p) => {
                const out = outRound[p.id];
                return (
                  <li key={p.id} className={out !== undefined ? "out" : undefined}>
                    <Avatar src={p.discord_avatar_url} name={displayName(p)} size={30} />
                    <span className="isl-name">{displayName(p)}</span>
                    {out !== undefined ? <span className="isl-out-tag">Out R{out}</span> : <span className="isl-in-tag">On island</span>}
                  </li>
                );
              })}
          </ul>
        </section>
      </div>

      <IslandStage players={players} outIds={stageOutIds} atRiskIds={latestRound?.remaining ?? []}
        safeIds={latest?.picked ?? []} latestRound={latest?.round ?? null} toRemain={n} onLockChange={setLocked} />
    </div>
  );
}

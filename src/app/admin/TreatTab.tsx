"use client";
// Trick-or-treating: pick a neighbor and an escaped player, roll, copy the
// neighbor's line for Discord, then copy the candy leaderboard and paste it
// over the leaderboard message. The database picks outcomes and enforces
// 1 treat per claim window. Styled differently from Open Lootbox on purpose:
// player tiles + a doorstep panel, and a Discord-look leaderboard.

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { AdminPlayer, Neighbor, TreatRow } from "@/lib/types";
import { displayName } from "@/lib/names";
import { LEADERBOARD_MESSAGE_URL, LEADERBOARD_TITLE, leaderboardText, rankCandy, treatMessagePlain } from "@/lib/candy";
import Avatar from "@/components/Avatar";
import { grantTreat, rerollTreat, setCandy, trickOrTreat, undoTreat, type ActionResult, type TreatActionResult } from "./actions";

const TREATS_PER_WINDOW = 1;

/** Last candy change you made, shown on the leaderboard as "152 → 156". */
type Change = { playerId: string; from: number; to: number };

export default function TreatTab({ players, neighbors, treats, treatsUsed, setFlash }: {
  players: AdminPlayer[];
  neighbors: Neighbor[];
  treats: TreatRow[];
  treatsUsed: Record<string, number>;
  setFlash: (f: ActionResult | null) => void;
}) {
  const router = useRouter();
  const [neighborId, setNeighborId] = useState(neighbors[0]?.id ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<TreatActionResult | null>(null);
  const [change, setChange] = useState<Change | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // blocks a second click before React re-renders
  const [copied, setCopied] = useState<"message" | "leaderboard" | null>(null);
  // Leaderboard text returned by the last action, used until the page data refreshes.
  const [freshBoard, setFreshBoard] = useState<string | null>(null);
  useEffect(() => setFreshBoard(null), [players]);

  const active = useMemo(() => players.filter((p) => p.active), [players]);
  const ranked = useMemo(() => rankCandy(active), [active]);
  const escaped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return active
      .filter((p) => p.lootbox_status === "escaped")
      .filter((p) => !needle || [p.discord_display_name, p.discord_username].some((s) => s?.toLowerCase().includes(needle)))
      .sort((a, b) => displayName(a).localeCompare(displayName(b)));
  }, [active, query]);
  const selected = active.find((p) => p.id === selectedId && p.lootbox_status === "escaped") ?? null;
  const neighbor = neighbors.find((n) => n.id === neighborId) ?? neighbors[0];
  // Regular treat (if unused this window) + bonus treats.
  const leftFor = (id: string) => {
    const p = active.find((x) => x.id === id);
    return Math.max(0, TREATS_PER_WINDOW - (treatsUsed[id] ?? 0)) + (p?.bonus_treats ?? 0);
  };
  const hasTreat = selected ? treats.some((t) => t.player_id === selected.id && !t.undone) : false;
  const shown = result?.result && selected && result.result.player_id === selected.id ? result : null;
  const board = freshBoard ?? leaderboardText(players);

  async function run(task: () => Promise<TreatActionResult>, onOk?: (res: TreatActionResult) => void) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFlash(null);
    setCopied(null);
    try {
      const res = await task();
      if (!res.ok) setFlash(res);
      else {
        if (res.notice) setFlash(res);
        if (res.leaderboard) setFreshBoard(res.leaderboard);
        onOk?.(res);
      }
      router.refresh();
    } catch {
      setFlash({ ok: false, error: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // A treat (or reroll) result: total before = new total - candy from this treat.
  function showTreat(res: TreatActionResult) {
    setResult(res);
    const r = res.result;
    if (r) setChange({ playerId: r.player_id, from: r.total - r.candy, to: r.total });
  }

  const treat = () => selected && neighbor && run(() => trickOrTreat(selected.id, neighbor.id, crypto.randomUUID()), showTreat);
  const reroll = () => selected && run(() => rerollTreat(selected.id, crypto.randomUUID()), showTreat);
  const changeBonus = (delta: 1 | -1) => selected && run(() => grantTreat(selected.id, delta));
  const undo = () => selected && confirm(`Undo ${displayName(selected)}'s last treat?`) &&
    run(() => undoTreat(selected.id), () => { setResult(null); setChange(null); });

  function editCandy(p: AdminPlayer) {
    const input = prompt(`Set ${displayName(p)}'s candy total:`, String(p.candy));
    if (input === null) return;
    const amount = Number(input.trim());
    if (!Number.isInteger(amount) || amount < 0) {
      setFlash({ ok: false, error: "Enter a whole number, 0 or more." });
      return;
    }
    run(() => setCandy(p.id, amount), () => setChange({ playerId: p.id, from: p.candy, to: amount }));
  }

  async function copy(text: string, what: "message" | "leaderboard") {
    await navigator.clipboard.writeText(text);
    setCopied(what);
  }

  if (!neighbor) {
    return <div className="panel empty-state"><p>No neighbors set up yet. Run 0004_trick_or_treat.sql in Supabase.</p></div>;
  }

  return (
    <div className="tt">
      <div className="tt-grid">
        {/* ---------- Left: neighbor, players, doorstep ---------- */}
        <div className="tt-left">
          <div className="tt-neighbor">
            <label htmlFor="tt-neighbor" className="tt-label">Neighbor</label>
            <select id="tt-neighbor" className="input tt-select" value={neighbor.id}
              onChange={(e) => { setNeighborId(e.target.value); setResult(null); }}>
              {neighbors.map((n) => <option key={n.id} value={n.id}>{n.flag} {n.name}</option>)}
            </select>
            <ul className="tt-odds" aria-label={`${neighbor.name}'s odds`}>
              {[...neighbor.neighbor_outcomes].sort((a, b) => a.sort_order - b.sort_order).map((o) => (
                <li key={o.sort_order}><strong>{o.candy}</strong> <span>{Number(o.weight)}%</span></li>
              ))}
            </ul>
          </div>

          <section className="tt-players" aria-labelledby="tt-players-h">
            <div className="tt-players-head">
              <h3 id="tt-players-h">Who&apos;s knocking?</h3>
              <input className="input tt-search" type="search" placeholder="Search" aria-label="Search escaped players"
                value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            {escaped.length === 0 ? (
              <p className="empty">{query ? "No players found." : "No escaped players yet. Only escaped players can trick-or-treat."}</p>
            ) : (
              <ul className="tt-tiles">
                {escaped.map((p) => {
                  const ready = leftFor(p.id) > 0;
                  return (
                    <li key={p.id}>
                      <button className={`tt-tile${p.id === selected?.id ? " active" : ""}${ready ? "" : " used"}`}
                        aria-pressed={p.id === selected?.id}
                        onClick={() => { setSelectedId(p.id); setResult(null); setFlash(null); }}>
                        <Avatar src={p.discord_avatar_url} name={displayName(p)} size={40} />
                        <span className="tt-tile-name" title={displayName(p)}>{displayName(p)}</span>
                        <span className="tt-tile-meta">
                          <span className="tt-tile-candy">{p.candy}</span>
                          <span className={`tt-dot${ready ? " ready" : ""}`}>{ready ? (p.bonus_treats > 0 ? `Ready +${p.bonus_treats}` : "Ready") : "Done"}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {selected && (
            <section className="tt-door" aria-label={`${displayName(selected)} at ${neighbor.name}'s door`}>
              <div className="tt-door-head">
                <Avatar src={selected.discord_avatar_url} name={displayName(selected)} size={48} />
                <div className="tt-door-who">
                  <h2>{displayName(selected)}</h2>
                  <p>
                    {leftFor(selected.id) === 0 ? "Already trick-or-treated this window"
                      : leftFor(selected.id) === 1 ? "1 treat ready" : `${leftFor(selected.id)} treats ready`}
                    {selected.bonus_treats > 0 && <span className="tt-bonus-note"> (incl. {selected.bonus_treats} bonus)</span>}
                  </p>
                </div>
              </div>
              <div className="tt-bonus">
                <span>
                  Bonus treats: <strong>{selected.bonus_treats}</strong>
                  <span className="muted"> for requests made before a reset. Never expire.</span>
                </span>
                <span className="tt-bonus-buttons">
                  <button className="btn btn-sm" disabled={busy || selected.bonus_treats < 1} onClick={() => changeBonus(-1)} aria-label="Remove one bonus treat">−1</button>
                  <button className="btn btn-sm tt-bonus-add" disabled={busy} onClick={() => changeBonus(1)}>+1 treat</button>
                </span>
              </div>
              <div className="tt-actions">
                <button className="btn btn-big tt-knock" disabled={busy || leftFor(selected.id) < 1} onClick={treat}>
                  {busy ? "Knocking..." : <>🎃 Knock on {neighbor.name}&apos;s door</>}
                </button>
                <div className="tt-secondary">
                  <button className="btn" disabled={busy || !hasTreat} onClick={reroll}>Reroll last</button>
                  <button className="btn btn-danger" disabled={busy || !hasTreat} onClick={undo}>Undo last</button>
                </div>
              </div>

              {shown?.result && (
                <div className="tt-result">
                  <Image src="/assets/lootbox-mania-logo.png" alt="" width={72} height={72} className="tt-candy" />
                  <div>
                    <p className="tt-amount">+{shown.result.candy} candy</p>
                    <p className="tt-line"><span aria-hidden>{shown.result.flag}</span> <strong>{shown.result.neighbor}:</strong> {treatMessagePlain(shown.result.message)}</p>
                    {shown.result.replayed && <p className="muted small">Already rolled. Showing the saved result.</p>}
                  </div>
                </div>
              )}
              {shown?.discordText && (
                <div className="tt-copy">
                  <textarea className="input discord-text" readOnly aria-label="Discord message" rows={2} value={shown.discordText} />
                  <button className="btn btn-sm btn-primary" onClick={() => copy(shown.discordText ?? "", "message")}>
                    {copied === "message" ? "Copied" : "Copy message"}
                  </button>
                </div>
              )}
            </section>
          )}
        </div>

        {/* ---------- Right: Discord-look leaderboard ---------- */}
        <section className="tt-board" aria-labelledby="tt-board-h">
          <div className="tt-board-bar">
            <a className="btn btn-sm" href={LEADERBOARD_MESSAGE_URL} target="_blank" rel="noopener noreferrer">Open message ↗</a>
            <button className="btn btn-sm btn-orange" onClick={() => copy(board, "leaderboard")}>
              {copied === "leaderboard" ? "Leaderboard copied" : "Copy leaderboard"}
            </button>
          </div>
          <div className="dc-message">
            <h3 id="tt-board-h" className="dc-title">
              <Image src="/assets/lootbox-mania-logo.png" alt="" width={22} height={22} className="dc-candy" />
              <span>{LEADERBOARD_TITLE}</span>:
            </h3>
            <ol className="dc-list">
              {ranked.map((p, i) => {
                const changed = change?.playerId === p.id ? change : null;
                return (
                  <li key={p.id} className={changed ? "changed" : undefined}>
                    <span className="dc-rank">#{i + 1}.</span>{" "}
                    <span className="dc-mention" title={displayName(p)}>@{displayName(p)}</span>
                    <span className="dc-amount">
                      {" - "}
                      {changed ? (
                        <>
                          <span className="dc-old">{changed.from}</span>
                          <span aria-hidden> → </span>
                          <span className="sr-only"> changed to </span>
                          <strong>{changed.to}</strong>
                          <span className={`dc-delta${changed.to < changed.from ? " down" : ""}`}>
                            {changed.to >= changed.from ? "+" : ""}{changed.to - changed.from}
                          </span>
                        </>
                      ) : p.candy}
                    </span>{" "}
                    <Image src="/assets/lootbox-mania-logo.png" alt="candy" width={18} height={18} className="dc-candy" />
                    <button className="dc-edit" onClick={() => editCandy(p)} aria-label={`Set ${displayName(p)}'s candy`}>Edit</button>
                  </li>
                );
              })}
            </ol>
          </div>
          <p className="muted small tt-hint">Copy it, open the message, click Edit, select all, paste, and save.</p>
        </section>
      </div>
    </div>
  );
}

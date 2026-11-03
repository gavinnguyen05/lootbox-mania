"use client";
// Trick-or-treating: pick a neighbor and an escaped player, roll, copy the
// neighbor's line for Discord, then copy the updated candy leaderboard and
// paste it over the leaderboard message. Every change goes through a server
// action; the database picks outcomes and enforces the 2-per-window limit.

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { AdminPlayer, Item, Neighbor, TreatRow } from "@/lib/types";
import { displayName } from "@/lib/names";
import { LEADERBOARD_MESSAGE_URL, leaderboardText, rankCandy, treatMessagePlain } from "@/lib/candy";
import Avatar from "@/components/Avatar";
import PlayerPicker from "./PlayerPicker";
import { rerollTreat, setCandy, trickOrTreat, undoTreat, type ActionResult, type TreatActionResult } from "./actions";

const TREATS_PER_WINDOW = 2;

export default function TreatTab({ players, items, neighbors, treats, treatsUsed, setFlash }: {
  players: AdminPlayer[];
  items: Item[];
  neighbors: Neighbor[];
  treats: TreatRow[];
  treatsUsed: Record<string, number>;
  setFlash: (f: ActionResult | null) => void;
}) {
  const router = useRouter();
  const [neighborId, setNeighborId] = useState(neighbors[0]?.id ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<TreatActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // blocks a second click before React re-renders
  const [copied, setCopied] = useState<"message" | "leaderboard" | null>(null);
  // Leaderboard text returned by the last action, used until the page data refreshes.
  const [freshBoard, setFreshBoard] = useState<string | null>(null);
  useEffect(() => setFreshBoard(null), [players]);

  const active = players.filter((p) => p.active);
  const escaped = active.filter((p) => p.lootbox_status === "escaped");
  const ranked = useMemo(() => rankCandy(active), [active]);
  const rankOf = (id: string) => ranked.findIndex((p) => p.id === id) + 1;
  const selected = escaped.find((p) => p.id === selectedId) ?? null;
  const neighbor = neighbors.find((n) => n.id === neighborId) ?? neighbors[0];
  const left = selected ? Math.max(0, TREATS_PER_WINDOW - (treatsUsed[selected.id] ?? 0)) : 0;
  const hasTreat = selected ? treats.some((t) => t.player_id === selected.id && !t.undone) : false;
  const shown = result?.result && selected && result.result.player_id === selected.id ? result : null;
  const board = freshBoard ?? leaderboardText(players);

  async function run(task: () => Promise<TreatActionResult>, keepResult = true) {
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
        if (keepResult) setResult(res.result ? res : null);
        if (res.leaderboard) setFreshBoard(res.leaderboard);
      }
      router.refresh();
    } catch {
      setFlash({ ok: false, error: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const treat = () => selected && neighbor && run(() => trickOrTreat(selected.id, neighbor.id, crypto.randomUUID()));
  const reroll = () => selected && run(() => rerollTreat(selected.id, crypto.randomUUID()));
  const undo = () => selected && confirm(`Undo ${displayName(selected)}'s last treat?`) &&
    run(async () => { const r = await undoTreat(selected.id); setResult(null); return r; }, false);
  function editCandy(p: AdminPlayer) {
    const input = prompt(`Set ${displayName(p)}'s candy total:`, String(p.candy));
    if (input === null) return;
    const amount = Number(input.trim());
    if (!Number.isInteger(amount) || amount < 0) {
      setFlash({ ok: false, error: "Enter a whole number, 0 or more." });
      return;
    }
    run(() => setCandy(p.id, amount), false);
  }

  async function copy(text: string, what: "message" | "leaderboard") {
    await navigator.clipboard.writeText(text);
    setCopied(what);
  }

  if (!neighbor) {
    return <div className="panel empty-state"><p>No neighbors set up yet. Run 0004_trick_or_treat.sql in Supabase.</p></div>;
  }

  return (
    <div className="treat-tab">
      <div className="neighbor-bar">
        <div className="neighbor-switch" role="radiogroup" aria-label="Neighbor">
          {neighbors.map((n) => (
            <button key={n.id} role="radio" aria-checked={n.id === neighbor.id}
              className={`neighbor-option${n.id === neighbor.id ? " active" : ""}`} onClick={() => setNeighborId(n.id)}>
              <span aria-hidden>{n.flag}</span> {n.name}
            </button>
          ))}
        </div>
        <p className="neighbor-odds">
          {[...neighbor.neighbor_outcomes].sort((a, b) => a.sort_order - b.sort_order).map((o) => (
            <span key={o.sort_order}>{o.candy} candy <span className="muted">{Number(o.weight)}%</span></span>
          ))}
        </p>
      </div>

      <div className="admin-grid">
        <PlayerPicker players={escaped} items={items} selectedId={selected?.id ?? null}
          onSelect={(id) => { setSelectedId(id); setResult(null); setFlash(null); }}
          emptyText="No escaped players yet. Only escaped players can trick-or-treat."
          meta={(p) => {
            const l = Math.max(0, TREATS_PER_WINDOW - (treatsUsed[p.id] ?? 0));
            return <><span className="candy-count">{p.candy}</span><span className={`treat-pill${l > 0 ? " ready" : ""}`}>{l} left</span></>;
          }} />

        <div className="open-main">
          {!selected ? (
            <div className="panel empty-state"><p>Pick an escaped player to trick-or-treat.</p></div>
          ) : (
            <>
              <div className="panel open-head">
                <Avatar src={selected.discord_avatar_url} name={displayName(selected)} size={64} />
                <div className="open-id">
                  <h2>{displayName(selected)}</h2>
                  <p className="treat-standing">#{rankOf(selected.id)} on the leaderboard, <strong>{selected.candy}</strong> candy</p>
                </div>
                <div className={`boxes-left${left === 0 ? " none" : ""}`}>
                  <span className="boxes-num">{left}</span>
                  <span className="muted small">treats left now</span>
                </div>
              </div>

              <div className="open-actions">
                <button className="btn btn-primary btn-big" disabled={busy || left < 1} onClick={treat}>
                  {busy ? "Knocking..." : `Trick or Treat at ${neighbor.name}'s`}
                </button>
                <button className="btn btn-orange btn-big" disabled={busy || !hasTreat} onClick={reroll}>Reroll last</button>
                <button className="btn btn-danger" disabled={busy || !hasTreat} onClick={undo}>Undo last</button>
              </div>

              {shown?.result && (
                <>
                  <div className="panel treat-result">
                    <Image src="/assets/lootbox-mania-logo.png" alt="" width={96} height={96} className="treat-candy" />
                    <div>
                      <p className="treat-amount">+{shown.result.candy} candy</p>
                      <p className="treat-line"><span aria-hidden>{shown.result.flag}</span> <strong>{shown.result.neighbor}:</strong> {treatMessagePlain(shown.result.message)}</p>
                      <p className="treat-total">New total: <strong>{shown.result.total}</strong>{shown.result.replayed ? " (already rolled, showing the saved result)" : ""}</p>
                    </div>
                  </div>
                  <div className="panel discord-box">
                    <div className="discord-head">
                      <h3>For Discord</h3>
                      <button className="btn btn-sm btn-primary" onClick={() => copy(shown.discordText ?? "", "message")}>
                        {copied === "message" ? "Copied" : "Copy message"}
                      </button>
                    </div>
                    <textarea className="input discord-text" readOnly aria-label="Discord message" rows={3} value={shown.discordText ?? ""} />
                  </div>
                </>
              )}
            </>
          )}

          <section className="panel candy-board" aria-labelledby="candy-board-h">
            <div className="discord-head">
              <h3 id="candy-board-h">Candy Leaderboard</h3>
              <div className="discord-buttons">
                <a className="btn btn-sm" href={LEADERBOARD_MESSAGE_URL} target="_blank" rel="noopener noreferrer">Open message ↗</a>
                <button className="btn btn-sm btn-orange" onClick={() => copy(board, "leaderboard")}>
                  {copied === "leaderboard" ? "Leaderboard copied" : "Copy leaderboard"}
                </button>
              </div>
            </div>
            <p className="muted small hint">Copy, open the message, click Edit, select all, paste, and save.</p>
            <ol className="candy-list">
              {ranked.map((p, i) => (
                <li key={p.id} className={p.id === selected?.id ? "current" : undefined}>
                  <span className="candy-rank">#{i + 1}</span>
                  <span className="candy-name">{displayName(p)}</span>
                  <span className="candy-total">{p.candy}</span>
                  <button className="btn btn-sm candy-edit" onClick={() => editCandy(p)} aria-label={`Set ${displayName(p)}'s candy`}>Edit</button>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

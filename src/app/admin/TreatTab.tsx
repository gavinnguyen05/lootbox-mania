"use client";
// Trick-or-treating: pick a neighbor and an escaped player, roll, copy the
// neighbor's line for Discord, then copy the candy leaderboard and paste it
// over the leaderboard message. The database picks outcomes and enforces
// 1 treat per claim window. Styled differently from Open Lootbox on purpose:
// a doorstep console on top (keyboard: arrows, Enter, C, L, I), compact
// player tiles under it, and a Discord-look leaderboard.

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { AdminPlayer, Neighbor, TreatRow } from "@/lib/types";
import { displayName } from "@/lib/names";
import { LIATAO_MULTIPLIER, leaderboardText, treatMessagePlain } from "@/lib/candy";
import Avatar from "@/components/Avatar";
import CandyBoard from "./CandyBoard";
import { copyImageFile } from "@/lib/copy-image";
import { addTreatPlayer, grantTreat, rerollTreat, setCandy, trickOrTreat, undoTreat, type ActionResult, type TreatActionResult } from "./actions";

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
  const [copied, setCopied] = useState(false);
  const [boardCopied, setBoardCopied] = useState(false);
  const [newId, setNewId] = useState("");
  const [newCandy, setNewCandy] = useState("0");
  // Leaderboard text returned by the last action, used until the page data refreshes.
  const [freshBoard, setFreshBoard] = useState<string | null>(null);
  useEffect(() => setFreshBoard(null), [players]);

  const active = useMemo(() => players.filter((p) => p.active), [players]);
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
    setCopied(false);
    setBoardCopied(false);
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
  // The message is copied right away (step 1 done); the leaderboard is step 2.
  function showTreat(res: TreatActionResult) {
    setResult(res);
    const r = res.result;
    if (r) setChange({ playerId: r.player_id, from: r.total - r.candy, to: r.total });
    if (res.discordText) navigator.clipboard.writeText(res.discordText).then(() => setCopied(true), () => {});
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

  // Some outcomes come with an image to post too (e.g. Mousey's 4%).
  const [imageCopied, setImageCopied] = useState<"" | "done" | "error">("");
  useEffect(() => setImageCopied(""), [result]);
  async function copyAttached(path: string) {
    try {
      await copyImageFile(path);
      setImageCopied("done");
    } catch {
      setImageCopied("error");
    }
  }

  async function copyMessage(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
  }

  async function copyBoard() {
    await navigator.clipboard.writeText(board);
    setBoardCopied(true);
  }

  // Pick a player (click, arrows); clears the last result.
  const tilesRef = useRef<HTMLUListElement>(null);
  function pick(id: string, focus = false) {
    setSelectedId(id); setResult(null); setFlash(null);
    if (focus) {
      const btn = tilesRef.current?.querySelector<HTMLButtonElement>(`[data-id="${id}"]`);
      btn?.focus({ preventScroll: true });
      btn?.scrollIntoView({ block: "nearest" });
    }
  }

  // Keyboard: arrows pick a player, Enter knocks, C copies the message,
  // L the leaderboard, I the image. Ignored while typing in a field.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const el = document.activeElement as HTMLElement | null;
    const tag = el?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
    const k = e.key.toLowerCase();
    if (k.startsWith("arrow")) {
      if (escaped.length === 0) return;
      e.preventDefault();
      const cols = tilesRef.current ? getComputedStyle(tilesRef.current).gridTemplateColumns.split(" ").length : 1;
      const at = escaped.findIndex((p) => p.id === selected?.id);
      const step = { arrowleft: -1, arrowright: 1, arrowup: -cols, arrowdown: cols }[k] ?? 0;
      const next = at < 0 ? 0 : Math.min(escaped.length - 1, Math.max(0, at + step));
      pick(escaped[next].id, true);
      return;
    }
    if (e.repeat) return;
    if (k === "enter") {
      // A focused player tile counts as "on the board"; other buttons keep Enter.
      if ((tag === "BUTTON" && !el?.classList.contains("tt-tile")) || tag === "A" || tag === "SUMMARY") return;
      e.preventDefault();
      if (selected && !busy && leftFor(selected.id) > 0) treat();
    } else if (k === "c" && shown?.discordText) {
      e.preventDefault(); copyMessage(shown.discordText);
    } else if (k === "l") {
      e.preventDefault(); copyBoard();
    } else if (k === "i" && shown?.result?.attach_image) {
      e.preventDefault(); copyAttached(shown.result.attach_image);
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!neighbor) {
    return <div className="panel empty-state"><p>No neighbors set up yet. Run 0004_trick_or_treat.sql in Supabase.</p></div>;
  }

  return (
    <div className="tt">
      <div className="tt-grid">
        {/* ---------- Left: neighbor, players, doorstep ---------- */}
        <div className="tt-left">
          <div className="tt-neighbor">
            <div className="tt-neighbor-pick">
              {neighbor.icon_path
                ? <Image src={neighbor.icon_path} alt="" width={48} height={48} className="tt-neighbor-icon" />
                : <span className="tt-neighbor-flag" aria-hidden>{neighbor.flag}</span>}
              <div className="tt-neighbor-field">
                <label htmlFor="tt-neighbor" className="tt-label">Neighbor</label>
                <select id="tt-neighbor" className="input tt-select" value={neighbor.id}
                  onChange={(e) => { setNeighborId(e.target.value); setResult(null); }}>
                  {neighbors.map((n) => <option key={n.id} value={n.id}>{n.flag ? `${n.flag} ` : ""}{n.name}</option>)}
                </select>
              </div>
            </div>
            {/* Payout table: one column per tier, candy on top, chance underneath. */}
            <table className="tt-odds">
              <caption className="sr-only">{neighbor.name}&apos;s odds</caption>
              <tbody>
                <tr>
                  <th scope="row">Candy</th>
                  {[...neighbor.neighbor_outcomes].sort((a, b) => a.sort_order - b.sort_order).map((o) => <td key={o.sort_order}>{o.candy}</td>)}
                </tr>
                <tr>
                  <th scope="row">Chance</th>
                  {[...neighbor.neighbor_outcomes].sort((a, b) => a.sort_order - b.sort_order).map((o) => <td key={o.sort_order}>{Number(o.weight)}%</td>)}
                </tr>
              </tbody>
            </table>
          </div>

          {/* ---------- Doorstep console: who, knock, result, copy. Always here, above the players. ---------- */}
          <section className="tt-door" aria-label={selected ? `${displayName(selected)} at ${neighbor.name}'s door` : "Doorstep"}>
            <div className="tt-door-top">
              {selected ? (
                <div className="tt-door-who">
                  <Avatar src={selected.discord_avatar_url} name={displayName(selected)} size={40} />
                  <div>
                    <h2>{displayName(selected)}
                      {selected.liatao && <Image src="/assets/liatao.png" alt="Latiao boost" title={`Latiao boost x${LIATAO_MULTIPLIER}`} width={64} height={64} className="liatao-icon" />}
                    </h2>
                    <p className={leftFor(selected.id) > 0 ? "ready" : undefined}>
                      {leftFor(selected.id) === 0 ? "Done this window"
                        : leftFor(selected.id) === 1 ? "1 treat ready" : `${leftFor(selected.id)} treats ready`}
                      {selected.bonus_treats > 0 && ` (${selected.bonus_treats} bonus)`}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="tt-door-empty">Pick a player below, or use the arrow keys.</p>
              )}
              <button className="btn btn-big tt-knock" disabled={!selected || busy || leftFor(selected.id) < 1} onClick={treat}>
                <kbd className="tt-key tt-key-wide" aria-hidden>↵</kbd>
                {busy ? "Knocking..." : `Knock on ${neighbor.name}'s door`}
              </button>
            </div>

            {shown?.result && (
              <div className="tt-result">
                <div className="tt-result-main">
                  <p className="tt-amount">+{shown.result.candy}</p>
                  <div className="tt-result-text">
                    <p className="tt-line">
                      {neighbor.id === shown.result.neighbor_id && neighbor.icon_path
                        ? <Image src={neighbor.icon_path} alt="" width={22} height={22} className="tt-line-icon" />
                        : <span aria-hidden>{shown.result.flag}</span>}{" "}
                      {treatMessagePlain(shown.result.message)}
                    </p>
                    {shown.result.boosted && (
                      <p className="liatao-note"><Image src="/assets/liatao.png" alt="" width={64} height={64} className="liatao-icon" /> {shown.result.base_candy} x {LIATAO_MULTIPLIER} Latiao boost</p>
                    )}
                    {shown.result.replayed && <p className="muted small">Already rolled. Showing the saved result.</p>}
                  </div>
                </div>
                {shown.discordText && (
                  <div className="tt-keys">
                    <button className={`tt-keybtn${copied ? " done" : ""}`} onClick={() => copyMessage(shown.discordText ?? "")} aria-label="Copy message (C)">
                      <kbd className="tt-key">{copied ? "✓" : "C"}</kbd>Message
                    </button>
                    <button className={`tt-keybtn${boardCopied ? " done" : ""}`} onClick={copyBoard} aria-label="Copy leaderboard (L)">
                      <kbd className="tt-key">{boardCopied ? "✓" : "L"}</kbd>Leaderboard
                    </button>
                    {shown.result.attach_image && (
                      <button className={`tt-keybtn${imageCopied === "done" ? " done" : ""}`} onClick={() => copyAttached(shown.result!.attach_image!)} aria-label="Copy image (I)">
                        <kbd className="tt-key">{imageCopied === "done" ? "✓" : "I"}</kbd>{imageCopied === "error" ? "Copy failed" : "Image"}
                      </button>
                    )}
                  </div>
                )}
                {shown.result.attach_image && (
                  <Image src={shown.result.attach_image} alt="Image to post with this message" width={480} height={60} className="tt-attach" />
                )}
                {shown.discordText && (
                  <details className="tt-code">
                    <summary>Discord code</summary>
                    <textarea className="input discord-text" readOnly aria-label="Discord message" rows={3} value={shown.discordText} />
                  </details>
                )}
              </div>
            )}

            {selected && (
              <div className="tt-door-tools">
                <button className="tt-link" disabled={busy || !hasTreat} onClick={reroll}>Reroll last</button>
                <button className="tt-link danger" disabled={busy || !hasTreat} onClick={undo}>Undo last</button>
                <span className="tt-bonus" title="For requests made before a reset. Never expire.">
                  Bonus treats <strong>{selected.bonus_treats}</strong>
                  <button className="tt-mini" disabled={busy || selected.bonus_treats < 1} onClick={() => changeBonus(-1)} aria-label="Remove one bonus treat">−</button>
                  <button className="tt-mini" disabled={busy} onClick={() => changeBonus(1)} aria-label="Add one bonus treat">+</button>
                </span>
              </div>
            )}
          </section>

          <section className="tt-players" aria-labelledby="tt-players-h">
            <div className="tt-players-head">
              <h3 id="tt-players-h">Who&apos;s knocking?</h3>
              <input className="input tt-search" type="search" placeholder="Search" aria-label="Search escaped players"
                value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            {escaped.length === 0 ? (
              <p className="empty">{query ? "No players found." : "No escaped players yet. Only escaped players can trick-or-treat."}</p>
            ) : (
              <ul className="tt-tiles" ref={tilesRef}>
                {escaped.map((p) => {
                  const ready = leftFor(p.id) > 0;
                  return (
                    <li key={p.id}>
                      <button data-id={p.id} className={`tt-tile${p.id === selected?.id ? " active" : ""}${ready ? "" : " used"}`}
                        aria-pressed={p.id === selected?.id} onClick={() => pick(p.id)}>
                        <Avatar src={p.discord_avatar_url} name={displayName(p)} size={32} />
                        <span className="tt-tile-text">
                          <span className="tt-tile-name" title={displayName(p)}>{displayName(p)}</span>
                          <span className="tt-tile-meta">
                            <span className="tt-tile-candy">{p.candy}</span>
                            {p.liatao && <Image src="/assets/liatao.png" alt="Latiao boost" width={64} height={64} className="liatao-icon" />}
                            <span className={`tt-dot${ready ? " ready" : ""}`}>{ready ? (p.bonus_treats > 0 ? `Ready +${p.bonus_treats}` : "Ready") : "Done"}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {/* Someone who only trick-or-treats: never on lootbox pages or Candy Island. */}
            <details className="tt-add">
              <summary>Add a trick-or-treater</summary>
              <form className="tt-add-form" onSubmit={(e) => {
                e.preventDefault();
                run(() => addTreatPlayer(newId.trim(), Number(newCandy)), () => { setNewId(""); setNewCandy("0"); });
              }}>
                <div className="field">
                  <label htmlFor="tt-add-id">Discord user ID</label>
                  <input id="tt-add-id" className="input" inputMode="numeric" pattern="[0-9]{15,21}" placeholder="e.g. 123456789012345678"
                    value={newId} onChange={(e) => setNewId(e.target.value)} />
                </div>
                <div className="field tt-add-candy">
                  <label htmlFor="tt-add-candy">Starting candy</label>
                  <input id="tt-add-candy" className="input" type="number" inputMode="numeric" min={0} max={100000} step={1}
                    value={newCandy} onChange={(e) => setNewCandy(e.target.value)} />
                </div>
                <button className="btn btn-primary" disabled={busy || !newId.trim()}>Add</button>
              </form>
              <p className="muted small">Trick-or-treat only. They show on the candy leaderboard and Events, not on the lootbox pages or Candy Island.</p>
            </details>
          </section>
        </div>

        {/* ---------- Right: Discord-look leaderboard ---------- */}
        <CandyBoard players={players} leaderboard={board} onEdit={editCandy}
          changes={change ? { [change.playerId]: { from: change.from, to: change.to } } : {}} />
      </div>
    </div>
  );
}

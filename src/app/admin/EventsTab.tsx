"use client";
// Candy events: pick players, set an amount, give it to all of them at once.
// The database applies it all-or-nothing, logs it, and can undo it later
// (unless someone's candy changed since). The leaderboard shows before → after.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminPlayer, CandyEvent } from "@/lib/types";
import { displayName } from "@/lib/names";
import { leaderboardText } from "@/lib/candy";
import Avatar from "@/components/Avatar";
import LocalTime from "@/components/LocalTime";
import CandyBoard, { type CandyChange } from "./CandyBoard";
import { giveCandy, setCandy, undoCandyEvent, type ActionResult, type EventActionResult } from "./actions";

const QUICK_AMOUNTS = [5, 10, 25, 50];

export default function EventsTab({ players, events, setFlash }: {
  players: AdminPlayer[];
  events: CandyEvent[];
  setFlash: (f: ActionResult | null) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("10");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [changes, setChanges] = useState<Record<string, CandyChange>>({});
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // blocks a second click before React re-renders
  const [freshBoard, setFreshBoard] = useState<string | null>(null);
  useEffect(() => setFreshBoard(null), [players]);

  const active = useMemo(() => players.filter((p) => p.active), [players]);
  const byId = useMemo(() => Object.fromEntries(active.map((p) => [p.id, p])), [active]);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return active
      .filter((p) => !needle || [p.discord_display_name, p.discord_username].some((s) => s?.toLowerCase().includes(needle)))
      .sort((a, b) => displayName(a).localeCompare(displayName(b)));
  }, [active, query]);

  const n = Number(amount);
  const amountOk = Number.isInteger(n) && n !== 0 && n >= -1000 && n <= 1000;
  const board = freshBoard ?? leaderboardText(players);

  function toggle(id: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run(task: () => Promise<EventActionResult>, onOk?: (res: EventActionResult) => void) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFlash(null);
    try {
      const res = await task();
      setFlash(res);
      if (res.ok) {
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

  function give() {
    if (!amountOk || picked.size === 0) return;
    const who = picked.size === 1 ? displayName(byId[[...picked][0]]) : `${picked.size} players`;
    if (!confirm(`${n > 0 ? "Give" : "Take"} ${Math.abs(n)} candy ${n > 0 ? "to" : "from"} ${who}?`)) return;
    run(() => giveCandy([...picked], n, name), (res) => {
      setChanges(Object.fromEntries((res.changes ?? []).map((c) => [c.player_id, { from: c.from, to: c.to }])));
      setMessage(res.discordText ?? "");
      setCopied(false);
      setPicked(new Set());
    });
  }

  function undo(e: CandyEvent) {
    if (!confirm(`Undo "${e.name || "Bonus candy"}" (${e.amount > 0 ? "+" : ""}${e.amount} for ${e.players.length})?`)) return;
    run(() => undoCandyEvent(e.id), () => {
      setChanges(Object.fromEntries(e.players.map((p) => [p.player_id, { from: p.candy_after, to: p.candy_before }])));
      setMessage("");
    });
  }

  function editCandy(p: AdminPlayer) {
    const input = prompt(`Set ${displayName(p)}'s candy total:`, String(p.candy));
    if (input === null) return;
    const value = Number(input.trim());
    if (!Number.isInteger(value) || value < 0) {
      setFlash({ ok: false, error: "Enter a whole number, 0 or more." });
      return;
    }
    run(() => setCandy(p.id, value), () => setChanges({ [p.id]: { from: p.candy, to: value } }));
  }

  return (
    <div className="ev">
      <div className="ev-grid">
        <div className="ev-left">
          <section className="panel ev-form" aria-labelledby="ev-h">
            <h3 id="ev-h">New candy event</h3>
            <div className="ev-fields">
              <div className="field ev-name">
                <label htmlFor="ev-name">Event name (optional)</label>
                <input id="ev-name" className="input" maxLength={60} placeholder="Costume contest" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field ev-amount">
                <label htmlFor="ev-amount">Candy each</label>
                <input id="ev-amount" className="input" type="number" inputMode="numeric" min={-1000} max={1000} step={1}
                  value={amount} onChange={(e) => setAmount(e.target.value)} aria-describedby="ev-amount-hint" />
              </div>
            </div>
            <div className="ev-quick" role="group" aria-label="Quick amounts">
              {QUICK_AMOUNTS.map((q) => (
                <button key={q} type="button" className={`btn btn-sm${n === q ? " active" : ""}`} onClick={() => setAmount(String(q))}>+{q}</button>
              ))}
            </div>
            <p id="ev-amount-hint" className="muted small">Use a negative number to take candy away. Nobody can go below 0.</p>
          </section>

          <section className="panel" aria-labelledby="ev-players-h">
            <div className="ev-players-head">
              <h3 id="ev-players-h">Players <span className="muted">({picked.size} selected)</span></h3>
              <div className="ev-players-tools">
                <input className="input ev-search" type="search" placeholder="Search" aria-label="Search players" value={query} onChange={(e) => setQuery(e.target.value)} />
                <button type="button" className="btn btn-sm" onClick={() => setPicked(new Set(shown.map((p) => p.id)))}>Select all</button>
                <button type="button" className="btn btn-sm" disabled={picked.size === 0} onClick={() => setPicked(new Set())}>Clear</button>
              </div>
            </div>
            {shown.length === 0 ? <p className="empty">No players found.</p> : (
              <ul className="ev-list">
                {shown.map((p) => (
                  <li key={p.id}>
                    <label className={`ev-row${picked.has(p.id) ? " on" : ""}`}>
                      <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                      <Avatar src={p.discord_avatar_url} name={displayName(p)} size={30} />
                      <span className="ev-row-name">{displayName(p)}</span>
                      <span className="ev-row-candy">{p.candy}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <button className="btn btn-primary btn-big ev-give" disabled={busy || !amountOk || picked.size === 0} onClick={give}>
              {busy ? "Giving..." : picked.size === 0 ? "Select players"
                : !amountOk ? "Enter an amount"
                : `${n > 0 ? "Give" : "Take"} ${Math.abs(n)} candy ${n > 0 ? "to" : "from"} ${picked.size} player${picked.size === 1 ? "" : "s"}`}
            </button>
          </section>

          {message && (
            <section className="panel discord-box">
              <div className="discord-head">
                <h3>Announcement for Discord</h3>
                <button className="btn btn-sm btn-primary" onClick={async () => { await navigator.clipboard.writeText(message); setCopied(true); }}>
                  {copied ? "Copied" : "Copy message"}
                </button>
              </div>
              <textarea className="input discord-text" readOnly rows={2} aria-label="Event announcement" value={message} />
            </section>
          )}

          <section className="panel" aria-labelledby="ev-history-h">
            <h3 id="ev-history-h" className="mini-title">Recent events</h3>
            {events.length === 0 ? <p className="empty">No events yet.</p> : (
              <ul className="ev-history">
                {events.map((e) => (
                  <li key={e.id} className={e.undone ? "undone" : undefined}>
                    <span className="ev-h-main">
                      <strong>{e.name || "Bonus candy"}</strong>{" "}
                      <span className={e.amount > 0 ? "ev-plus" : "ev-minus"}>{e.amount > 0 ? "+" : ""}{e.amount}</span>
                      <span className="muted"> for {e.players.map((p) => (byId[p.player_id] ? displayName(byId[p.player_id]) : "removed player")).join(", ")}</span>
                    </span>
                    <span className="ev-h-side">
                      <span className="muted small"><LocalTime iso={e.created_at} /></span>
                      {e.undone ? <span className="flag">Undone</span>
                        : <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => undo(e)}>Undo</button>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <CandyBoard players={players} changes={changes} leaderboard={board} onEdit={editCandy} />
      </div>
    </div>
  );
}

"use client";
// The only large client component: tabs, search, buttons, and forms need
// browser state. It receives server data as props and never queries the
// database itself. Every change goes through a server action, then
// router.refresh() re-renders the page with fresh server data.

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminAction, AdminPlayer, Item, Roll, RollResult } from "@/lib/types";
import { RARITY, CHECKLIST_RARITIES } from "@/lib/rarity";
import { buildRows, progress } from "@/lib/progress";
import { displayName } from "@/lib/names";
import type { WindowInfo } from "@/lib/time";
import Avatar from "@/components/Avatar";
import CandyIcon from "@/components/CandyIcon";
import DropList from "@/components/DropList";
import LocalTime from "@/components/LocalTime";
import LootboxIcon from "@/components/LootboxIcon";
import { StatusBadge } from "@/components/Status";
import {
  addPlayer, openBoxes, resetProgress, setActive, setItem, setStatus, syncProfiles, undoLastRoll,
  type ActionResult, type OpenResult,
} from "./actions";
import { signOut } from "../login/actions";
import "./admin.css";

type Tab = "open" | "players" | "activity";
const TABS: { id: Tab; label: string }[] = [
  { id: "open", label: "Open Lootbox" },
  { id: "players", label: "Players" },
  { id: "activity", label: "Activity" },
];

interface Props {
  email: string;
  windowInfo: WindowInfo;
  items: Item[];
  players: AdminPlayer[];
  rolls: Roll[];
  actions: AdminAction[];
  used: Record<string, number>;
}

type Shared = {
  items: Item[];
  itemsById: Record<string, Item>;
  playersById: Record<string, AdminPlayer>;
  rolls: Roll[];
  setFlash: (f: ActionResult | null) => void;
};

export default function AdminDashboard(props: Props) {
  const [tab, setTab] = useState<Tab>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flash, setFlash] = useState<ActionResult | null>(null);

  const itemsById = useMemo(() => Object.fromEntries(props.items.map((i) => [i.id, i])), [props.items]);
  const playersById = useMemo(() => Object.fromEntries(props.players.map((p) => [p.id, p])), [props.players]);
  const selected = selectedId ? playersById[selectedId] ?? null : null;
  const shared: Shared = { items: props.items, itemsById, playersById, rolls: props.rolls, setFlash };

  return (
    <div className="page admin">
      <div className="admin-top">
        <h1 className="page-title">Admin</h1>
        <div className="admin-top-right">
          <span className="muted small">
            {props.windowInfo.name}: <LocalTime iso={props.windowInfo.startIso} mode="time" /> to{" "}
            <LocalTime iso={props.windowInfo.lastMinuteIso} mode="time" zone />
          </span>
          <span className="muted small admin-email">{props.email}</span>
          <form action={signOut}><button className="btn btn-sm">Sign out</button></form>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Admin sections">
        {TABS.map((t) => (
          <button key={t.id} id={`tab-${t.id}`} role="tab" aria-selected={tab === t.id} aria-controls="admin-panel"
            className={`tab${tab === t.id ? " active" : ""}`} onClick={() => { setTab(t.id); setFlash(null); }}>
            {t.label}
          </button>
        ))}
      </div>

      {flash && <p className={`flash ${flash.ok ? "notice" : "error"}`} role="status">{flash.error ?? flash.notice}</p>}

      <div id="admin-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "open" && (
          <OpenTab {...shared} players={props.players.filter((p) => p.active)} used={props.used}
            selected={selected?.active ? selected : null} onSelect={setSelectedId} />
        )}
        {tab === "players" && <PlayersTab {...shared} players={props.players} selected={selected} onSelect={setSelectedId} />}
        {tab === "activity" && <ActivityTab {...shared} players={props.players} actions={props.actions} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Player picker                                                       */
/* ------------------------------------------------------------------ */
function PlayerPicker({ players, items, selectedId, onSelect, used }: {
  players: AdminPlayer[]; items: Item[]; selectedId: string | null; onSelect: (id: string) => void; used?: Record<string, number>;
}) {
  const [query, setQuery] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const selected = players.find((p) => p.id === selectedId);
  // Phones: hide the list once someone is picked (CSS only applies this under 900px).
  const collapsed = Boolean(selected) && !query && !browsing;
  function choose(id: string) {
    onSelect(id);
    setQuery("");
    setBrowsing(false);
  }
  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return players
      .filter((p) => !needle || [p.discord_display_name, p.discord_username, p.discord_user_id].some((s) => s?.toLowerCase().includes(needle)))
      .sort((a, b) => displayName(a).localeCompare(displayName(b)));
  }, [players, query]);

  return (
    <div className={`picker panel${collapsed ? " collapsed" : ""}`}>
      <input className="input" type="search" placeholder="Find player" aria-label="Find player" value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && list[0]) choose(list[0].id); }} />
      {collapsed && selected && (
        <div className="picker-selected">
          <span>Selected: <strong>{displayName(selected)}</strong></span>
          <button className="btn btn-sm" onClick={() => setBrowsing(true)}>Change</button>
        </div>
      )}
      <ul className="picker-list">
        {list.map((p) => {
          const left = used ? Math.max(0, 2 - (used[p.id] ?? 0)) : null;
          return (
            <li key={p.id}>
              <button className={`picker-row${p.id === selectedId ? " active" : ""}`} aria-pressed={p.id === selectedId} onClick={() => choose(p.id)}>
                <Avatar src={p.discord_avatar_url} name={displayName(p)} size={30} />
                <span className="picker-name">
                  {displayName(p)}
                  {!p.active && <> <span className="flag">inactive</span></>}
                </span>
                <span className="picker-meta">
                  {p.lootbox_status === "escaped" ? "✅" : `${progress(items, p.player_lootbox_items).collected}/10`}
                  {left !== null && p.lootbox_status === "trapped" && <span className="boxes-pill" aria-label={`${left} boxes left`}>{left}<LootboxIcon size={14} /></span>}
                </span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="muted small picker-empty">No players found.</li>}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Open Lootbox                                                        */
/* ------------------------------------------------------------------ */
function OpenTab({ players, items, itemsById, rolls, used, selected, onSelect, setFlash }: Shared & {
  players: AdminPlayer[]; used: Record<string, number>; selected: AdminPlayer | null; onSelect: (id: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // blocks a second click before React re-renders
  const [result, setResult] = useState<OpenResult | null>(null);
  const [copied, setCopied] = useState(false);

  function pick(id: string) {
    onSelect(id);
    setResult(null);
    setFlash(null);
  }

  async function run(task: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFlash(null);
    try {
      await task();
      router.refresh();
    } catch {
      setFlash({ ok: false, error: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const open = (count: 1 | 2) => selected && run(async () => {
    setCopied(false);
    // Fresh idempotency keys per click. Only the server decides the result.
    const res = await openBoxes(selected.id, Array.from({ length: count }, () => crypto.randomUUID()));
    setResult(res);
    if (res.error) setFlash({ ok: false, error: res.error });
  });

  const undo = () => selected && confirm(`Undo ${displayName(selected)}'s last roll?`) && run(async () => {
    setFlash(await undoLastRoll(selected.id));
    setResult(null);
  });

  async function copy() {
    if (!result?.discordText) return;
    await navigator.clipboard.writeText(result.discordText);
    setCopied(true);
  }

  const left = selected ? Math.max(0, 2 - (used[selected.id] ?? 0)) : 0;
  const escaped = selected?.lootbox_status === "escaped";
  const playerRolls = selected ? rolls.filter((r) => r.player_id === selected.id && !r.undone).slice(0, 5) : [];
  const shown = result && selected && result.results[0]?.player_id === selected.id ? result : null;

  return (
    <div className="admin-grid">
      <PlayerPicker players={players} items={items} selectedId={selected?.id ?? null} onSelect={pick} used={used} />

      {!selected ? (
        <div className="panel empty-state"><p>Pick a player to open their boxes. Type a name and press Enter.</p></div>
      ) : (
        <div className="open-main">
          <div className="panel open-head">
            <Avatar src={selected.discord_avatar_url} name={displayName(selected)} size={64} />
            <div className="open-id">
              <h2>{displayName(selected)}</h2>
              <StatusBadge player={selected} />
            </div>
            <div className={`boxes-left${left === 0 ? " none" : ""}`}>
              <span className="boxes-num">{escaped ? "✓" : left}</span>
              <span className="muted small">{escaped ? "escaped" : "boxes left now"}</span>
            </div>
          </div>

          <div className="open-actions">
            <button className="btn btn-primary btn-big" disabled={busy || escaped || left < 1} onClick={() => open(1)}>
              {busy ? "Opening..." : "Open Lootbox"}
            </button>
            <button className="btn btn-orange btn-big" disabled={busy || escaped || left < 2} onClick={() => open(2)}>
              Open 2 Lootboxes
            </button>
            <button className="btn btn-danger" disabled={busy || playerRolls.length === 0} onClick={undo}>Undo last roll</button>
          </div>

          {shown && shown.results.length > 0 && (
            <>
              <ResultShot results={shown.results} player={selected} />
              <div className="panel discord-box">
                <div className="discord-head">
                  <h3>For Discord</h3>
                  <button className="btn btn-sm btn-primary" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
                </div>
                <textarea className="input discord-text" readOnly aria-label="Discord message"
                  value={shown.discordText} rows={shown.discordText.split("\n").length + 1} />
              </div>
            </>
          )}

          <div className="open-lower">
            <div className="panel">
              <h3 className="mini-title">Checklist</h3>
              <MiniChecklist items={items} player={selected} />
            </div>
            <div className="panel drops-card">
              <h3 className="mini-title">Recent rolls</h3>
              <DropList rolls={playerRolls} items={itemsById} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Self-contained result panel, sized to screenshot and post in Discord. */
function ResultShot({ results, player }: { results: RollResult[]; player: AdminPlayer }) {
  const last = results[results.length - 1];
  return (
    <section className="shot" aria-label="Roll results">
      <div className="shot-head">
        <Avatar src={player.discord_avatar_url} name={displayName(player)} size={52} />
        <div className="shot-who">
          <span className="shot-name">{displayName(player)}</span>
          <span className="shot-sub">opened {results.length} loot box{results.length === 1 ? "" : "es"}</span>
        </div>
        <span className={`shot-progress${last.status === "escaped" ? " escaped" : ""}`}>
          {last.status === "escaped" ? "✅ ESCAPED" : `Checklist ${last.checklist_collected}/10`}
        </span>
      </div>
      <div className="shot-cards">
        {results.map((r) => <ResultCard key={r.roll_id} r={r} />)}
      </div>
      {results.some((r) => r.replayed) && <p className="muted small">Already rolled. Showing the saved result.</p>}
    </section>
  );
}

function ResultCard({ r }: { r: RollResult }) {
  const meta = RARITY[r.rarity];
  const counted = r.rarity !== "cursed" && r.rarity !== "legendary";
  return (
    <div className={`result-card ${meta.className}`}>
      <span className="result-rarity">{meta.emoji} {meta.label.toUpperCase()}</span>
      <CandyIcon src={r.icon_path} size={170} priority />
      <span className="result-name">{r.item_name}</span>
      {r.rarity === "cursed" ? <span className="result-tag tag-red">CHECKLIST RESET 💀</span>
        : r.rarity === "legendary" ? <span className="result-tag tag-gold">ESCAPED! 🎉</span>
        : r.was_new_item ? <span className="result-tag tag-green">NEW ITEM!</span>
        : r.triggered_roberts_rule ? <span className="result-tag tag-red">DUPE, MAXED 😭</span>
        : <span className="result-tag">DUPE</span>}
      {counted && (
        <span className={`dupe-meter${r.times_rolled >= 3 ? " maxed" : ""}`}>
          {[1, 2, 3].map((i) => <span key={i} className={`pip${i <= r.times_rolled ? " on" : ""}`} aria-hidden />)}
          <span className="dupe-count">{r.times_rolled}/3</span>
        </span>
      )}
      {r.triggered_roberts_rule && <span className="result-note">Removed from loot pool (Robert&apos;s Rule IV)</span>}
      {r.triggered_completion && r.rarity !== "legendary" && <span className="result-tag tag-gold">CHECKLIST COMPLETE, ESCAPED! 🎉</span>}
    </div>
  );
}

function MiniChecklist({ items, player }: { items: Item[]; player: AdminPlayer }) {
  const pr = progress(items, player.player_lootbox_items);
  return (
    <div className="mini-checklist">
      {CHECKLIST_RARITIES.map((rarity) => (
        <div key={rarity}>
          <span className={`mini-tier-label ${RARITY[rarity].className}`}>
            {RARITY[rarity].label} {pr.byRarity[rarity].collected}/{pr.byRarity[rarity].total}
          </span>
          <div className="mini-chips">
            {pr.rows.filter((x) => x.item.rarity === rarity).map(({ item, state }) => (
              <span key={item.id} className={`chip${state.collected ? " got" : ""}${state.excluded_by_roberts_rule ? " excluded" : ""}`}>
                <CandyIcon src={item.icon_path} size={18} />
                {item.name} ×{state.times_rolled}
                <span className="sr-only">{state.collected ? ", collected" : ", missing"}{state.excluded_by_roberts_rule ? ", removed by Robert's Rule IV" : ""}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Players (management)                                                */
/* ------------------------------------------------------------------ */
function PlayersTab({ players, items, itemsById, rolls, selected, onSelect, setFlash }: Shared & {
  players: AdminPlayer[]; selected: AdminPlayer | null; onSelect: (id: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newId, setNewId] = useState("");

  function run(task: () => Promise<ActionResult>, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    startTransition(async () => {
      try {
        setFlash(await task());
        router.refresh();
      } catch {
        setFlash({ ok: false, error: "Couldn't reach the server. Check your connection and try again." });
      }
    });
  }

  return (
    <div className="admin-grid">
      <div className="stack">
        <form className="panel stack" onSubmit={(e) => {
          e.preventDefault();
          run(async () => { const r = await addPlayer(newId); if (r.ok) setNewId(""); return r; });
        }}>
          <div className="field">
            <label htmlFor="new-id">Add player by Discord user ID</label>
            <input id="new-id" className="input" inputMode="numeric" pattern="[0-9]{15,21}" placeholder="e.g. 123456789012345678"
              value={newId} onChange={(e) => setNewId(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={pending || !newId.trim()}>Add player</button>
          <button type="button" className="btn" disabled={pending} onClick={() => run(() => syncProfiles())}>Sync Discord profiles</button>
        </form>
        <PlayerPicker players={players} items={items} selectedId={selected?.id ?? null} onSelect={onSelect} />
      </div>

      {!selected ? (
        <div className="panel empty-state"><p>Pick a player to edit them.</p></div>
      ) : (
        <div className="stack">
          <div className="panel open-head">
            <Avatar src={selected.discord_avatar_url} name={displayName(selected)} size={56} />
            <div className="open-id">
              <h2>{displayName(selected)}</h2>
              <p className="muted small open-meta">@{selected.discord_username}, ID {selected.discord_user_id}, /players/{selected.slug}</p>
              <StatusBadge player={selected} />
              {selected.escaped_via && <span className="muted small"> via {selected.escaped_via.replace("_", " ")}</span>}
            </div>
          </div>

          <div className="panel button-row">
            <button className="btn" disabled={pending} onClick={() => run(() => syncProfiles(selected.id))}>Sync profile</button>
            {selected.lootbox_status === "trapped" ? (
              <button className="btn" disabled={pending} onClick={() => run(() => setStatus(selected.id, "escaped"), `Mark ${displayName(selected)} escaped?`)}>Mark escaped</button>
            ) : (
              <button className="btn" disabled={pending} onClick={() => run(() => setStatus(selected.id, "trapped"), `Put ${displayName(selected)} back to trapped?`)}>Restore trapped</button>
            )}
            <button className="btn btn-danger" disabled={pending}
              onClick={() => run(() => resetProgress(selected.id), `Reset ALL of ${displayName(selected)}'s progress? Roll history is kept.`)}>
              Reset progress
            </button>
            <button className="btn btn-danger" disabled={pending}
              onClick={() => run(() => setActive(selected.id, !selected.active), selected.active ? `Deactivate ${displayName(selected)}? They disappear from public pages.` : undefined)}>
              {selected.active ? "Deactivate" : "Reactivate"}
            </button>
          </div>

          <ItemEditor key={selected.id + JSON.stringify(selected.player_lootbox_items)} items={items} player={selected} pending={pending} run={run} />

          <div className="panel drops-card">
            <h3 className="mini-title">Recent roll history</h3>
            <p className="muted small hint">
              Wrong roll? Undo it from Open Lootbox if it&apos;s the latest one. Otherwise fix the counts above.{" "}
              <a className="view-all" href={`/players/${selected.slug}/drops`}>Full history</a>
            </p>
            <DropList rolls={rolls.filter((r) => r.player_id === selected.id)} items={itemsById} />
          </div>
        </div>
      )}
    </div>
  );
}

function ItemEditor({ items, player, pending, run }: {
  items: Item[]; player: AdminPlayer; pending: boolean; run: (task: () => Promise<ActionResult>) => void;
}) {
  const rows = buildRows(items, player.player_lootbox_items);
  const [draft, setDraft] = useState(() => Object.fromEntries(rows.map((r) => [r.item.id, { ...r.state }])));

  return (
    <div className="panel">
      <h3 className="mini-title">Edit checklist</h3>
      <p className="muted small hint">Each save is logged. Collecting the last candy escapes the player automatically.</p>
      <div className="table-wrap">
        <table className="edit-table">
          <thead>
            <tr><th scope="col">Candy</th><th scope="col">Values</th><th scope="col"><span className="sr-only">Save</span></th></tr>
          </thead>
          <tbody>
            {rows.map(({ item, state }) => {
              const d = draft[item.id];
              const dirty = d.times_rolled !== state.times_rolled || d.collected !== state.collected || d.excluded_by_roberts_rule !== state.excluded_by_roberts_rule;
              const set = (patch: Partial<typeof d>) => setDraft((s) => ({ ...s, [item.id]: { ...s[item.id], ...patch } }));
              return (
                <tr key={item.id}>
                  <td>
                    <span className="edit-name">
                      <CandyIcon src={item.icon_path} size={22} />
                      <span className={RARITY[item.rarity].className}>{item.name}</span>
                    </span>
                  </td>
                  <td>
                    <div className="edit-controls">
                      <label>
                        Rolled
                        <input className="input num" type="number" inputMode="numeric" min={0} max={999} value={d.times_rolled}
                          onChange={(e) => set({ times_rolled: Math.min(999, Math.max(0, Math.floor(Number(e.target.value) || 0))) })} />
                      </label>
                      <label>
                        <input type="checkbox" checked={d.collected} onChange={(e) => set({ collected: e.target.checked })} />
                        Collected
                      </label>
                      {item.required && (
                        <label>
                          <input type="checkbox" checked={d.excluded_by_roberts_rule} onChange={(e) => set({ excluded_by_roberts_rule: e.target.checked })} />
                          Robert&apos;s IV
                        </label>
                      )}
                    </div>
                  </td>
                  <td>
                    <button className="btn btn-sm" aria-label={`Save ${item.name}`} disabled={!dirty || pending}
                      onClick={() => run(() => setItem(player.id, item.id, d.times_rolled, d.collected, d.excluded_by_roberts_rule))}>
                      Save
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */
function ActivityTab({ players, playersById, itemsById, rolls, actions }: Shared & { players: AdminPlayer[]; actions: AdminAction[] }) {
  const [filter, setFilter] = useState("");
  const shownRolls = filter ? rolls.filter((r) => r.player_id === filter) : rolls;
  const shownActions = filter ? actions.filter((a) => a.player_id === filter) : actions;
  const sorted = useMemo(() => [...players].sort((a, b) => displayName(a).localeCompare(displayName(b))), [players]);

  return (
    <div className="stack">
      <div className="field activity-filter">
        <label htmlFor="act-filter">Player</label>
        <select id="act-filter" className="input" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Everyone</option>
          {sorted.map((p) => <option key={p.id} value={p.id}>{displayName(p)}</option>)}
        </select>
      </div>
      <div className="activity-grid">
        <div className="panel drops-card">
          <h3 className="mini-title">Rolls</h3>
          <DropList rolls={shownRolls} items={itemsById} players={playersById} empty="No rolls yet." />
        </div>
        <div className="panel">
          <h3 className="mini-title">Admin log</h3>
          <ul className="feed">
            {shownActions.map((a) => (
              <li key={a.id}>
                <span className="feed-time"><LocalTime iso={a.created_at} /></span>
                <span>
                  <strong>{a.action_type.replaceAll("_", " ")}</strong>
                  {a.player_id && <>, {playersById[a.player_id] ? displayName(playersById[a.player_id]) : "removed player"}</>}
                  <span className="feed-meta">{summarize(a)}</span>
                </span>
              </li>
            ))}
            {shownActions.length === 0 && <li className="muted">No admin changes yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

function summarize(a: AdminAction): string {
  const m = a.metadata;
  if (a.action_type === "set_item") {
    const n = m.new as { times_rolled: number; collected: boolean; excluded: boolean };
    const o = m.old as typeof n;
    return `${m.item_id}: ×${o.times_rolled}→×${n.times_rolled}, collected ${o.collected}→${n.collected}, excluded ${o.excluded}→${n.excluded}`;
  }
  if (a.action_type === "set_status") return `${m.old} → ${m.new}`;
  if (a.action_type === "undo_roll") return `roll #${m.roll_id} (${m.item_id})`;
  if (a.action_type === "sync_profiles") return `updated ${m.updated}`;
  return "";
}

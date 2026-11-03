"use client";
import { useMemo, useState, type ReactNode } from "react";
import type { AdminPlayer, Item } from "@/lib/types";
import { progress } from "@/lib/progress";
import { displayName } from "@/lib/names";
import { boxesLeft } from "@/lib/boxes";
import Avatar from "@/components/Avatar";
import LootboxIcon from "@/components/LootboxIcon";

/** Searchable player list shared by the admin tabs. On phones it folds away after a pick. */
export default function PlayerPicker({ players, items, selectedId, onSelect, used, meta, emptyText = "No players found." }: {
  players: AdminPlayer[]; items: Item[]; selectedId: string | null; onSelect: (id: string) => void;
  used?: Record<string, number>;
  /** Replaces the default right-hand info (checklist and boxes) for each player. */
  meta?: (p: AdminPlayer) => ReactNode;
  emptyText?: string;
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
          const left = used ? boxesLeft(p, used[p.id] ?? 0) : null;
          return (
            <li key={p.id}>
              <button className={`picker-row${p.id === selectedId ? " active" : ""}`} aria-pressed={p.id === selectedId} onClick={() => choose(p.id)}>
                <Avatar src={p.discord_avatar_url} name={displayName(p)} size={30} />
                <span className="picker-name">
                  {displayName(p)}
                  {!p.active && <> <span className="flag">inactive</span></>}
                </span>
                <span className="picker-meta">
                  {meta ? meta(p) : (
                    <>
                      {p.lootbox_status === "escaped" ? "✅" : `${progress(items, p.player_lootbox_items).collected}/10`}
                      {left !== null && p.lootbox_status === "trapped" && <span className="boxes-pill" aria-label={`${left} boxes left`}>{left}<LootboxIcon size={14} /></span>}
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="muted small picker-empty">{emptyText}</li>}
      </ul>
    </div>
  );
}

"use client";
import { useId, useMemo, useState, type ReactNode } from "react";

/** Lowercase and strip accents, so "tomas" finds "Tómas". */
function normalize(s: string) {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Live search over the player cards. The cards are rendered on the server and
 * passed in; this only decides which ones to show, so no data is refetched.
 */
export default function PlayerSearch({ cards, searchText }: { cards: ReactNode[]; searchText: string[] }) {
  const [query, setQuery] = useState("");
  const inputId = useId();
  const haystack = useMemo(() => searchText.map(normalize), [searchText]);

  const needle = normalize(query.trim());
  const visible = cards.filter((_, i) => !needle || haystack[i].includes(needle));

  return (
    <>
      <div className="player-search">
        <label htmlFor={inputId} className="sr-only">Search players</label>
        <input
          id={inputId}
          className="input"
          type="search"
          placeholder="Search by name or @username"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <p className="sr-only" aria-live="polite">
          {needle ? `${visible.length} player${visible.length === 1 ? "" : "s"} found` : ""}
        </p>
      </div>
      {visible.length > 0 ? <ul className="player-list">{visible}</ul> : <p className="empty">No players found.</p>}
    </>
  );
}

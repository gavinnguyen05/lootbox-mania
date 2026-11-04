"use client";
// Discord-look candy leaderboard shared by the Trick-or-Treat and Events tabs.
// Rows you just changed show "152 → 156 +4". Copy pastes over the real message.

import { useState } from "react";
import Image from "next/image";
import type { AdminPlayer } from "@/lib/types";
import { displayName } from "@/lib/names";
import { LEADERBOARD_MESSAGE_URL, LEADERBOARD_TITLE, rankCandy } from "@/lib/candy";

export type CandyChange = { from: number; to: number };

export default function CandyBoard({ players, changes, leaderboard, onEdit }: {
  players: AdminPlayer[];
  /** player id → before/after, for rows to highlight */
  changes: Record<string, CandyChange>;
  /** Exact text to copy (fresh from the server after a change). */
  leaderboard: string;
  onEdit: (p: AdminPlayer) => void;
}) {
  const [copied, setCopied] = useState(false);
  const ranked = rankCandy(players.filter((p) => p.active));

  async function copy() {
    await navigator.clipboard.writeText(leaderboard);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <section className="tt-board" aria-labelledby="candy-board-h">
      <div className="tt-board-bar">
        <a className="btn btn-sm" href={LEADERBOARD_MESSAGE_URL} target="_blank" rel="noopener noreferrer">Open message ↗</a>
        <button className="btn btn-sm btn-orange" onClick={copy}>{copied ? "Leaderboard copied" : "Copy leaderboard"}</button>
      </div>
      <div className="dc-message">
        <h3 id="candy-board-h" className="dc-title">
          <Image src="/assets/lootbox-mania-logo.png" alt="" width={22} height={22} className="dc-candy" />
          <span>{LEADERBOARD_TITLE}</span>:
        </h3>
        <ol className="dc-list">
          {ranked.map((p, i) => {
            const changed = changes[p.id];
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
                <button className="dc-edit" onClick={() => onEdit(p)} aria-label={`Set ${displayName(p)}'s candy`}>Edit</button>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="muted small tt-hint">Copy it, open the message, click Edit, select all, paste, and save.</p>
    </section>
  );
}

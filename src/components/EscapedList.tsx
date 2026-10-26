import Link from "next/link";
import type { Player } from "@/lib/types";
import { displayName } from "@/lib/names";
import Avatar from "./Avatar";
import LocalTime from "./LocalTime";

const HOW: Record<string, { label: string; className: string }> = {
  golden_kitkat: { label: "★ Golden KitKat", className: "via-kitkat" },
  checklist: { label: "Full checklist", className: "via-checklist" },
  manual: { label: "Escaped", className: "" },
};

/** Everyone who's out, first to escape at the top. */
export default function EscapedList({ players, times }: { players: Player[]; times: Record<string, string> }) {
  const escaped = players
    .filter((p) => p.lootbox_status === "escaped")
    // Known escape times first (earliest first), then any without a time.
    .sort((a, b) => (times[a.id] ?? "\uffff").localeCompare(times[b.id] ?? "\uffff"));

  return (
    <section className="panel escaped-card" aria-labelledby="escaped-h">
      <h2 id="escaped-h">
        Escaped
        <span className="escaped-count">{escaped.length} out of {players.length}</span>
      </h2>
      {escaped.length === 0 ? (
        <p className="empty">No one has escaped yet.</p>
      ) : (
        <ol className="escaped-list">
          {escaped.map((p, i) => {
            const name = displayName(p);
            const how = HOW[p.escaped_via ?? "manual"] ?? HOW.manual;
            return (
              <li key={p.id} className="escaped-row">
                <span className="escaped-rank" aria-label={`Number ${i + 1}`}>{i + 1}</span>
                <Link href={`/players/${p.slug}`} prefetch={false} className="escaped-avatar" tabIndex={-1} aria-hidden>
                  <Avatar src={p.discord_avatar_url} name={name} size={32} />
                </Link>
                <span className="escaped-body">
                  <Link href={`/players/${p.slug}`} prefetch={false} className="escaped-name" title={name}>{name}</Link>
                  <span className="escaped-how">
                    <span className={how.className}>{how.label}</span>
                    {times[p.id] && <> · <LocalTime iso={times[p.id]} /></>}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

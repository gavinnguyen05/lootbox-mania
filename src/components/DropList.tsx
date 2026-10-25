import Link from "next/link";
import type { Item, Player, Roll } from "@/lib/types";
import { RARITY } from "@/lib/rarity";
import { displayName } from "@/lib/names";
import CandyIcon from "./CandyIcon";
import LocalTime from "./LocalTime";

type Props = {
  rolls: Roll[];
  items: Record<string, Item>;
  /** Pass to show who got each drop (server-wide feeds). */
  players?: Record<string, Pick<Player, "slug" | "discord_display_name" | "discord_username">>;
  empty?: string;
};

/**
 * Drop feed used everywhere. Player links don't prefetch: these pages hold
 * live data, so prefetching every name in the feed would be wasted requests.
 * Each row says which copy it was ("New" or
 * "Copy 2"), so two identical pulls in the same minute read as two real drops.
 */
export default function DropList({ rolls, items, players, empty = "No recent drops yet." }: Props) {
  if (rolls.length === 0) return <p className="empty">{empty}</p>;
  return (
    <ul className="drop-list">
      {rolls.map((r) => {
        const item = items[r.item_id];
        const player = players?.[r.player_id];
        return (
          <li key={r.id} className={`drop-row${r.undone ? " undone" : ""}`}>
            <CandyIcon src={item.icon_path} size={28} />
            <div className="drop-main">
              <span className="drop-name">
                {player && (
                  <>
                    <Link href={`/players/${player.slug}`} prefetch={false}>{displayName(player)}</Link>
                    <span className="muted"> got </span>
                  </>
                )}
                {item.name}
              </span>
              <span className="drop-meta">
                <span className={`drop-rarity ${RARITY[r.rarity].className}`}>{RARITY[r.rarity].label}</span>
                {r.rarity !== "legendary" && r.rarity !== "cursed" && (
                  <span className="flag">{r.was_new_item ? "New" : `Copy ${r.times_rolled_after}`}</span>
                )}
                {r.triggered_roberts_rule && <span className="flag">Robert&apos;s Rule IV</span>}
                {r.triggered_reset && <span className="flag flag-red">Checklist reset</span>}
                {r.triggered_completion && <span className="flag flag-green">Escaped!</span>}
                {r.undone && <span className="flag">Undone</span>}
                <LocalTime iso={r.rolled_at} />
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

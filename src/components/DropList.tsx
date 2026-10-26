import Link from "next/link";
import type { Item, Player, Roll } from "@/lib/types";
import { RARITY } from "@/lib/rarity";
import { displayName } from "@/lib/names";
import Avatar from "./Avatar";
import CandyIcon from "./CandyIcon";
import LocalTime from "./LocalTime";

type FeedPlayer = Pick<Player, "slug" | "discord_display_name" | "discord_username" | "discord_avatar_url">;

type Props = {
  rolls: Roll[];
  items: Record<string, Item>;
  /** Pass to show who got each drop. Switches to the activity-feed layout. */
  players?: Record<string, FeedPlayer>;
  empty?: string;
};

/** Event flags shared by both layouts. Undone only appears in admin. */
function EventFlags({ r }: { r: Roll }) {
  return (
    <>
      {r.triggered_roberts_rule && <span className="flag">Robert&apos;s Rule IV</span>}
      {r.triggered_reset && <span className="flag flag-red">Checklist reset</span>}
      {r.triggered_completion && <span className="flag flag-green">Escaped!</span>}
      {r.undone && <span className="flag">Undone</span>}
    </>
  );
}

/**
 * Drop history, used everywhere. Two layouts:
 * - Activity feed (players given): who + when, then what they got, then
 *   tags only when there's something to say. Legendary and cursed rows stand out.
 * - Player's own history: the candy leads, with "New" / "Copy 2" so two
 *   identical pulls read as two real drops.
 * Player links don't prefetch: these pages hold live data.
 */
export default function DropList({ rolls, items, players, empty = "No recent drops yet." }: Props) {
  if (rolls.length === 0) return <p className="empty">{empty}</p>;

  if (players) {
    return (
      <ul className="feed-list">
        {rolls.map((r) => {
          const item = items[r.item_id];
          const player = players[r.player_id];
          const name = player ? displayName(player) : "Unknown player";
          const href = player ? `/players/${player.slug}` : undefined;
          const special = r.rarity === "legendary" || r.rarity === "cursed";
          const isNew = r.was_new_item && !special;
          const hasTags = isNew || r.triggered_roberts_rule || r.triggered_reset || r.triggered_completion || r.undone;
          return (
            <li key={r.id} className={`feed-row${special ? ` feed-${r.rarity}` : ""}${r.undone ? " undone" : ""}`}>
              {/* The avatar repeats the name link, so it's skipped by keyboard and screen readers. */}
              {href ? (
                <Link href={href} prefetch={false} className="feed-avatar" tabIndex={-1} aria-hidden>
                  <Avatar src={player.discord_avatar_url} name={name} size={40} />
                </Link>
              ) : (
                <span className="feed-avatar"><Avatar src={null} name={name} size={40} /></span>
              )}
              <div className="feed-body">
                <div className="feed-top">
                  {href ? (
                    <Link href={href} prefetch={false} className="feed-player" title={name}>{name}</Link>
                  ) : (
                    <span className="feed-player">{name}</span>
                  )}
                  <span className="feed-time"><LocalTime iso={r.rolled_at} /></span>
                </div>
                <p className="feed-drop">
                  <CandyIcon src={item.icon_path} size={24} />
                  <span className="feed-candy">{item.name}</span>
                  <span className={`feed-rarity ${RARITY[r.rarity].className}`}>
                    {r.rarity === "legendary" ? "★ Legendary" : RARITY[r.rarity].label}
                  </span>
                </p>
                {hasTags && (
                  <p className="feed-tags">
                    {isNew && <span className="tag tag-new">New</span>}
                    {r.triggered_roberts_rule && <span className="tag tag-maxed">Maxed: Robert&apos;s Rule IV</span>}
                    {r.triggered_reset && <span className="tag tag-reset">Checklist reset</span>}
                    {r.triggered_completion && <span className="tag tag-escaped">Escaped!</span>}
                    {r.undone && <span className="tag">Undone</span>}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ul className="drop-list">
      {rolls.map((r) => {
        const item = items[r.item_id];
        return (
          <li key={r.id} className={`drop-row${r.undone ? " undone" : ""}`}>
            <CandyIcon src={item.icon_path} size={28} />
            <div className="drop-main">
              <span className="drop-name">{item.name}</span>
              <span className="drop-meta">
                <span className={`drop-rarity ${RARITY[r.rarity].className}`}>{RARITY[r.rarity].label}</span>
                {r.rarity !== "legendary" && r.rarity !== "cursed" && (
                  <span className="flag">{r.was_new_item ? "New" : `Copy ${r.times_rolled_after}`}</span>
                )}
                <EventFlags r={r} />
                <LocalTime iso={r.rolled_at} />
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

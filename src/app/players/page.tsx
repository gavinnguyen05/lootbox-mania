import Link from "next/link";
import { getItems, getPlayers, getWindowUsage } from "@/lib/data";
import { displayName } from "@/lib/names";
import { progress } from "@/lib/progress";
import { claimWindowInfo } from "@/lib/time";
import Avatar from "@/components/Avatar";
import BoxesBadge from "@/components/BoxesBadge";
import { boxesLeft } from "@/lib/boxes";
import PlayerSearch from "@/components/PlayerSearch";
import { StatusBadge } from "@/components/Status";

export const metadata = { title: "Players | Lootbox Mania" };

export default async function PlayersPage() {
  const win = claimWindowInfo();
  const [items, players, used] = await Promise.all([getItems(), getPlayers(), getWindowUsage(win.key)]);
  const rows = players
    .map((p) => ({ p, ...progress(items, p.player_lootbox_items) }))
    // Escaped first, then closest to finishing, then by name.
    .sort((a, b) =>
      Number(b.p.lootbox_status === "escaped") - Number(a.p.lootbox_status === "escaped") ||
      b.collected - a.collected ||
      displayName(a.p).localeCompare(displayName(b.p)),
    );

  return (
    <div className="page players-page">
      <h1 className="page-title players-title">Players</h1>
      <PlayerSearch
        searchText={rows.map(({ p }) => `${displayName(p)} ${p.discord_username ?? ""}`)}
        cards={rows.map(({ p, collected, total }) => {
          const left = boxesLeft(p, used[p.id] ?? 0);
          return (
          <li key={p.id}>
            <Link href={`/players/${p.slug}`} className={`panel player-card${left > 0 ? " has-boxes" : ""}`} prefetch={false}>
              <Avatar src={p.discord_avatar_url} name={displayName(p)} size={52} />
              <span className="player-card-text">
                <span className="player-card-name">{displayName(p)}</span>
                {p.discord_username && <span className="player-card-user">@{p.discord_username}</span>}
                <StatusBadge player={p} progress={p.lootbox_status === "trapped" ? `${collected}/${total}` : undefined} />
                {p.lootbox_status === "trapped" && (
                  <span className="player-card-boxes"><BoxesBadge left={left} nextIso={win.endIso} /></span>
                )}
              </span>
            </Link>
          </li>
          );
        })}
      />
    </div>
  );
}

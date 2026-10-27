import { getEscapeTimes, getItems, getPlayers, getWindowUsage } from "@/lib/data";
import { displayName } from "@/lib/names";
import { rankPlayers } from "@/lib/ranking";
import { boxesLeft } from "@/lib/boxes";
import { claimWindowInfo } from "@/lib/time";
import PlayerCard from "@/components/PlayerCard";
import PlayerSearch from "@/components/PlayerSearch";

export const metadata = { title: "Players | Lootbox Mania" };

export default async function PlayersPage() {
  const win = claimWindowInfo();
  const [items, players, used, escapeTimes] = await Promise.all([getItems(), getPlayers(), getWindowUsage(win.key), getEscapeTimes()]);
  const ranked = rankPlayers(players, items, escapeTimes);

  return (
    <div className="page players-page">
      <h1 className="page-title players-title">Players</h1>
      <p className="ranking-note">
        Ranked by how close each player is to escaping. &ldquo;Boxes to go&rdquo; is an estimate from simulating the rest of their game with the real odds and rules.
      </p>
      <PlayerSearch
        searchText={ranked.map(({ player: p }) => `${displayName(p)} ${p.discord_username ?? ""}`)}
        cards={ranked.map((row) => (
          <li key={row.player.id}>
            <PlayerCard row={row} boxesLeft={boxesLeft(row.player, used[row.player.id] ?? 0)} nextIso={win.endIso} avatarSize={52} showUsername />
          </li>
        ))}
      />
      {players.length === 0 && <p className="empty">No players found.</p>}
    </div>
  );
}

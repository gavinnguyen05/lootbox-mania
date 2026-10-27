import { byId, getEscapeTimes, getItems, getPlayers, getRecentRolls, getWindowUsage } from "@/lib/data";
import { claimWindowInfo } from "@/lib/time";
import { boxesLeft } from "@/lib/boxes";
import DropList from "@/components/DropList";
import PlayerCard from "@/components/PlayerCard";
import { rankPlayers } from "@/lib/ranking";
import EscapedList from "@/components/EscapedList";
import FeaturedQuote from "@/components/FeaturedQuote";
import { FEATURED_QUOTE } from "@/lib/featured";
import LocalTime from "@/components/LocalTime";
import LootboxIcon from "@/components/LootboxIcon";


export default async function Home() {
  const win = claimWindowInfo();
  // Independent queries, run in parallel (no waterfall).
  const [items, players, rolls, used, escapeTimes] = await Promise.all([
    getItems(), getPlayers(), getRecentRolls(8), getWindowUsage(win.key), getEscapeTimes(),
  ]);
  const escaped = players.filter((p) => p.lootbox_status === "escaped").length;
  const ranked = rankPlayers(players, items, escapeTimes);
  const quote = FEATURED_QUOTE;
  const quoted = quote ? players.find((p) => p.slug === quote.slug) : undefined;

  return (
    <div className="page">
      {quote && <FeaturedQuote quote={quote} player={quoted} />}
      <div className="home-hero">
        <div>
          <h1 className="page-title">Home</h1>
          <p className="home-intro">Open lootboxes, collect candy, and complete your Candy Checklist to restore Trick-or-Treating.</p>
          <section className={`window-box window-${win.period}`} aria-labelledby="window-h">
            <p className="window-label" id="window-h">Current window</p>
            <p className="window-name"><span aria-hidden>{win.period === "day" ? "☀️" : "🌙"}</span> {win.name}</p>
            <p className="window-hours">
              <LocalTime iso={win.startIso} mode="time" />–<LocalTime iso={win.lastMinuteIso} mode="time" zone />
            </p>
            <div className="window-facts">
              <span><LootboxIcon /> <strong>2 boxes</strong> per player</span>
              <span>Next refill <strong><LocalTime iso={win.endIso} mode="time" /></strong></span>
            </div>
          </section>
        </div>
        <div className="home-stats">
          <div className="panel stat stat-trapped">
            <div className="stat-num">{players.length - escaped}</div>
            <div className="stat-label">still trapped</div>
          </div>
          <div className="panel stat stat-escaped">
            <div className="stat-num">{escaped}</div>
            <div className="stat-label">escaped</div>
          </div>
        </div>
      </div>

      <div className="home-grid">
        <section aria-labelledby="dir-h">
          <h2 id="dir-h" className="section-title home-section-title">Players</h2>
          <p className="section-sub">Ranked by how close each player is to escaping. Tap a card to see their checklist.</p>
          <ul className="player-list">
            {ranked.map((row) => (
              <li key={row.player.id}>
                <PlayerCard row={row} boxesLeft={boxesLeft(row.player, used[row.player.id] ?? 0)} nextIso={win.endIso} avatarSize={44} />
              </li>
            ))}
          </ul>
          {players.length === 0 && <p className="empty">No players found.</p>}
        </section>

        <div className="home-side">
          <EscapedList players={players} times={escapeTimes} />
          <aside className="panel drops-card" aria-labelledby="drops-h">
            <h2 id="drops-h">Recent Drops</h2>
            <DropList rolls={rolls} items={byId(items)} players={byId(players)} empty="No recent drops yet." />
          </aside>
        </div>
      </div>
    </div>
  );
}

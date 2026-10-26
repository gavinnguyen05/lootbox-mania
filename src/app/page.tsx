import Link from "next/link";
import { byId, getEscapeTimes, getItems, getPlayers, getRecentRolls, getWindowUsage } from "@/lib/data";
import { displayName } from "@/lib/names";
import { progress } from "@/lib/progress";
import { claimWindowInfo } from "@/lib/time";
import Avatar from "@/components/Avatar";
import BoxesBadge from "@/components/BoxesBadge";
import { boxesLeft } from "@/lib/boxes";
import DropList from "@/components/DropList";
import EscapedList from "@/components/EscapedList";
import LocalTime from "@/components/LocalTime";
import LootboxIcon from "@/components/LootboxIcon";
import { StatusBadge } from "@/components/Status";


export default async function Home() {
  const win = claimWindowInfo();
  // Independent queries, run in parallel (no waterfall).
  const [items, players, rolls, used, escapeTimes] = await Promise.all([
    getItems(), getPlayers(), getRecentRolls(8), getWindowUsage(win.key), getEscapeTimes(),
  ]);
  const escaped = players.filter((p) => p.lootbox_status === "escaped").length;

  return (
    <div className="page">
      <div className="home-hero">
        <div>
          <h1 className="page-title">Lootbox Royale III</h1>
          <p className="home-intro">Open lootboxes, collect candy, and complete your Candy Checklist to restore Trick-or-Treating.</p>
          <section className="window-box" aria-labelledby="window-h">
            <p className="window-label" id="window-h">Current window</p>
            <p className="window-name">{win.name}</p>
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
          <p className="section-sub">Use each player card to check their current progress and see whether they&apos;re still trapped or already escaped.</p>
          <ul className="player-list">
            {players.map((p) => {
              const pr = progress(items, p.player_lootbox_items);
              const left = boxesLeft(p, used[p.id] ?? 0);
              return (
              <li key={p.id}>
                <Link href={`/players/${p.slug}`} className={`panel player-card${left > 0 ? " has-boxes" : ""}`} prefetch={false}>
                  <Avatar src={p.discord_avatar_url} name={displayName(p)} size={44} />
                  <span className="player-card-text">
                    <span className="player-card-name">{displayName(p)}</span>
                    <StatusBadge player={p} progress={`${pr.collected}/${pr.total}`} />
                    {p.lootbox_status === "trapped" && (
                      <span className="player-card-boxes"><BoxesBadge left={left} nextIso={win.endIso} /></span>
                    )}
                  </span>
                </Link>
              </li>
              );
            })}
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

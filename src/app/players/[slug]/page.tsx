import Link from "next/link";
import { notFound } from "next/navigation";
import { byId, getItems, getPlayerBySlug, getRecentRolls, getWindowUsage } from "@/lib/data";
import { displayName } from "@/lib/names";
import { claimWindowInfo } from "@/lib/time";
import Avatar from "@/components/Avatar";
import BoxesBadge from "@/components/BoxesBadge";
import Checklist from "@/components/Checklist";
import DropList from "@/components/DropList";
import PlayerStatusStrip from "@/components/PlayerStatusStrip";
import RobertsRuleCard from "@/components/RobertsRuleCard";
import { StatusBadge } from "@/components/Status";
import "./player.css";


type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const player = await getPlayerBySlug((await params).slug); // shared with the page via cache()
  return { title: player ? `${displayName(player)} | Lootbox Mania` : "Player not found" };
}

export default async function PlayerPage({ params }: Params) {
  const player = await getPlayerBySlug((await params).slug);
  if (!player) notFound();

  const win = claimWindowInfo();
  const [items, rolls, used] = await Promise.all([getItems(), getRecentRolls(5, player.id), getWindowUsage(win.key)]);
  const name = displayName(player);

  return (
    <div className="pd">
      <Link href="/players" className="back-link" prefetch={false}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
          <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        All players
      </Link>
      <header className="pd-identity">
        <Avatar src={player.discord_avatar_url} name={name} size={92} priority />
        <div>
          <h1 className="pd-player-name">{name}</h1>
          <p className="pd-identity-line">
            {player.discord_username && <span className="pd-username">@{player.discord_username}</span>}
            <StatusBadge player={player} />
            {player.lootbox_status === "trapped" && <BoxesBadge left={2 - (used[player.id] ?? 0)} nextIso={win.endIso} />}
          </p>
        </div>
      </header>

      <PlayerStatusStrip player={player} />

      <div className="pd-layout">
        <Checklist items={items} playerItems={player.player_lootbox_items} />
        <div className="pd-side">
          <aside className="pd-card pd-recent" aria-labelledby="drops-h">
            <h2 id="drops-h">Recent Drops</h2>
            <DropList rolls={rolls} items={byId(items)} />
            {rolls.length > 0 && <Link className="pd-view-all" prefetch={false} href={`/players/${player.slug}/drops`}>View all drops</Link>}
          </aside>
          <RobertsRuleCard />
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import type { RankedPlayer } from "@/lib/ranking";
import { displayName } from "@/lib/names";
import Avatar from "./Avatar";
import BoxesBadge from "./BoxesBadge";
import { StatusBadge } from "./Status";

/** One player in a ranked list (Home and Players). */
export default function PlayerCard({ row, boxesLeft, nextIso, avatarSize, showUsername = false }: {
  row: RankedPlayer; boxesLeft: number; nextIso: string; avatarSize: number; showUsername?: boolean;
}) {
  const { player: p, rank, collected, total, boxesToGo } = row;
  const trapped = p.lootbox_status === "trapped";
  return (
    <Link href={`/players/${p.slug}`} className={`panel player-card${boxesLeft > 0 ? " has-boxes" : ""}`} prefetch={false}>
      <span className={`player-rank${rank <= 3 ? ` top-${rank}` : ""}`} aria-label={`Rank ${rank}`}>#{rank}</span>
      <Avatar src={p.discord_avatar_url} name={displayName(p)} size={avatarSize} />
      <span className="player-card-text">
        <span className="player-card-name">{displayName(p)}</span>
        {showUsername && p.discord_username && <span className="player-card-user">@{p.discord_username}</span>}
        <StatusBadge player={p} progress={trapped ? `${collected}/${total}` : undefined} />
        {trapped && boxesToGo !== null && (
          <span className="player-card-estimate" title="Average from simulating the rest of their game with the real odds and rules">
            ~{Math.max(1, Math.round(boxesToGo))} box{Math.round(boxesToGo) === 1 ? "" : "es"} to go
          </span>
        )}
        {trapped && <span className="player-card-boxes"><BoxesBadge left={boxesLeft} nextIso={nextIso} /></span>}
      </span>
    </Link>
  );
}

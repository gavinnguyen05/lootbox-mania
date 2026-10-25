import Image from "next/image";
import type { Player } from "@/lib/types";

/** Small status message under the player header. */
export default function PlayerStatusStrip({ player }: { player: Player }) {
  if (player.lootbox_status === "trapped") {
    return (
      <div className="pd-strip trapped">
        <Image src="/assets/no-candy.png" alt="" width={32} height={32} className="pd-strip-icon" priority />
        <div>
          <p className="pd-strip-title">Trick-or-Treating suspended</p>
          <p className="pd-strip-sub">Complete your checklist to regain access.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="pd-strip escaped">
      <div>
        <p className="pd-strip-title">{player.escaped_via === "golden_kitkat" ? "Escaped via Golden KitKat!" : "You escaped!"}</p>
        <p className="pd-strip-sub">Trick-or-Treating privileges restored. Giovanni is waiting outside.</p>
      </div>
    </div>
  );
}

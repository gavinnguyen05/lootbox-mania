import type { Player } from "@/lib/types";

function Lock() {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden className="lock">
      <path fill="currentColor" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 15h8a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12 7h-.5V4.5A3.5 3.5 0 0 0 8 1Zm-2 6V4.5a2 2 0 1 1 4 0V7H6Zm2 2.25a1.25 1.25 0 0 1 .75 2.25V12.5h-1.5v-1a1.25 1.25 0 0 1 .75-2.25Z" />
    </svg>
  );
}

/** TRAPPED / ESCAPED label. Text plus icon, never color alone. */
export function StatusBadge({ player, progress }: { player: Pick<Player, "lootbox_status">; progress?: string }) {
  if (player.lootbox_status === "escaped") {
    return <span className="status status-escaped">✅ ESCAPED</span>;
  }
  return (
    <span className="status status-trapped">
      <Lock /> TRAPPED{progress ? <span className="status-progress"> {progress}</span> : null}
    </span>
  );
}

import LocalTime from "./LocalTime";
import LootboxIcon from "./LootboxIcon";

/** Boxes still claimable this window. Callers only show it for trapped players. */
export default function BoxesBadge({ left, nextIso }: { left: number; nextIso: string }) {
  if (left > 0) {
    return <span className="boxes-badge ready"><LootboxIcon /> {left} box{left === 1 ? "" : "es"} ready</span>;
  }
  return (
    <span className="boxes-badge">
      Next boxes at <LocalTime iso={nextIso} mode="time" />
    </span>
  );
}

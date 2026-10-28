import type { Item, PlayerItem } from "@/lib/types";
import { RARITY, CHECKLIST_RARITIES } from "@/lib/rarity";
import { buildRows } from "@/lib/progress";
import LocalTime from "./LocalTime";
import CandyIcon from "./CandyIcon";

const SPECIAL_EFFECT: Record<string, string> = {
  legendary: "Instant Escape",
  cursed: "Full Progress Reset",
};

/** Once a trapped player has this many, the candies they still need get highlighted. */
const ALMOST_THERE = 7;

function Box({ checked }: { checked: boolean }) {
  return <span className={`pd-check${checked ? " on" : ""}`} aria-hidden>{checked ? "✓" : ""}</span>;
}

export default function Checklist({ items, playerItems, trapped }: { items: Item[]; playerItems: PlayerItem[]; trapped: boolean }) {
  const rows = buildRows(items, playerItems);
  const required = rows.filter((r) => r.item.required);
  const collected = required.filter((r) => r.state.collected).length;
  const remaining = required.length - collected;
  const almostThere = trapped && remaining > 0 && collected >= ALMOST_THERE;
  const special = rows.filter((r) => !r.item.required);

  return (
    <section aria-labelledby="checklist-h" className="pd-checklist">
      <div className="pd-checklist-head">
        <h2 id="checklist-h">Candy Checklist</h2>
        <span className="pd-total">
          {almostThere && <span className="pd-almost">Only {remaining} left!</span>}
          {collected} / {required.length} collected
        </span>
      </div>

      <div className="pd-tiers">
        {CHECKLIST_RARITIES.map((rarity) => {
          const tier = required.filter((r) => r.item.rarity === rarity);
          const got = tier.filter((r) => r.state.collected).length;
          const complete = tier.length > 0 && got === tier.length;
          return (
            <div key={rarity} className={`pd-card pd-tier ${RARITY[rarity].className}${complete ? " complete" : ""}`}>
              <div className="pd-tier-head">
                <span className={`dot dot-${rarity}`} aria-hidden />
                <h3>{RARITY[rarity].label}</h3>
                {complete && <span className="pd-complete">✓ Complete</span>}
                <span className="pd-tier-count" aria-label={`${got} of ${tier.length} collected`}>{got} / {tier.length}</span>
              </div>
              <ul className="pd-rows">
                {tier.map(({ item, state }) => {
                  const needed = almostThere && !state.collected;
                  return (
                  <li key={item.id} className={`pd-row${state.collected ? "" : " missing"}${needed ? " needed" : ""}${state.excluded_by_roberts_rule ? " excluded" : ""}`}>
                    <Box checked={state.collected} />
                    <span className="pd-icon"><CandyIcon src={item.icon_path} size={28} /></span>
                    <span className="pd-name">
                      {item.name}
                      <span className="sr-only">{state.collected ? ", collected" : ", missing"}</span>
                    </span>
                    <span className="pd-copies">
                      {needed ? <span className="pd-need">Need</span> : state.times_rolled >= 2 ? `Copies: ${state.times_rolled}/3` : ""}
                    </span>
                    {state.excluded_by_roberts_rule && (
                      <span className="pd-note">Removed from loot pool — Robert&apos;s Rule IV</span>
                    )}
                  </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="pd-card pd-special">
        <h3 className="pd-special-title"><span className="dot dot-legendary" aria-hidden /> Special</h3>
        <ul className="pd-special-list">
          {special.map(({ item, state }) => {
            const pulled = state.times_rolled > 0;
            return (
              <li key={item.id} className={`pd-special-item ${RARITY[item.rarity].className}`}>
                <span className="pd-icon"><CandyIcon src={item.icon_path} size={28} /></span>
                <span className="pd-special-text">
                  <span className="pd-name">{item.name}</span>
                  <span className="pd-effect">{SPECIAL_EFFECT[item.rarity]}</span>
                </span>
                <span className={`pd-special-state${pulled ? " pulled" : ""}`}>
                  {!pulled
                    ? "Not Pulled"
                    : state.times_rolled > 1
                      ? `Pulled ${state.times_rolled} times`
                      : state.first_rolled_at
                        ? <>Pulled <LocalTime iso={state.first_rolled_at} /></>
                        : "Pulled"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

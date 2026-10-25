import { getItems } from "@/lib/data";
import { RARITY, RARITIES } from "@/lib/rarity";

export const metadata = { title: "How It Works | Lootbox Mania" };

export default async function HowItWorksPage() {
  const items = await getItems();
  const odds = RARITIES.map((t) => {
    const inTier = items.filter((i) => i.rarity === t && i.active);
    return { t, pct: inTier[0]?.base_probability ?? 0, names: inTier.map((i) => i.name).join(", ") };
  });

  return (
    <div className="page">
      <h1 className="page-title">Lootbox Royale III</h1>
      <p className="rules-subtitle">Asianhood Candy Reserve has run dry. Here&rsquo;s how to get out.</p>

      <div className="rules">
        <div className="rules-intro">
          <p>
            Due to a severe data leak, Asianhood Candy Reserve has <strong>RUN DRY</strong>.
            Until you finish Lootbox Royale III, your Trick-or-Treating privileges are gone.
          </p>
          <p>
            Your job is simple: open lootboxes, collect everything Commandant Harrison is looking for, and get yourself out.
          </p>
        </div>

        <section className="panel">
          <h2>Getting your lootboxes</h2>
          <p>You get <strong>2 lootboxes at 12:00 AM</strong> and <strong>2 more at 8:00 PM</strong> Los Angeles time.</p>
          <p>That&rsquo;s <strong>4 boxes per day</strong> if you claim both drops.</p>
          <p>Unused boxes do <strong>not</strong> carry over, so if you miss them, they&rsquo;re gone.</p>
          <p>
            When you&rsquo;re ready to open yours, head to Discord and ping <strong>@harrisonsexy</strong> in the
            candy-unboxing channel with something like:
          </p>
          <p className="rules-callout">OPEN LOOTBOX</p>
        </section>

        <section className="panel">
          <h2>What can you pull?</h2>
          <ul className="odds">
            {odds.map(({ t, pct, names }) => (
              <li key={t}>
                <span>
                  <span className={`odds-tier ${RARITY[t].className}`}>
                    <span className={`dot dot-${t}`} aria-hidden />
                    {RARITY[t].label}
                  </span>
                  <span className="odds-names">{names}</span>
                </span>
                <span className="odds-pct">{pct}%</span>
              </li>
            ))}
          </ul>
          <p className="rules-note">Common, Uncommon, and Rare candies make up your normal checklist. Legendary and Cursed drops are special.</p>
        </section>

        <section className="panel">
          <h2>How to escape</h2>
          <p>To escape normally, collect all:</p>
          <p className="rules-list"><strong>5 Common</strong><br /><strong>3 Uncommon</strong><br /><strong>2 Rare</strong></p>
          <p>That&rsquo;s <strong>10 unique candies total</strong>.</p>
          <p>Once you finish the checklist, your Trick-or-Treating privileges are restored and <strong>Giovanni is waiting outside</strong>.</p>
          <p>There is also one shortcut:</p>
          <p>Pull the <strong>Golden KitKat</strong> and you instantly complete Lootbox Royale III, no matter how much of your checklist you have left.</p>
        </section>

        <section className="panel">
          <h2>Robert&rsquo;s Rule IV</h2>
          <p>If you pull the <strong>same exact candy 3 times</strong>, that candy gets removed from your personal loot pool.</p>
          <p>For example, if you pull Fun Dip three times, you can never roll Fun Dip again for the rest of the event.</p>
          <p>This only affects <strong>you</strong>. Everyone else keeps their normal odds.</p>
          <p className="rules-note">Basically: duplicates eventually stop wasting your boxes.</p>
        </section>

        <section className="panel">
          <h2>The curse</h2>
          <p>If you somehow pull the <strong>Fent-Laced Ring Pop</strong>, you are cooked.</p>
          <p>Your entire Lootbox Royale checklist resets:</p>
          <ul className="rules-bullets">
            <li>collected candies</li>
            <li>copy counts</li>
            <li>Robert&rsquo;s Rule IV removals</li>
          </ul>
          <p>You go all the way back to the beginning.</p>
          <p className="rules-note">Your old rolls still stay in your history. Your progress just gets wiped.</p>
        </section>

        <section className="panel">
          <h2>One last thing</h2>
          <p>This is an individual event.</p>
          <p>You have to collect everything <strong>yourself</strong>. No trading, sharing, or combining checklists with someone else.</p>
          <p className="rules-signoff">Happy hunting.</p>
        </section>
      </div>
    </div>
  );
}

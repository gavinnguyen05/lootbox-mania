import Image from "next/image";

export default function RobertsRuleCard() {
  return (
    <section className="pd-card pd-rule" aria-labelledby="rule-h">
      <div className="pd-rule-head">
        <Image src="/assets/roberts-rule.png" alt="" width={44} height={28} className="pd-rule-icon" />
        <h2 id="rule-h">Robert&rsquo;s Rule IV</h2>
      </div>
      <p>
        If you receive 3 of the same candy type (not rarity), that candy will be completely crossed off from your
        personal lootbox odds. If you roll it again, the result will automatically be rerolled.
      </p>
    </section>
  );
}

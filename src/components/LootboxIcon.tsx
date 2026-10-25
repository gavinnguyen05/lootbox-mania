import Image from "next/image";

/** Small lootbox art from /assets/lootbox.png, used wherever a box count is shown. */
export default function LootboxIcon({ size = 16 }: { size?: number }) {
  return <Image src="/assets/lootbox.png" alt="" width={size} height={size} className="lootbox-icon" />;
}

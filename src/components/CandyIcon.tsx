import Image from "next/image";

/**
 * Candy art from the item's icon_path, resized to the displayed size.
 * Decorative by default (alt=""), since the candy name is always next to it.
 */
export default function CandyIcon({ src, size = 28, alt = "", priority = false }: { src: string; size?: number; alt?: string; priority?: boolean }) {
  return <Image className="candy-icon" src={src} alt={alt} width={size} height={size} priority={priority} />;
}

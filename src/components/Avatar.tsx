import Image from "next/image";

/** Discord avatar, resized by Next's image optimizer. Initials if the player has none. */
export default function Avatar({ src, name, size, priority = false }: { src: string | null; name: string; size: number; priority?: boolean }) {
  if (!src) {
    return (
      <span className="avatar avatar-fallback" style={{ "--size": `${size}px` } as React.CSSProperties} aria-hidden>
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return <Image className="avatar" src={src} alt="" width={size} height={size} priority={priority} />;
}

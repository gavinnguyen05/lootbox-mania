import Link from "next/link";
import type { Player } from "@/lib/types";
import { displayName } from "@/lib/names";
import Avatar from "./Avatar";

export default function FeaturedQuote({ quote, player }: {
  quote: { slug: string; fallbackName: string; title: string; text: string };
  player?: Player;
}) {
  const name = player ? displayName(player) : quote.fallbackName;
  return (
    <figure className="featured-quote">
      <blockquote>
        <p>{quote.text}</p>
      </blockquote>
      <figcaption className="quote-by">
        {player && <Avatar src={player.discord_avatar_url} name={name} size={36} />}
        <span className="quote-who">
          {player ? (
            <Link href={`/players/${player.slug}`} prefetch={false} className="quote-name">{name}</Link>
          ) : (
            <span className="quote-name">{name}</span>
          )}
          <span className="quote-title"><span aria-hidden>🚨</span> {quote.title}</span>
        </span>
      </figcaption>
    </figure>
  );
}

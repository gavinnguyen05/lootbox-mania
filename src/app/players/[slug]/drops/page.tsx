import Link from "next/link";
import { notFound } from "next/navigation";
import { byId, getItems, getPlayerBySlug, getRollPage } from "@/lib/data";
import { displayName } from "@/lib/names";
import { pageParam } from "@/lib/validate";
import DropList from "@/components/DropList";


type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string | string[] }> };

export default async function DropsPage({ params, searchParams }: Props) {
  const player = await getPlayerBySlug((await params).slug);
  if (!player) notFound();
  const page = pageParam((await searchParams).page);
  const [items, { rolls, hasMore }] = await Promise.all([getItems(), getRollPage(player.id, page)]);
  const base = `/players/${player.slug}/drops`;

  return (
    <div className="page">
      <p><Link className="view-all" prefetch={false} href={`/players/${player.slug}`}>Back to checklist</Link></p>
      <h1 className="page-title drops-title">{displayName(player)}&apos;s drops</h1>
      <p className="page-lede drops-lede">
        Every box opened, newest first. History before a curse stays here even though the checklist was wiped.
      </p>
      <div className="panel drops-card drops-history">
        <DropList rolls={rolls} items={byId(items)} empty={page === 1 ? "No boxes opened yet." : "No more drops."} />
      </div>
      {(page > 1 || hasMore) && (
        <nav className="pager" aria-label="Drop history pages">
          {page > 1 ? <Link className="btn btn-sm" prefetch={false} href={page === 2 ? base : `${base}?page=${page - 1}`}>Newer</Link> : <span />}
          <span className="muted small">Page {page}</span>
          {hasMore ? <Link className="btn btn-sm" prefetch={false} href={`${base}?page=${page + 1}`}>Older</Link> : <span />}
        </nav>
      )}
    </div>
  );
}

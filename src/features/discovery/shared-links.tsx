// X11M: this browser's shared links. Server-rendered from the creator's own rows, so listing,
// expiry and revocation work without JavaScript; only copying and the live reply need scripts.
import type { PublicLocale } from "@/i18n/config";
import { Notice } from "@/ui/notice";
import type { DiscoveryCopy } from "./copy";
import type { ShareCopy } from "./share-copy";
import type { CreatorLinks } from "./share-model";
import type { RevokeShareAction } from "./share-state";
import { SharedLinkCard } from "./shared-link-card";

export function SharedLinks({
  locale,
  copy,
  labels,
  links,
  cursor,
  revoke,
}: {
  locale: PublicLocale;
  copy: DiscoveryCopy;
  labels: ShareCopy;
  /** Null when this browser holds no creator cookie, so nothing can be listed or managed. */
  links: CreatorLinks | null;
  /** The opaque cursor of an older page: the newest links stay one link away, and a native
   * revoke returns to this same page. */
  cursor?: string;
  revoke: RevokeShareAction;
}) {
  const paged = cursor !== undefined;
  const here =
    cursor === undefined
      ? `/${locale}/saved`
      : `/${locale}/saved?links=${encodeURIComponent(cursor)}`;
  return (
    <section
      id="shared-links"
      aria-labelledby="shared-links-heading"
      className="min-w-0 scroll-mt-24 space-y-5"
    >
      <header className="space-y-1">
        <h2 id="shared-links-heading" className="text-heading font-semibold">
          {labels.linksTitle}
        </h2>
        <p className="max-w-reading text-compact text-text-muted">{labels.linksLead}</p>
      </header>
      {links?.status === "failed" ? (
        <Notice tone="warning" role="status">
          {labels.linksFailed}
        </Notice>
      ) : links?.status === "ok" && links.links.length ? (
        <ul className="grid min-w-0 gap-5">
          {links.links.map((view) => (
            <li key={view.id} className="min-w-0">
              <SharedLinkCard
                locale={locale}
                view={view}
                labels={labels}
                revoke={revoke}
                permalink={here}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-compact">{labels.linksEmpty}</p>
      )}
      {paged || (links?.status === "ok" && links.nextCursor) ? (
        <nav aria-label={labels.linksTitle} className="flex flex-wrap gap-x-6 gap-y-2">
          {paged ? (
            <a className="font-semibold underline" href={`/${locale}/saved#shared-links`}>
              {labels.linksNewest}
            </a>
          ) : null}
          {links?.status === "ok" && links.nextCursor ? (
            <a
              className="font-semibold underline"
              href={`/${locale}/saved?links=${encodeURIComponent(links.nextCursor)}#shared-links`}
            >
              {labels.linksOlder}
            </a>
          ) : null}
        </nav>
      ) : null}
      <details className="rounded-panel border border-border bg-surface">
        <summary className="min-h-control cursor-pointer px-4 py-3 text-compact font-semibold">
          {labels.lostTitle}
        </summary>
        <div className="border-t border-border p-4">
          <div className="max-w-reading space-y-3 text-compact">
            <p>{labels.lostBody}</p>
            <p>
              {labels.lostReport}{" "}
              <a className="font-semibold underline" href={`/${locale}/inquire?purpose=question`}>
                {copy.ask}
              </a>
            </p>
          </div>
        </div>
      </details>
    </section>
  );
}

import { discoveryCopy } from "@/features/discovery/copy";
import { legacyMediaPath } from "@/server/legacy/media";
import type { LegacyPage } from "@/server/legacy/pages";
import { presentLegacyPage } from "@/server/legacy/presentation";
import { buttonClass } from "@/ui/button-class";
import { Notice } from "@/ui/notice";
import { StatusBadge } from "@/ui/status-badge";
import { archiveCopy } from "./archive-copy";

/** P21 / F09: preserve identity, explain historical limits and offer a native next step. */
export function ArchiveScreen({ page }: { page: LegacyPage }) {
  const copy = archiveCopy(page.locale);
  const source = presentLegacyPage(page);
  const kind = page.listing ? "listing" : page.sourceType;
  const identity =
    kind === "listing" || kind === "post" || kind === "taxonomy" ? copy[kind] : copy.page;
  return (
    <article
      className="min-w-0 space-y-6 wrap-anywhere"
      lang={page.locale}
      dir={page.locale === "he" ? "rtl" : "ltr"}
      data-legacy-source-hash={page.sourceHash}
    >
      <header className="max-w-reading space-y-3">
        <StatusBadge family="availability" tone="neutral" label={identity} />
        <h1 className="text-heading font-semibold lg:text-title">{page.title}</h1>
        {page.listing ? (
          <p className="flex flex-wrap gap-x-2 text-dense">
            <span className="text-text-muted">{discoveryCopy(page.locale).reference}</span>
            <bdi className="font-semibold">{page.listing.reference}</bdi>
          </p>
        ) : null}
      </header>
      <Notice tone="info">
        <p>{page.listing ? copy.availability : copy.historical}</p>
      </Notice>
      <div className="grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <aside
          aria-labelledby="archive-contact"
          className="min-w-0 space-y-3 rounded-panel border border-border bg-subtle p-5 lg:order-2"
        >
          <h2 id="archive-contact" className="text-subheading font-semibold">
            {copy.contact}
          </h2>
          <p className="text-compact">{copy.quote}</p>
          {page.listing ? (
            <p className="text-compact font-semibold">
              <bdi>{page.listing.reference}</bdi>
            </p>
          ) : null}
          <a href="tel:+359879696870" className={buttonClass("primary", "w-full flex-wrap")}>
            <span>{copy.call}</span> <bdi>+359879696870</bdi>
          </a>
          <a
            href={`/${page.locale}/properties`}
            className={buttonClass("secondary", "w-full text-center")}
          >
            {copy.search}
          </a>
        </aside>
        <div className="min-w-0 space-y-8 lg:order-1">
          {source.facts.length ? (
            <section aria-labelledby="archive-facts" className="space-y-4">
              <div className="space-y-1">
                <h2 id="archive-facts" className="text-subheading font-semibold">
                  {copy.facts}
                </h2>
                <p className="max-w-reading text-caption text-text-muted">{copy.factsNote}</p>
              </div>
              <dl data-legacy-source-facts className="grid min-w-0 gap-x-6 gap-y-4 sm:grid-cols-2">
                {source.facts.map((field) => (
                  <div
                    key={`${field.label}:${field.value}`}
                    className="min-w-0 border-b border-divider pb-3"
                  >
                    <dt className="text-caption text-text-muted">{field.label}</dt>
                    <dd className="text-body font-semibold">
                      <bdi>{field.value}</bdi>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
          {page.media.length ? (
            <section aria-labelledby="archive-media" className="space-y-4">
              <div className="space-y-1">
                <h2 id="archive-media" className="text-subheading font-semibold">
                  {copy.media}
                </h2>
                <p className="max-w-reading text-caption text-text-muted">{copy.mediaNote}</p>
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                {page.media.map((photo, index) => {
                  const path = legacyMediaPath(photo.url) ?? photo.url;
                  return (
                    <figure key={photo.id} className="min-w-0">
                      <a
                        href={path}
                        className="block space-y-1 rounded-card underline underline-offset-4"
                      >
                        {/* Preserve the uncropped source; the native link remains usable when
                            the browser cannot load the image or JavaScript is disabled. */}
                        {/* biome-ignore lint/performance/noImgElement: source photo dimensions are unknown; do not fabricate optimizer dimensions. */}
                        <img
                          src={path}
                          alt={photo.alt}
                          loading={index ? "lazy" : "eager"}
                          className="aspect-[4/3] h-auto w-full rounded-card bg-subtle object-contain"
                        />
                        <span className="inline-flex min-h-control items-center text-dense">
                          {copy.openImage} <bdi className="ms-1">{index + 1}</bdi>
                        </span>
                      </a>
                    </figure>
                  );
                })}
              </div>
            </section>
          ) : null}
          <section aria-labelledby="archive-reading" className="max-w-reading space-y-3">
            <h2 id="archive-reading" className="text-subheading font-semibold">
              {copy.reading}
            </h2>
            {/* React renders source prose as text, never as WordPress markup or a live form. */}
            <div data-legacy-source-body className="whitespace-pre-wrap text-body">
              {source.bodyText}
            </div>
            {page.contentState === "verified_empty_archive" ? (
              <p data-legacy-interface-copy role="status" className="text-body text-text-muted">
                {copy.emptyArchive}
              </p>
            ) : !source.bodyText ? (
              <p className="text-body text-text-muted">{copy.noText}</p>
            ) : null}
          </section>
          {source.contentLinks.length ? (
            <section aria-labelledby="archive-links" className="space-y-3">
              <h2 id="archive-links" className="text-subheading font-semibold">
                {copy.sourceLinks}
              </h2>
              <ul className="grid min-w-0 gap-1 text-dense">
                {source.contentLinks.map((link) => (
                  <li key={link.url} className="min-w-0">
                    <a
                      href={link.url}
                      className="inline-flex min-h-control items-center underline underline-offset-4"
                    >
                      <bdi>{link.text}</bdi>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <p className="max-w-reading text-caption text-text-muted">
            <a
              href={page.sourceUrl}
              className="inline-flex min-h-control items-center underline underline-offset-4"
            >
              {copy.source}
              <span aria-hidden="true"> · </span>
              <bdi>{page.sourceHost}</bdi>
            </a>
          </p>
        </div>
      </div>
    </article>
  );
}

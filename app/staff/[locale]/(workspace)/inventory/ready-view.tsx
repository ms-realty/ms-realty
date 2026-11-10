// ADR 0012 bulk carry-over: listings that pass every check and are still on the market, ready
// for one person to check, select and publish on one attestation. One result per listing.
import { randomUUID } from "node:crypto";
import { getDb } from "@/db/client";
import type { Actor } from "@/domain/capabilities";
import { inventoryCopy } from "@/features/inventory/copy";
import { bulkLanguageAction, bulkPublishAction } from "@/features/inventory/publish-actions";
import { fillCopy, languageName, publishCopy } from "@/features/inventory/publish-copy";
import { BulkLanguageForm, BulkPublishForm } from "@/features/inventory/publish-forms";
import { isPublicLocale, publicLocales } from "@/i18n/config";
import { workflowCopy } from "@/i18n/workflow-copy";
import { readyToPublish } from "@/server/publication/attested";
import { type ReadyLanguagePage, readyLanguages } from "@/server/publication/languages";
import { buttonClass } from "@/ui/button-class";
import { cx } from "@/ui/cx";
import { controlClass } from "@/ui/field-class";
import { SearchIcon } from "@/ui/icons";

function money(locale: string, value: unknown) {
  const amount = value as { amountMinor?: unknown; currency?: unknown; period?: unknown } | null;
  if (typeof amount?.amountMinor !== "number" || typeof amount.currency !== "string") return null;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: amount.currency,
    maximumFractionDigits: 0,
  }).format(amount.amountMinor / 100);
}

function area(locale: string, value: unknown) {
  const measured = value as { value?: unknown } | null;
  return typeof measured?.value === "number"
    ? `${new Intl.NumberFormat(locale).format(measured.value)} m²`
    : null;
}

export async function ReadyToPublish({
  locale,
  actor,
  language,
  query,
  cursor,
}: {
  locale: string;
  actor: Actor;
  /** A public language other than Bulgarian: the per-language decision for that language. */
  language?: string;
  /** Typed search: listing numbers (several, separated by spaces or commas) or a title. */
  query?: string;
  /** Where the next page starts; a cursor is only a position, every request rechecks access. */
  cursor?: string;
}) {
  const inventory = inventoryCopy(locale);
  const o10 = inventory.o10;
  const copy = publishCopy(locale);
  const workspace = workflowCopy(locale, "listingWorkspace");
  const chosen = language && isPublicLocale(language) && language !== "bg" ? language : null;
  const db = getDb();
  const typed = (query ?? "").trim().slice(0, 200);
  // One page of candidates per request: the cost never grows with the number of listings.
  const page = chosen
    ? null
    : await readyToPublish(db, actor, { query: typed, ...(cursor ? { cursor } : {}) });
  const languagePage = chosen
    ? await readyLanguages(db, actor, { query: typed, ...(cursor ? { cursor } : {}) })
    : null;
  const rows = page?.rows ?? [];
  const languages: ReadyLanguagePage["byLanguage"] = languagePage?.byLanguage ?? new Map();
  const operationId = randomUUID();
  const withQuery = (base: string, extra = "") => {
    const search = new URLSearchParams(base);
    if (typed) search.set("q", typed);
    for (const [key, value] of new URLSearchParams(extra)) search.set(key, value);
    return `/${locale}/inventory?${search.toString()}`;
  };
  const picker: [string, string, string][] = [
    ["bg", copy.ready.sourceView, withQuery("view=ready")],
    ...publicLocales
      .filter((code) => code !== "bg")
      .map((code): [string, string, string] => [
        code,
        languageName(locale, code),
        withQuery("view=ready", `language=${code}`),
      ]),
  ];
  const nextCursor = page?.nextCursor ?? languagePage?.nextCursor ?? null;
  const nextHref = nextCursor
    ? withQuery("view=ready", `${chosen ? `language=${chosen}&` : ""}cursor=${nextCursor}`)
    : null;
  const sameView = withQuery("view=ready", chosen ? `language=${chosen}` : "");
  const current = chosen ?? "bg";
  const chosenName = chosen ? languageName(locale, chosen) : "";
  const languageRows = chosen ? (languages.get(chosen) ?? []) : [];
  const tabs = [
    ["all", o10.all, `/${locale}/inventory`],
    ["needs", o10.needs, `/${locale}/inventory?view=needs`],
    ["mine", o10.mine, `/${locale}/inventory?view=mine`],
    ["ready", copy.ready.view, `/${locale}/inventory?view=ready`],
  ] as const;
  return (
    <div className="flex flex-col gap-4 px-gutter py-5 sm:gap-6 sm:px-gutter-wide sm:py-6">
      <header>
        <h1 className="text-heading font-semibold sm:text-title">{workspace.directoryTitle}</h1>
      </header>
      <nav aria-label={o10.views}>
        <ul className="flex flex-wrap gap-x-4 border-b border-divider">
          {tabs.map(([id, label, href]) => (
            <li key={id} className="flex">
              <a
                href={href}
                aria-current={id === "ready" ? "page" : undefined}
                className={cx(
                  "flex min-h-control items-center justify-center border-b-2 p-3 text-center text-dense font-semibold no-underline",
                  id === "ready"
                    ? "border-action text-action"
                    : "border-transparent text-text-muted hover:bg-subtle hover:text-text",
                )}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {/* Which language this decision is about: Bulgarian first, then each translation. */}
      <nav aria-label={copy.ready.languagesLabel}>
        <ul className="flex flex-wrap gap-2">
          {picker.map(([code, label, href]) => (
            <li key={code}>
              <a
                href={href}
                lang={code === "bg" ? undefined : locale}
                aria-current={code === current ? "page" : undefined}
                className={cx(
                  "inline-flex min-h-control items-center gap-2 rounded-control border px-3 text-dense font-semibold no-underline",
                  code === current
                    ? "border-action bg-selected text-action"
                    : "border-border text-text hover:bg-subtle",
                )}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <form method="get" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <input type="hidden" name="view" value="ready" />
        {chosen ? <input type="hidden" name="language" value={chosen} /> : null}
        <div className="min-w-0">
          <label htmlFor="ready-search" className="sr-only">
            {copy.ready.search}
          </label>
          <input
            id="ready-search"
            name="q"
            type="search"
            maxLength={200}
            defaultValue={typed}
            placeholder={copy.ready.searchHint}
            aria-describedby="ready-search-hint"
            className={controlClass}
          />
          <p id="ready-search-hint" className="sr-only">
            {copy.ready.searchHint}
          </p>
        </div>
        <button type="submit" className={buttonClass("secondary", "min-h-input px-3")}>
          <SearchIcon className="size-5" />
          <span className="sr-only">{copy.ready.searchApply}</span>
        </button>
      </form>
      {chosen ? (
        <>
          <p className="max-w-reading">
            {fillCopy(copy.ready.languageLead, { language: chosenName })}
          </p>
          {languageRows.length === 0 ? (
            <p className="rounded-panel bg-subtle p-6">
              {typed
                ? copy.ready.noMatch
                : fillCopy(copy.ready.languageNone, { language: chosenName })}
            </p>
          ) : (
            <BulkLanguageForm
              action={bulkLanguageAction.bind(null, locale, chosen)}
              initialState={{
                values: { attested: "", selected: "" },
                operationId,
                expectedRevision: null,
                responseId: randomUUID(),
                outcome: { kind: "idle" },
              }}
              permalink={sameView}
              reconciliation={{ href: sameView, label: copy.ready.view }}
              formCopy={inventory.form}
              rows={languageRows.map((row) => ({
                reference: row.reference,
                title: row.title,
                excerpt:
                  row.description.length > 280
                    ? `${row.description.slice(0, 280).trimEnd()}…`
                    : row.description,
                sourceTitle: row.sourceTitle,
                lang: row.locale,
                warnings: row.checks.warnings.map((code) => copy.languages.checks[code]),
                href: `/${locale}/inventory/${encodeURIComponent(row.reference)}/publish#languages`,
                selectLabel: fillCopy(copy.ready.select, { reference: row.reference }),
              }))}
              labels={{
                attested: fillCopy(copy.ready.languageAttest, { language: chosenName }),
                submit: fillCopy(copy.ready.publishLanguage, { language: chosenName }),
                list: chosenName,
                source: copy.languages.source,
              }}
            />
          )}
        </>
      ) : null}
      {chosen ? null : <p className="max-w-reading">{copy.ready.lead}</p>}
      {chosen ? null : rows.length === 0 ? (
        <p className="rounded-panel bg-subtle p-6">
          {typed ? copy.ready.noMatch : nextHref || cursor ? copy.ready.noneHere : copy.ready.none}
        </p>
      ) : (
        <BulkPublishForm
          action={bulkPublishAction.bind(null, locale)}
          initialState={{
            values: { attested: "", selected: "" },
            operationId,
            expectedRevision: null,
            responseId: randomUUID(),
            outcome: { kind: "idle" },
          }}
          permalink={sameView}
          reconciliation={{ href: sameView, label: copy.ready.view }}
          formCopy={inventory.form}
          rows={rows.map((row) => ({
            reference: row.reference,
            version: row.version,
            title: row.cleanedTitle ?? row.title,
            detail: row.settlement,
            price:
              row.price.state === "withheld"
                ? copy.priceOnRequest
                : (money(locale, row.price.value) ?? copy.notKnown),
            area: area(locale, row.area.value) ?? copy.notKnown,
            // The tick clears the photos the row names: the count is stated, never implied.
            photos: row.photoCount
              ? fillCopy(copy.photoCount, { n: row.photoCount })
              : copy.noPhotos,
            ...(row.thumbnailId
              ? { thumbnail: `/api/files/private/media/${row.thumbnailId}?preview=1` }
              : {}),
            // The cleaned title is shown in the row; the tick below confirms it.
            warnings: row.warnings
              .filter((code) => code !== "title_site_suffix")
              .map((code) => copy.warnings[code]),
            href: `/${locale}/inventory/${encodeURIComponent(row.reference)}/publish`,
            selectLabel: fillCopy(copy.ready.select, { reference: row.reference }),
          }))}
          labels={{
            attested: copy.ready.attestation,
            submit: copy.ready.publish,
            list: copy.ready.view,
            selectAll: copy.ready.selectAll,
            listing: copy.ready.listing,
            photo: copy.ready.photo,
            price: copy.price,
            area: copy.area,
            noPhoto: copy.noPhotos,
            ...(rows.some((row) => row.cleanedTitle) ? { cleanTitles: copy.cleanTitles } : {}),
          }}
        />
      )}
      {/* The count in words, and a link that carries the cursor to the next listings. */}
      {chosen ? null : (
        <p className="text-dense text-text-muted" data-ready-count>
          {fillCopy(copy.ready.shown, { n: rows.length })}
          {page && page.remaining > 0 ? ` ${fillCopy(copy.ready.more, { m: page.remaining })}` : ""}
        </p>
      )}
      {nextHref ? (
        <a href={nextHref} className={buttonClass("secondary", "justify-self-start")}>
          {copy.ready.showMore}
        </a>
      ) : null}
    </div>
  );
}

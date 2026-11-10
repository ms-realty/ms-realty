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
import { readyLanguages } from "@/server/publication/languages";
import { cx } from "@/ui/cx";

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
}: {
  locale: string;
  actor: Actor;
  /** A public language other than Bulgarian: the per-language decision for that language. */
  language?: string;
}) {
  const inventory = inventoryCopy(locale);
  const o10 = inventory.o10;
  const copy = publishCopy(locale);
  const workspace = workflowCopy(locale, "listingWorkspace");
  const chosen = language && isPublicLocale(language) && language !== "bg" ? language : null;
  const db = getDb();
  const [rows, languages] = await Promise.all([
    chosen ? Promise.resolve([]) : readyToPublish(db, actor),
    readyLanguages(db, actor),
  ]);
  const operationId = randomUUID();
  const picker: [string, string, string, number | null][] = [
    ["bg", copy.ready.sourceView, `/${locale}/inventory?view=ready`, rows.length || null],
    ...publicLocales
      .filter((code) => code !== "bg")
      .map((code): [string, string, string, number | null] => [
        code,
        languageName(locale, code),
        `/${locale}/inventory?view=ready&language=${code}`,
        languages.get(code)?.length ?? 0,
      ]),
  ];
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
          {picker.map(([code, label, href, count]) => (
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
                {count !== null ? (
                  <span className="font-normal text-text-muted tabular-nums">{count}</span>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {chosen ? (
        <>
          <p className="max-w-reading">
            {fillCopy(copy.ready.languageLead, { language: chosenName })}
          </p>
          {languageRows.length === 0 ? (
            <p className="rounded-panel bg-subtle p-6">
              {fillCopy(copy.ready.languageNone, { language: chosenName })}
            </p>
          ) : (
            <BulkLanguageForm
              action={bulkLanguageAction.bind(null, locale, chosen)}
              initialState={{
                values: { attested: "" },
                operationId,
                expectedRevision: null,
                responseId: randomUUID(),
                outcome: { kind: "idle" },
              }}
              permalink={`/${locale}/inventory?view=ready&language=${chosen}`}
              reconciliation={{
                href: `/${locale}/inventory?view=ready&language=${chosen}`,
                label: copy.ready.view,
              }}
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
        <p className="rounded-panel bg-subtle p-6">{copy.ready.none}</p>
      ) : (
        <BulkPublishForm
          action={bulkPublishAction.bind(null, locale)}
          initialState={{
            values: { attested: "" },
            operationId,
            expectedRevision: null,
            responseId: randomUUID(),
            outcome: { kind: "idle" },
          }}
          permalink={`/${locale}/inventory?view=ready`}
          reconciliation={{ href: `/${locale}/inventory?view=ready`, label: copy.ready.view }}
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
    </div>
  );
}

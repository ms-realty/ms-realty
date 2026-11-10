// O16 one decision (ADR 0012): what the public will see, what the system checked, one
// attestation and Publish. After publishing: where it is live, and Unpublish. The detailed
// review stays one link away for anyone who wants each check and decision separately.
import { randomUUID } from "node:crypto";
import { sourceLocale } from "@/config/tenant";
import { getDb } from "@/db/client";
import { bedroomCount, inventoryCopy } from "@/features/inventory/copy";
import {
  publishLanguagesAction,
  publishListingAction,
  unpublishListingAction,
} from "@/features/inventory/publish-actions";
import {
  blockReason,
  fillCopy,
  languageName,
  publishCopy,
} from "@/features/inventory/publish-copy";
import { LanguagesForm, PublishForm, UnpublishForm } from "@/features/inventory/publish-forms";
import { PrivateMediaPreview } from "@/features/inventory/thumbnail";
import { ListingIdentity, ListingNavigation } from "@/features/inventory/workspace";
import { privateRead } from "@/features/work/screens";
import { localeEndonyms } from "@/i18n/config";
import { requireStaffPage } from "@/server/auth/pages";
import { getEnv } from "@/server/config/env";
import { publishView, reviewBlockers } from "@/server/publication/attested";
import { languageView } from "@/server/publication/languages";
import { buttonClass } from "@/ui/button-class";
import { Notice } from "@/ui/notice";

function money(locale: string, value: unknown) {
  const amount = value as { amountMinor?: unknown; currency?: unknown } | null;
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

export default async function PublishPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; reference: string }>;
  searchParams: Promise<{ done?: string; unpublished?: string }>;
}) {
  const { locale, reference } = await params;
  const query = await searchParams;
  const session = await requireStaffPage(locale);
  const view = await privateRead(() => publishView(getDb(), session.actor, reference));
  const languages = await privateRead(() => languageView(getDb(), session.actor, reference));
  const copy = publishCopy(locale);
  const inventory = inventoryCopy(locale);
  const ref = view.listing.reference;
  const path = `/${locale}/inventory/${encodeURIComponent(ref)}`;
  const permalink = `${path}/publish`;
  const { content, checks } = view;
  const live = view.live.length > 0;
  const publicUrl = `${getEnv().hosts.public}/${sourceLocale}/properties/${ref}/${ref.toLowerCase()}`;
  const newerVersion =
    content.pendingDraft || view.listing.approvedRevisionId !== (view.revision?.id ?? null);
  // A rent period the import left open is fixed in place by the decision itself.
  const blockers = checks.blockers.filter((code) => code !== "rent_period_unconfirmed");
  const fixedInReview =
    blockers.length > 0 && blockers.every((code) => reviewBlockers.includes(code));
  const showForm = view.mayPublish && blockers.length === 0 && (!live || newerVersion);
  const notKnown = copy.notKnown;
  const shownPhotos = view.photos.filter(
    (photo) => photo.readiness === "shown" || photo.readiness === "clearable",
  );
  const preview: [string, string][] = [
    [
      copy.price,
      content.price.state === "withheld"
        ? copy.priceOnRequest
        : content.rentAmount
          ? `${money(locale, content.rentAmount)}, ${copy.perMonth}`
          : (money(locale, content.price.value) ?? notKnown),
    ],
    [copy.area, area(locale, content.area.value) ?? notKnown],
    [
      copy.bedrooms,
      typeof content.bedrooms.value === "number"
        ? bedroomCount(locale, content.bedrooms.value)
        : notKnown,
    ],
    [
      copy.location,
      [view.property.settlement, view.property.region].filter(Boolean).join(", ") || notKnown,
    ],
  ];
  const status = (operationId: string) => ({
    href: `/${locale}/inventory/operations/${operationId}?reference=${encodeURIComponent(ref)}`,
    label: inventory.operation,
  });
  const publishOperation = randomUUID();
  const unpublishOperation = randomUUID();
  const languagesOperation = randomUUID();
  const title = content.cleanedTitle ?? content.title;
  // Language ticks join the Publish decision before the listing is online, and their own
  // decision once it is (a language never goes online before the Bulgarian text).
  const languageForm = showForm ? "listing-publish-form" : live ? "listing-languages-form" : null;
  const tickable = languages.languages.filter(
    (language) => !language.live && language.mayApprove && language.checks.blockers.length === 0,
  );

  return (
    <div className="flex flex-col gap-6 px-gutter py-5 sm:px-gutter-wide sm:py-6">
      <ListingIdentity locale={locale} reference={ref} title={title} heading />
      <ListingNavigation locale={locale} reference={ref} current="publish" />

      {query.unpublished && !live ? (
        <Notice
          tone="success"
          role="status"
          title={fillCopy(copy.unpublished, { reference: ref })}
        />
      ) : null}

      {live ? (
        <section
          aria-labelledby="publish-live"
          className="grid gap-4 rounded-panel border border-success bg-success-soft p-5"
          data-publish-state="live"
        >
          <h2 id="publish-live" className="text-section font-semibold">
            {copy.live}
          </h2>
          <p role={query.done ? "status" : undefined}>
            {fillCopy(copy.liveLead, { reference: ref })}
          </p>
          {newerVersion ? <p className="font-semibold">{copy.liveOutdated}</p> : null}
          <a href={publicUrl} className={buttonClass("secondary", "justify-self-start")}>
            {copy.liveAt}
          </a>
          {view.live.length > 1 ? (
            <p>
              {fillCopy(copy.alsoLive, {
                language: view.live
                  .filter((l) => l !== sourceLocale)
                  .map((l) => localeEndonyms[l])
                  .join(", "),
              })}
            </p>
          ) : null}
          {view.mayPublish ? (
            <div className="grid gap-3 border-t border-divider pt-4">
              <p className="text-dense text-text-muted">{copy.unpublishLead}</p>
              <UnpublishForm
                action={unpublishListingAction.bind(null, locale, ref)}
                initialState={{
                  values: { confirmed: "" },
                  operationId: unpublishOperation,
                  expectedRevision: view.listing.publicationGeneration,
                  responseId: randomUUID(),
                  outcome: { kind: "idle" },
                }}
                permalink={permalink}
                reconciliation={status(unpublishOperation)}
                formCopy={inventory.form}
                labels={{ confirmed: copy.unpublishConfirm, submit: copy.unpublish }}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {!live || newerVersion ? (
        <>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
            <section aria-labelledby="publish-preview" className="grid min-w-0 gap-4">
              <h2 id="publish-preview" className="text-section font-semibold">
                {copy.preview}
              </h2>
              {content.pendingDraft ? (
                <p className="text-dense text-text-muted">{copy.pendingDraft}</p>
              ) : null}
              <article className="grid gap-4 rounded-panel border border-divider bg-surface p-5">
                <h3 lang={sourceLocale} className="text-heading font-semibold">
                  {title || notKnown}
                </h3>
                <dl className="grid gap-3 sm:grid-cols-2">
                  {preview.map(([label, value]) => (
                    <div key={label} className="grid gap-1">
                      <dt className="text-dense text-text-muted">{label}</dt>
                      <dd className="font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="grid gap-2">
                  <h4 className="text-dense text-text-muted">{copy.photos}</h4>
                  {shownPhotos.length ? (
                    <>
                      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {shownPhotos.slice(0, 8).map(({ asset }) => (
                          <li key={asset.id}>
                            <PrivateMediaPreview
                              source={`/api/files/private/media/${asset.id}?preview=1`}
                              alt={asset.altText || content.title}
                              unavailable={copy.noPhotos}
                              className="aspect-4/3 object-cover"
                            />
                          </li>
                        ))}
                      </ul>
                      <p className="text-dense">
                        {fillCopy(copy.photoCount, { n: shownPhotos.length })}
                      </p>
                      {/* The tick covers every photo it will show: all of them are one click away. */}
                      {shownPhotos.length > 8 ? (
                        <details className="rounded-control border border-divider p-3">
                          <summary className="min-h-control cursor-pointer font-semibold">
                            {fillCopy(copy.photosAll, { n: shownPhotos.length })}
                          </summary>
                          <ul className="grid grid-cols-2 gap-2 pt-3 sm:grid-cols-4">
                            {shownPhotos.map(({ asset }) => (
                              <li key={asset.id}>
                                <PrivateMediaPreview
                                  source={`/api/files/private/media/${asset.id}?preview=1`}
                                  alt={asset.altText || content.title}
                                  unavailable={copy.noPhotos}
                                  className="aspect-4/3 object-cover"
                                />
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-dense">{copy.noPhotos}</p>
                  )}
                </div>
                <p lang={sourceLocale} className="whitespace-pre-wrap">
                  {content.description || notKnown}
                </p>
              </article>
            </section>

            <section
              aria-labelledby="publish-checks"
              className="grid gap-4 lg:sticky lg:top-6"
              data-publish-checks
            >
              <h2 id="publish-checks" className="text-section font-semibold">
                {copy.checks}
              </h2>
              {blockers.length === 0 && checks.warnings.length === 0 ? (
                <p className="text-dense text-text-muted">{copy.allClear}</p>
              ) : null}
              {blockers.length ? (
                <Notice tone="error" title={copy.mustFix}>
                  <ul className="list-disc ps-5">
                    {blockers.map((code) => (
                      <li key={code} data-blocker={code}>
                        {blockReason(locale, code)}
                      </li>
                    ))}
                  </ul>
                </Notice>
              ) : null}
              {checks.warnings.length ? (
                <Notice tone="warning" title={copy.worthALook}>
                  <ul className="list-disc ps-5">
                    {checks.warnings.map((code) => (
                      <li key={code} data-warning={code}>
                        {copy.warnings[code]}
                      </li>
                    ))}
                  </ul>
                </Notice>
              ) : null}

              {blockers.length ? (
                <div className="grid gap-3">
                  <p>{copy.fixFirst}</p>
                  {/* Blockers that are recorded in the detailed review are fixed there. */}
                  {fixedInReview ? (
                    <a href={`${path}?tab=review`} className={buttonClass("primary", "self-start")}>
                      {copy.detailedReview}
                    </a>
                  ) : (
                    <a href={path} className={buttonClass("primary", "self-start")}>
                      {copy.editListing}
                    </a>
                  )}
                </div>
              ) : !view.mayPublish ? (
                <p>{copy.cannotPublish}</p>
              ) : showForm ? (
                <>
                  {tickable.length ? (
                    <p className="text-dense text-text-muted">{copy.languages.withPublish}</p>
                  ) : null}
                  <PublishForm
                    action={publishListingAction.bind(null, locale, ref)}
                    initialState={{
                      values: {
                        attested: "",
                        note: "",
                        rentPeriod: content.rentAmount ? "month" : "",
                      },
                      operationId: publishOperation,
                      expectedRevision: view.listing.version,
                      responseId: randomUUID(),
                      outcome: { kind: "idle" },
                    }}
                    permalink={permalink}
                    reconciliation={status(publishOperation)}
                    formCopy={inventory.form}
                    formId="listing-publish-form"
                    labels={{ attested: copy.attestation, note: copy.note, submit: copy.publish }}
                    {...(content.cleanedTitle
                      ? {
                          cleanTitle: {
                            label: copy.cleanTitle,
                            hint: fillCopy(copy.cleanTitleHint, {
                              title: content.title.slice(content.cleanedTitle.length).trim(),
                            }),
                          },
                        }
                      : {})}
                    {...(content.rentAmount
                      ? {
                          rent: {
                            label: copy.rentPeriod,
                            month: copy.perMonth,
                            hint: copy.rentHint,
                          },
                        }
                      : {})}
                  />
                </>
              ) : null}
            </section>
          </div>
        </>
      ) : null}

      {languages.languages.length ? (
        <section
          id="languages"
          aria-labelledby="publish-languages"
          className="grid gap-4 border-t border-divider pt-6"
        >
          <h2 id="publish-languages" className="text-section font-semibold">
            {copy.languages.heading}
          </h2>
          <p className="max-w-reading">{copy.languages.lead}</p>
          <ul className="grid gap-6">
            {languages.languages.map((language) => {
              const name = languageName(locale, language.locale);
              const blocked = language.checks.blockers.length > 0;
              return (
                <li
                  key={language.locale}
                  className="grid gap-3 border-b border-divider pb-6"
                  data-language={language.locale}
                >
                  <h3 className="font-semibold">{name}</h3>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div lang={language.locale} className="grid content-start gap-2">
                      <p className="font-semibold">{language.title}</p>
                      <p className="whitespace-pre-wrap text-dense">{language.description}</p>
                    </div>
                    <div lang={sourceLocale} className="grid content-start gap-2 text-text-muted">
                      <p className="font-semibold">{languages.source?.title}</p>
                      <p className="whitespace-pre-wrap text-dense">
                        {languages.source?.description}
                      </p>
                    </div>
                  </div>
                  {blocked ? (
                    <Notice tone="error" title={copy.languages.fixFirst}>
                      <ul className="list-disc ps-5">
                        {language.checks.blockers.map((code) => (
                          <li key={code} data-language-blocker={code}>
                            {fillCopy(copy.languages.checks[code], {
                              code: language.checks.unexpectedNumbers.join(", "),
                            })}
                          </li>
                        ))}
                      </ul>
                    </Notice>
                  ) : null}
                  {language.checks.warnings.length ? (
                    <ul className="grid gap-1 text-dense text-warning">
                      {language.checks.warnings.map((code) => (
                        <li key={code}>{copy.languages.checks[code]}</li>
                      ))}
                    </ul>
                  ) : null}
                  {language.live ? (
                    <p className="font-semibold text-success">{copy.languages.live}</p>
                  ) : !language.mayApprove ? (
                    <p className="text-dense text-text-muted">{copy.languages.cannot}</p>
                  ) : languageForm && !blocked ? (
                    <label className="flex min-h-control items-start gap-3 py-2">
                      <input
                        type="checkbox"
                        name="language"
                        value={language.locale}
                        form={languageForm}
                        defaultChecked={language.legacyApproved}
                        className="mt-1 size-5 shrink-0 accent-action"
                        aria-describedby={
                          language.legacyApproved ? `legacy-${language.locale}` : undefined
                        }
                      />
                      <span className="grid gap-1">
                        {fillCopy(copy.languages.attest, { language: name })}
                        {language.legacyApproved ? (
                          <span
                            id={`legacy-${language.locale}`}
                            className="text-caption text-text-muted"
                          >
                            {copy.languages.legacy}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  ) : null}
                  <a
                    href={`${path}/translations/${language.locale}`}
                    className="justify-self-start text-dense text-action underline"
                  >
                    {copy.languages.detailed}
                  </a>
                </li>
              );
            })}
          </ul>
          {/* Mounted whenever the listing is live, even when nothing is left to tick, so the
              confirmation of a plain form post (no JavaScript) is still on the page. */}
          {live && !showForm && view.mayPublish ? (
            <LanguagesForm
              commandAvailable={tickable.length > 0}
              action={publishLanguagesAction.bind(null, locale, ref)}
              initialState={{
                values: { attested: "" },
                operationId: languagesOperation,
                expectedRevision: null,
                responseId: randomUUID(),
                outcome: { kind: "idle" },
              }}
              permalink={permalink}
              reconciliation={{ href: permalink, label: copy.languages.heading }}
              formCopy={inventory.form}
              formId="listing-languages-form"
              labels={{ attested: copy.languages.heading, submit: copy.languages.submit }}
            />
          ) : null}
        </section>
      ) : null}

      <p className="grid gap-1 border-t border-divider pt-4 text-dense">
        <a href={`${path}?tab=review`} className="font-semibold text-action underline">
          {copy.detailedReview}
        </a>
        <span className="text-text-muted">{copy.detailedReviewHint}</span>
      </p>
    </div>
  );
}

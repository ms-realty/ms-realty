// O16 one decision (ADR 0012): what the public will see, what the system checked, one
// attestation and Publish. After publishing: where it is live, and Unpublish. The detailed
// review stays one link away for anyone who wants each check and decision separately.
import { randomUUID } from "node:crypto";
import { sourceLocale } from "@/config/tenant";
import { getDb } from "@/db/client";
import { bedroomCount, inventoryCopy } from "@/features/inventory/copy";
import { publishListingAction, unpublishListingAction } from "@/features/inventory/publish-actions";
import { fillCopy, publishCopy } from "@/features/inventory/publish-copy";
import { PublishForm, UnpublishForm } from "@/features/inventory/publish-forms";
import { PrivateMediaPreview } from "@/features/inventory/thumbnail";
import { ListingIdentity, ListingNavigation } from "@/features/inventory/workspace";
import { privateRead } from "@/features/work/screens";
import { localeEndonyms } from "@/i18n/config";
import { requireStaffPage } from "@/server/auth/pages";
import { getEnv } from "@/server/config/env";
import { publishView } from "@/server/publication/attested";
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
  const showForm = view.mayPublish && checks.blockers.length === 0 && (!live || newerVersion);
  const notKnown = copy.notKnown;
  const shownPhotos = view.photos.filter(
    (photo) => photo.readiness === "shown" || photo.readiness === "clearable",
  );
  const preview: [string, string][] = [
    [
      copy.price,
      content.price.state === "withheld"
        ? copy.priceOnRequest
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

  return (
    <div className="flex flex-col gap-6 px-gutter py-5 sm:px-gutter-wide sm:py-6">
      <ListingIdentity locale={locale} reference={ref} title={content.title} heading />
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
                <h3 lang="bg" className="text-heading font-semibold">
                  {content.title || notKnown}
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
                      {shownPhotos.length > 8 ? (
                        <p className="text-dense">
                          {fillCopy(copy.photoCount, { n: shownPhotos.length })}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-dense">{copy.noPhotos}</p>
                  )}
                </div>
                <p lang="bg" className="whitespace-pre-wrap">
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
              {checks.blockers.length === 0 && checks.warnings.length === 0 ? (
                <p className="text-dense text-text-muted">{copy.allClear}</p>
              ) : null}
              {checks.blockers.length ? (
                <Notice tone="error" title={copy.mustFix}>
                  <ul className="list-disc ps-5">
                    {checks.blockers.map((code) => (
                      <li key={code} data-blocker={code}>
                        {copy.blockers[code]}
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

              {checks.blockers.length ? (
                <div className="grid gap-3">
                  <p>{copy.fixFirst}</p>
                  <a href={path} className={buttonClass("primary", "self-start")}>
                    {copy.editListing}
                  </a>
                </div>
              ) : !view.mayPublish ? (
                <p>{copy.cannotPublish}</p>
              ) : showForm ? (
                <PublishForm
                  action={publishListingAction.bind(null, locale, ref)}
                  initialState={{
                    values: { attested: "", note: "" },
                    operationId: publishOperation,
                    expectedRevision: view.listing.version,
                    responseId: randomUUID(),
                    outcome: { kind: "idle" },
                  }}
                  permalink={permalink}
                  reconciliation={status(publishOperation)}
                  formCopy={inventory.form}
                  labels={{ attested: copy.attestation, note: copy.note, submit: copy.publish }}
                />
              ) : null}
            </section>
          </div>
        </>
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

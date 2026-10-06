// O12 edit (Text/Facts tabs), O12SAVED receipt, and the review/publication decisions that
// O16 will redesign (?tab=review). Working draft, immutable candidate and publication decisions
// stay distinct.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDb } from "@/db/client";
import { operations } from "@/db/schema";
import { publicLocales } from "@/domain/ids";
import { bedroomCount, inventoryCopy, optionLabel } from "@/features/inventory/copy";
import {
  type InventoryDecisionContext,
  type InventoryDecisionIntent,
  inventorySections,
} from "@/features/inventory/decision-contract";
import { inventoryDecisionCopy } from "@/features/inventory/decision-copy";
import { InventoryDecisionForm } from "@/features/inventory/decision-form";
import { InventoryEditor, type InventoryValues } from "@/features/inventory/editor";
import { evidenceCopy } from "@/features/inventory/evidence-copy";
import { FocusedState } from "@/features/inventory/focused-state";
import { FrozenPreview } from "@/features/inventory/frozen-preview";
import { requireStaffPage } from "@/server/auth/pages";
import { can } from "@/server/authz";
import { isAppError } from "@/server/errors";
import { inventoryDetail } from "@/server/inventory/commands";
import { draftSchema, emptyDraft } from "@/server/inventory/contracts";
import { publicationReadiness } from "@/server/publication/commands";
import { buttonClass } from "@/ui/button-class";
import { cx } from "@/ui/cx";
import { AssistIcon, CheckIcon, DocumentIcon, ExternalIcon } from "@/ui/icons";
import { saveInventory, submitInventoryDecision } from "../actions";

/** Copy with the listing reference isolated for bidirectional text. */
function withReference(template: string, ref: ReactNode) {
  return template
    .split("{reference}")
    .flatMap((part, index) => (index === 0 ? [part] : [ref, part]));
}

/** UI18 source reference. */
function SourceReference({
  title,
  detail,
  href,
}: {
  title: ReactNode;
  detail: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex items-start gap-3 rounded-control bg-subtle p-3 text-dense text-text no-underline hover:bg-selected"
    >
      <DocumentIcon className="size-5" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-semibold">{title}</span>
        <span className="font-medium text-text-muted">{detail}</span>
      </span>
      <ExternalIcon className="size-4" />
    </a>
  );
}

/** O12SAVED: only this staff member's own confirmed draft save for this listing. */
async function savedDraft(actorId: string, reference: string, id: string | undefined) {
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const [operation] = await getDb()
    .select({ outcome: operations.outcome })
    .from(operations)
    .where(
      and(
        eq(operations.idempotencyKey, id),
        eq(operations.actorKind, "staff"),
        eq(operations.actorId, actorId),
        eq(operations.operationType, "inventory.draft.save"),
        eq(operations.status, "succeeded"),
      ),
    )
    .limit(1);
  const outcome = operation?.outcome as { reference?: string; version?: number } | undefined;
  return outcome?.reference === reference && typeof outcome.version === "number"
    ? { version: outcome.version }
    : null;
}

function known(state: string, value: string) {
  return state === "known" && value.trim() !== "" && Number.isFinite(Number(value));
}

export default async function InventoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; reference: string }>;
  searchParams: Promise<{ error?: string; tab?: string; saved?: string }>;
}) {
  const { locale, reference } = await params;
  const query = await searchParams;
  const session = await requireStaffPage(locale);
  const db = getDb();
  const data = await inventoryDetail(db, session.actor, reference).catch((error) => {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  });
  const { listing, property } = data;
  const copy = inventoryCopy(locale);
  const o12 = copy.o12;
  const path = `/${locale}/inventory/${reference}`;
  const ref = <bdi>{listing.reference}</bdi>;
  const parsed = draftSchema.safeParse(listing.draft);
  const values: InventoryValues = {
    ...(parsed.success ? parsed.data : emptyDraft),
    propertyType: property.propertyType,
    purpose: listing.purpose,
    country: property.country,
    region: property.region,
    settlement: property.settlement,
    exactAddress: property.exactAddress ?? "",
  };
  const tab = query.tab === "facts" || query.tab === "review" ? query.tab : "text";

  // O12SAVED: the focused receipt for a draft save this staff member made on this listing.
  const saved = await savedDraft(session.actor.id, listing.reference, query.saved);
  if (saved) {
    const back = tab === "facts" ? `${path}?tab=facts` : path;
    return (
      <FocusedState closeHref={back} closeLabel={o12.close}>
        <h1 className="pe-12 text-title font-semibold">{o12.saved}</h1>
        <CheckIcon className="size-8 text-success" />
        <p role="status">{withReference(o12.savedDetail, ref)}</p>
        {listing.version === saved.version ? (
          <>
            <p>{o12.savedDescription}</p>
            <p className="whitespace-pre-wrap" lang="bg">
              {values.description}
            </p>
          </>
        ) : (
          <p>{o12.savedLater}</p>
        )}
        <a href={back} className={buttonClass("primary")}>
          {o12.toTask}
        </a>
      </FocusedState>
    );
  }

  const evidence = evidenceCopy(locale);
  const readiness = await publicationReadiness(db, session.actor, reference);
  const resource = { type: "listing", id: listing.id, propertyId: property.id };
  const mayEdit = await can(db, session.actor, "listing.edit", resource);
  const mayReview = await can(db, session.actor, "listing.review_facts", resource);
  const mayPublish = await can(db, session.actor, "publication.release", resource);
  const published = data.publications.length > 0;
  const editorState = () => ({
    values,
    operationId: randomUUID(),
    expectedRevision: listing.version,
    responseId: randomUUID(),
    outcome: { kind: "idle" as const },
  });
  const error = query.error ? (
    <p role="alert" className="rounded-panel border border-error bg-surface p-4 text-error">
      {copy.blocked}
    </p>
  ) : null;

  if (tab === "review")
    return (
      <ReviewView
        locale={locale}
        reference={reference}
        data={data}
        readiness={readiness}
        mayEdit={mayEdit}
        mayReview={mayReview}
        mayPublish={mayPublish}
        error={error}
      />
    );

  const summary = [
    property.settlement,
    known(values.priceState, values.price)
      ? new Intl.NumberFormat(locale, {
          style: "currency",
          currency: "EUR",
          maximumFractionDigits: 2,
          minimumFractionDigits: 0,
        }).format(Number(values.price))
      : null,
    known(values.areaState, values.area)
      ? `${new Intl.NumberFormat(locale).format(Number(values.area))} m²`
      : null,
    known(values.bedroomsState, values.bedrooms)
      ? bedroomCount(locale, Number(values.bedrooms))
      : null,
  ].filter(Boolean);
  const review = (
    <a href={`${path}?tab=review`} className={buttonClass("secondary")}>
      {o12.reviewForPublication}
    </a>
  );
  const number = (state: string, value: string) =>
    known(state, value)
      ? new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(value))
      : optionLabel(state, locale);
  const terms: [string, string][] = [
    [o12.priceLabel, number(values.priceState, values.price)],
    [
      o12.areaLabel.replace("{basis}", optionLabel(values.areaBasis, locale)),
      number(values.areaState, values.area),
    ],
    [o12.bedroomsLabel, number(values.bedroomsState, values.bedrooms)],
    [o12.settlementLabel, property.settlement],
  ];

  return (
    <div className="flex flex-col gap-6 px-gutter py-6 sm:gap-8 sm:px-gutter-wide sm:py-8">
      <header className="flex flex-col gap-6 sm:gap-8">
        <h1 className="text-heading font-semibold sm:text-title">{o12.title}</h1>
        <p className="text-text-muted">
          {ref}
          {summary.map((part) => ` · ${part}`)}
          <br />
          {o12.sourceLine}
        </p>
        <p className="text-text-muted">{o12.instruction}</p>
      </header>
      <nav aria-label={o12.tabs}>
        <ul className="grid grid-cols-3 gap-1 rounded-control bg-subtle p-1">
          {(
            [
              ["facts", `${path}?tab=facts`, o12.facts],
              ["text", path, o12.text],
              ["photos", `${path}/media`, o12.photos],
            ] as const
          ).map(([id, href, label]) => (
            <li key={id} className="flex">
              <a
                href={href}
                aria-current={id === tab ? "page" : undefined}
                className={cx(
                  "flex min-h-[2.875rem] w-full items-center justify-center rounded-control p-3 text-center text-dense font-semibold no-underline",
                  id === tab
                    ? "bg-canvas text-text"
                    : "text-text-muted hover:bg-canvas/60 hover:text-text",
                )}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {error}
      {!parsed.success && mayEdit ? (
        <p className="rounded-control bg-warning-soft p-3 text-dense text-text">{o12.noDraft}</p>
      ) : null}
      {tab === "facts" ? (
        <section aria-label={o12.facts} className="flex max-w-[46.8rem] flex-col gap-6">
          <p className="text-compact text-text-muted">{copy.factsHint}</p>
          {mayEdit ? (
            <InventoryEditor
              locale={locale}
              reference={reference}
              view="facts"
              action={saveInventory.bind(null, locale, reference)}
              initialState={editorState()}
              secondaryActions={review}
              footer={<input type="hidden" name="_tab" value="facts" />}
            />
          ) : (
            <p>{copy.permissions}</p>
          )}
          <div className="flex flex-wrap gap-4">
            <a className="text-action underline" href={`${path}/evidence`}>
              {evidence.title}
            </a>
            <a className="text-action underline" href={`${path}/documents`}>
              {locale === "bg" ? "Документи" : locale === "ru" ? "Документы" : "Documents"}
            </a>
          </div>
        </section>
      ) : (
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          <section
            id="listing-text"
            aria-label={o12.text}
            className="flex min-w-0 flex-1 flex-col gap-6 lg:max-w-[46.8rem]"
          >
            {mayEdit ? (
              <InventoryEditor
                locale={locale}
                reference={reference}
                view="text"
                action={saveInventory.bind(null, locale, reference)}
                initialState={editorState()}
                footer={<p>{o12.workingDraft}</p>}
                secondaryActions={
                  <>
                    {review}
                    {published ? (
                      <a
                        href={`${path}?tab=review#${inventorySections.review}`}
                        className={buttonClass("tertiary", "text-text")}
                      >
                        {o12.correctPublished}
                      </a>
                    ) : null}
                  </>
                }
              />
            ) : (
              <p>{copy.permissions}</p>
            )}
            <SourceReference
              href={`${path}/evidence`}
              title={withReference(o12.sourceTitle, ref)}
              detail={readiness.input.factReviewValid ? o12.sourceReviewed : o12.sourceUnreviewed}
            />
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-dense font-semibold">{o12.terms}</h2>
                {mayEdit ? (
                  <a href={`${path}?tab=facts`} className="text-dense text-action underline">
                    {o12.changeInFacts}
                  </a>
                ) : null}
              </div>
              <dl className="grid gap-6 sm:grid-cols-2">
                {terms.map(([label, value]) => (
                  <div key={label} className="flex flex-col gap-2">
                    <dt className="text-dense font-semibold">{label}</dt>
                    <dd className="min-h-12 rounded-control border border-divider bg-subtle p-3 leading-[1.625rem]">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
          <aside
            aria-labelledby="butler-heading"
            className="flex flex-col gap-5 rounded-card bg-subtle p-5 lg:w-[23.2rem] lg:shrink-0"
          >
            <h2
              id="butler-heading"
              className="flex items-center gap-3 text-subheading font-semibold"
            >
              <AssistIcon className="size-5 text-assist" />
              {o12.butler}
            </h2>
            <p className="rounded-control bg-assist-soft p-2 text-caption font-medium text-assist">
              {o12.butlerStatus}
            </p>
            <p>{o12.butlerOffer}</p>
            <SourceReference
              href={`${path}/evidence`}
              title={o12.butlerRecord}
              detail={o12.butlerScope}
            />
            <p className="text-caption text-text-muted">{o12.butlerNote}</p>
            <button
              type="button"
              disabled
              aria-describedby="butler-unavailable"
              className={buttonClass("tertiary", "self-start bg-assist-soft text-assist")}
            >
              <AssistIcon className="size-[1.125rem]" />
              {o12.butlerPrepare}
            </button>
            <p id="butler-unavailable" className="text-caption text-text-muted">
              {o12.butlerUnavailable}
            </p>
            <hr className="border-divider" />
            <p className="text-dense font-semibold">{o12.manualHeading}</p>
            <a href="#listing-text" className={buttonClass("secondary", "self-start")}>
              {o12.manual}
            </a>
          </aside>
        </div>
      )}
    </div>
  );
}

/** Review and publication decisions; O16 replaces this presentation. */
async function ReviewView({
  locale,
  reference,
  data,
  readiness,
  mayEdit,
  mayReview,
  mayPublish,
  error,
}: {
  locale: string;
  reference: string;
  data: Awaited<ReturnType<typeof inventoryDetail>>;
  readiness: Awaited<ReturnType<typeof publicationReadiness>>;
  mayEdit: boolean;
  mayReview: boolean;
  mayPublish: boolean;
  error: ReactNode;
}) {
  const { listing, property, revision } = data;
  const copy = inventoryCopy(locale);
  const decisionCopy = inventoryDecisionCopy(locale);
  const evidence = evidenceCopy(locale);
  const path = `/${locale}/inventory/${reference}`;
  function decision(
    intent: InventoryDecisionIntent,
    label: string,
    expectedRevision: number,
    manifestId?: string,
  ) {
    const context: InventoryDecisionContext = {
      locale,
      reference,
      intent,
      revisionId: revision?.id ?? "",
      ...(manifestId ? { manifestId } : {}),
    };
    return (
      <InventoryDecisionForm
        key={`${intent}-${manifestId ?? "current"}`}
        context={context}
        title={label}
        action={submitInventoryDecision.bind(null, context)}
        initialState={{
          values: { scope: "", confirmed: "", publicationLocale: "bg" },
          operationId: randomUUID(),
          expectedRevision,
          responseId: randomUUID(),
          outcome: { kind: "idle" },
        }}
      />
    );
  }
  const manifests = publicLocales.flatMap((language) => {
    const manifest = data.manifests.find(
      (item) => item.generation === listing.publicationGeneration && item.locale === language,
    );
    return manifest ? [manifest] : [];
  });
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-8">
      <a href={path} className="text-action underline">
        {copy.o12.backToEdit}
      </a>
      <header>
        <h1 className="text-title font-semibold">{copy.o12.reviewTitle}</h1>
        <p>
          <bdi>{listing.reference}</bdi> · {property.settlement} ·{" "}
          {optionLabel(property.propertyType, locale)} · {optionLabel(listing.purpose, locale)} ·{" "}
          {copy.revision} {listing.version}
        </p>
      </header>
      <nav
        id={inventorySections.navigation}
        aria-label={decisionCopy.navigation}
        className="scroll-mt-6 rounded-panel border border-divider bg-surface p-4"
      >
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {[
            [inventorySections.readiness, evidence.readiness],
            [inventorySections.draft, copy.edit],
            ...(listing.approvedRevisionId
              ? [[inventorySections.locales, decisionCopy.locales]]
              : []),
            [inventorySections.review, copy.review],
          ].map(([id, label]) => (
            <li key={id}>
              <a
                className="inline-flex min-h-control items-center text-action underline"
                href={`#${id}`}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <section
        id={inventorySections.readiness}
        className="scroll-mt-6 space-y-4 rounded-panel border border-divider bg-surface p-5"
        aria-labelledby="readiness-heading"
        tabIndex={-1}
      >
        <h2 id="readiness-heading" className="text-section font-semibold">
          {evidence.readiness}
        </h2>
        <dl className="grid gap-2 sm:grid-cols-2">
          {[
            [evidence.factual, readiness.input.factReviewValid],
            [evidence.editorial, readiness.input.revisionApprovalValid],
            [evidence.agreement, readiness.input.sellerInstructionValid],
            [evidence.photos, readiness.input.mediaEligible],
            [evidence.language, readiness.input.localeApprovedForSource],
            [evidence.claims, readiness.input.regulatedClaimsReviewed !== false],
          ].map(([label, okay]) => (
            <div key={String(label)} className="flex justify-between gap-3">
              <dt>{label}</dt>
              <dd className={okay ? "text-success" : "text-text-muted"}>
                {okay ? evidence.yes : evidence.no}
              </dd>
            </div>
          ))}
        </dl>
        <a className="text-action underline" href={`${path}/evidence`}>
          {evidence.title}
        </a>
        <div className="flex flex-wrap gap-4">
          <a className="text-action underline" href={`${path}/media`}>
            {locale === "bg"
              ? "Снимки и права"
              : locale === "ru"
                ? "Фотографии и права"
                : "Photos and rights"}
          </a>
          <a className="text-action underline" href={`${path}/documents`}>
            {locale === "bg" ? "Документи" : locale === "ru" ? "Документы" : "Documents"}
          </a>
        </div>
        <p>
          {optionLabel(listing.commercialState, locale)} ·{" "}
          {listing.availabilityBasis ?? evidence.no}
        </p>
        {mayEdit ? decision("availability", evidence.availability, listing.version) : null}
      </section>
      {listing.approvedRevisionId ? (
        <nav
          id={inventorySections.locales}
          tabIndex={-1}
          aria-label={locale === "bg" ? "Преводи" : locale === "ru" ? "Переводы" : "Translations"}
          className="flex scroll-mt-6 flex-wrap gap-4"
        >
          {publicLocales
            .filter((language) => language !== "bg")
            .map((language) => (
              <a
                key={language}
                className="text-action underline"
                href={`${path}/translations/${language}`}
              >
                {language.toUpperCase()}
              </a>
            ))}
        </nav>
      ) : null}
      {error}
      <section
        id={inventorySections.draft}
        className="scroll-mt-6 space-y-4"
        aria-labelledby="draft-heading"
        tabIndex={-1}
      >
        <h2 id="draft-heading" className="text-section font-semibold">
          {copy.edit}
        </h2>
        <p>{copy.draftNotice}</p>
        {mayEdit ? decision("freeze", copy.prepare, listing.version) : null}
        <a
          href={`#${inventorySections.navigation}`}
          className="inline-flex min-h-control items-center text-action underline"
        >
          {decisionCopy.backToSections}
        </a>
      </section>
      <section
        id={inventorySections.review}
        className="scroll-mt-6 space-y-4 border-t border-divider pt-6"
        aria-labelledby="review-heading"
        tabIndex={-1}
      >
        <h2 id="review-heading" className="text-section font-semibold">
          {copy.review}
        </h2>
        {revision ? (
          <>
            <p>
              {copy.revision} {revision.revisionNumber} ·{" "}
              {optionLabel(listing.editorialState, locale)}
            </p>
            <FrozenPreview
              locale={locale}
              reference={reference}
              revision={revision}
              facts={data.facts}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              {mayReview ? decision("facts", copy.reviewFacts, property.version) : null}
              {mayEdit ? decision("submit", copy.submit, listing.version) : null}
              {mayReview ? decision("approve", copy.approve, listing.version) : null}
              {mayPublish
                ? decision("prepare", copy.prepareManifest, listing.publicationGeneration)
                : null}
              {mayPublish
                ? manifests.map((manifest) => (
                    <div key={manifest.id}>
                      <p>
                        {manifest.locale.toUpperCase()} · {manifest.contentDigest.slice(0, 12)}
                      </p>
                      {decision(
                        "activate",
                        `${copy.activate} (${manifest.locale.toUpperCase()})`,
                        listing.publicationGeneration,
                        manifest.id,
                      )}
                    </div>
                  ))
                : null}
            </div>
          </>
        ) : (
          <p>{copy.noRevision}</p>
        )}
        {data.publications.length ? (
          <ul>
            {data.publications.map((p) => (
              <li key={p.id}>
                <bdi>{p.locale}</bdi> · {optionLabel(p.state, locale)}
              </li>
            ))}
          </ul>
        ) : (
          <p>{copy.noPublication}</p>
        )}
        {mayPublish && data.publications.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {decision("restrict", copy.restrict, listing.publicationGeneration)}
            {decision("withdraw", copy.withdraw, listing.publicationGeneration)}
          </div>
        ) : null}
        <a
          href={`#${inventorySections.navigation}`}
          className="inline-flex min-h-control items-center text-action underline"
        >
          {decisionCopy.backToSections}
        </a>
      </section>
    </div>
  );
}

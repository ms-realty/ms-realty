// O12 edit (Text/Facts tabs), O12SAVED receipt, and the review/publication decisions that
// O16 will redesign (?tab=review). Working draft, immutable candidate and publication decisions
// stay distinct.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDb } from "@/db/client";
import { operations } from "@/db/schema";
import { bedroomCount, inventoryCopy, optionLabel } from "@/features/inventory/copy";
import { inventorySections } from "@/features/inventory/decision-contract";
import { EditTabs } from "@/features/inventory/edit-tabs";
import { InventoryEditor, type InventoryValues } from "@/features/inventory/editor";
import { evidenceCopy } from "@/features/inventory/evidence-copy";
import { type InventoryField, missingInput } from "@/features/inventory/fields";
import { FocusedState } from "@/features/inventory/focused-state";
import { LeaveControl } from "@/features/inventory/leave-control";
import { safeNext } from "@/features/inventory/next";
import { describePriceEvidence } from "@/features/inventory/recorded-price";
import { UnsavedGuard } from "@/features/inventory/unsaved-guard";
import { requireStaffPage } from "@/server/auth/pages";
import { can } from "@/server/authz";
import { isAppError } from "@/server/errors";
import { inventoryDetail } from "@/server/inventory/commands";
import { draftSchema } from "@/server/inventory/contracts";
import { uneditablePriceEvidence, workingDraftFrom } from "@/server/inventory/working-draft";
import { publicationReadiness } from "@/server/publication/commands";
import { buttonClass } from "@/ui/button-class";
import { AssistIcon, CheckIcon, DocumentIcon, ExternalIcon } from "@/ui/icons";
import { saveInventory } from "../actions";
import { ReviewView } from "./review-view";

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
  searchParams: Promise<{ error?: string; tab?: string; saved?: string; next?: string }>;
}) {
  const { locale, reference } = await params;
  const query = await searchParams;
  const session = await requireStaffPage(locale);
  const db = getDb();
  const data = await inventoryDetail(db, session.actor, reference).catch((error) => {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  });
  const { listing, property, revision } = data;
  const copy = inventoryCopy(locale);
  const o12 = copy.o12;
  const path = `/${locale}/inventory/${reference}`;
  const ref = <bdi>{listing.reference}</bdi>;
  const parsed = draftSchema.safeParse(listing.draft);
  const values: InventoryValues = {
    // No saved draft yet: start from the latest immutable revision (Codex 8021808b); nothing
    // is written until the broker saves through the version-checked command.
    ...(parsed.success ? parsed.data : workingDraftFrom(revision, data.facts)),
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
    // Saved from the leave dialog: continue where the person was going; the receipt stays.
    const next = safeNext(locale, query.next);
    return (
      <FocusedState closeHref={back} closeLabel={o12.close}>
        <h1 className="pe-12 text-heading font-semibold sm:text-title">{o12.saved}</h1>
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
        <div className="flex flex-wrap gap-3">
          {next ? (
            <a href={next} className={buttonClass("primary")}>
              {o12.continue}
            </a>
          ) : null}
          <a href={back} className={buttonClass(next ? "secondary" : "primary")}>
            {o12.toTask}
          </a>
        </div>
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
        values={values}
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
  const formId = mayEdit ? "o12-form" : undefined;
  // A source price the draft cannot carry stays visible; keeping it unknown is the broker's
  // explicit priceDecision, which saveListingDraft binds to this exact source revision.
  const recorded = parsed.success
    ? null
    : describePriceEvidence(uneditablePriceEvidence(revision), locale, {
        total: o12.periodTotal,
        month: o12.periodMonth,
        none: o12.periodNone,
        unreadable: o12.priceUnreadable,
      });
  const missing: InventoryField[] = [
    ...missingInput(values),
    ...(recorded ? (["priceState", "price"] as const) : []),
  ];
  const draftKey = `o12:${listing.reference}:${listing.version}`;
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
      {error}
      {!parsed.success && mayEdit ? (
        <p className="rounded-control bg-warning-soft p-3 text-dense text-text">{o12.noDraft}</p>
      ) : null}
      {/* Text and Facts are one form; the tabs switch panels in place (group/o12). */}
      <div data-o12 className="group/o12 flex flex-col gap-6 sm:gap-8">
        <EditTabs
          tab={tab === "facts" ? "facts" : "text"}
          formId={formId}
          photosHref={`${path}/media`}
          labels={{
            tabs: o12.tabs,
            facts: o12.facts,
            text: o12.text,
            photos: o12.photos,
            noscript: o12.noscriptLeave,
          }}
        />
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          <section
            id="listing-text"
            aria-label={o12.text}
            className="flex min-w-0 flex-1 flex-col gap-6 lg:max-w-[46.8rem]"
          >
            <p className="hidden text-compact text-text-muted group-has-[#o12-facts:checked]/o12:block">
              {copy.factsHint}
            </p>
            {mayEdit ? (
              <div data-o12-editor>
                <InventoryEditor
                  locale={locale}
                  reference={reference}
                  view="edit"
                  formId={formId}
                  draftKey={draftKey}
                  missing={missing}
                  missingNote={
                    recorded ? (
                      <div className="flex flex-col gap-3 sm:col-span-2">
                        <p className="text-dense">
                          {o12.priceRecorded.replace("{value}", recorded)}
                        </p>
                        <label className="flex items-start gap-3 text-dense">
                          <input
                            type="checkbox"
                            name="_priceDecision"
                            value={revision?.id ?? ""}
                            className="mt-0.5 size-5 accent-action"
                          />
                          {o12.priceKeepUnknown}
                        </label>
                      </div>
                    ) : null
                  }
                  action={saveInventory.bind(null, locale, reference)}
                  initialState={editorState()}
                  footer={
                    <>
                      <p className="group-has-[#o12-facts:checked]/o12:hidden">
                        {o12.workingDraft}
                      </p>
                      <input type="hidden" name="_next" defaultValue="" />
                    </>
                  }
                  secondaryActions={
                    <>
                      <LeaveControl
                        href={`${path}?tab=review`}
                        formId={formId}
                        className={buttonClass("secondary")}
                      >
                        {o12.reviewForPublication}
                      </LeaveControl>
                      {published ? (
                        <LeaveControl
                          href={`${path}?tab=review#${inventorySections.review}`}
                          formId={formId}
                          className={buttonClass("tertiary", "text-text")}
                        >
                          {o12.correctPublished}
                        </LeaveControl>
                      ) : null}
                    </>
                  }
                />
                <UnsavedGuard
                  root="[data-o12-editor]"
                  storageKey={draftKey}
                  copy={{
                    title: o12.unsavedTitle,
                    body: o12.unsavedBody,
                    save: o12.saveDraft,
                    discard: o12.discard,
                    stay: o12.stay,
                  }}
                />
              </div>
            ) : (
              <p>{copy.permissions}</p>
            )}
            <div className="hidden flex-wrap gap-4 group-has-[#o12-facts:checked]/o12:flex">
              <a className="text-action underline" href={`${path}/evidence`}>
                {evidence.title}
              </a>
              <a className="text-action underline" href={`${path}/documents`}>
                {locale === "bg" ? "Документи" : locale === "ru" ? "Документы" : "Documents"}
              </a>
            </div>
            <div className="flex flex-col gap-6 group-has-[#o12-facts:checked]/o12:hidden">
              <SourceReference
                href={`${path}/evidence`}
                title={withReference(o12.sourceTitle, ref)}
                detail={readiness.input.factReviewValid ? o12.sourceReviewed : o12.sourceUnreviewed}
              />
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-dense font-semibold">{o12.terms}</h2>
                {mayEdit ? (
                  <label
                    htmlFor="o12-facts"
                    className="cursor-pointer text-dense text-action underline"
                  >
                    {o12.changeInFacts}
                  </label>
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
            className="flex flex-col gap-5 rounded-card bg-subtle p-5 group-has-[#o12-facts:checked]/o12:hidden lg:w-[23.2rem] lg:shrink-0"
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
      </div>
    </div>
  );
}

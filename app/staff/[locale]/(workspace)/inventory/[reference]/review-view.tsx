// O16 (Figma 18:1471 / 18:3002): review for publication. The candidate, the BG working preview
// and the six required human approvals are read from recorded state; the approvals are status,
// never boxes to tick (O16EL: separate decisions, no shared "verified" mark). Every decision
// below keeps its own form, actor, permission and revision check.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { ReactNode } from "react";
import { getDb } from "@/db/client";
import { listingRevisions, operations, propertyFacts } from "@/db/schema";
import type { Actor } from "@/domain/capabilities";
import { pricePeriodByPurpose } from "@/domain/facts";
import { type PublicLocale, publicLocales } from "@/domain/ids";
import { bedroomCount, inventoryCopy, optionLabel } from "@/features/inventory/copy";
import {
  type InventoryDecisionContext,
  type InventoryDecisionIntent,
  inventorySections,
} from "@/features/inventory/decision-contract";
import { inventoryDecisionCopy } from "@/features/inventory/decision-copy";
import { InventoryDecisionForm } from "@/features/inventory/decision-form";
import type { InventoryValues } from "@/features/inventory/editor";
import { evidenceCopy } from "@/features/inventory/evidence-copy";
import { FocusedRows, FocusedState } from "@/features/inventory/focused-state";
import { FrozenPreview } from "@/features/inventory/frozen-preview";
import { getEnv } from "@/server/config/env";
import type { inventoryDetail } from "@/server/inventory/commands";
import { publicationReadiness } from "@/server/publication/commands";
import { eligiblePublications, listingSlug, termsFacts } from "@/server/publication/presentation";
import { buttonClass } from "@/ui/button-class";
import { CheckIcon, DocumentIcon, ExternalIcon, NoPhotoIcon, WarningIcon } from "@/ui/icons";
import { submitInventoryDecision } from "../actions";

type Detail = Awaited<ReturnType<typeof inventoryDetail>>;

function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}
/** The manifest the public website shows for this listing in `locale` right now, if any. */
async function publicManifest(listingId: string, locale: PublicLocale) {
  const db = getDb();
  const eligible = eligiblePublications(db, locale);
  const [row] = await db
    .select({ manifestId: eligible.manifestId })
    .from(eligible)
    .where(eq(eligible.listingId, listingId))
    .limit(1);
  return row?.manifestId ?? null;
}

/** O16DONE: only this staff member's own confirmed activation of this listing. */
async function publishedReceipt(actorId: string, reference: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [operation] = await getDb()
    .select({ outcome: operations.outcome })
    .from(operations)
    .where(
      and(
        eq(operations.idempotencyKey, id),
        eq(operations.actorKind, "staff"),
        eq(operations.actorId, actorId),
        eq(operations.operationType, "publication.activate"),
        eq(operations.status, "succeeded"),
      ),
    )
    .limit(1);
  const outcome = operation?.outcome as
    | { reference?: string; locale?: string; manifestId?: string }
    | undefined;
  const locale = publicLocales.find((value) => value === outcome?.locale);
  return outcome?.reference === reference && locale && outcome.manifestId
    ? { locale, manifestId: outcome.manifestId }
    : null;
}

export async function ReviewView({
  locale,
  reference,
  data,
  values,
  readiness,
  mayEdit,
  mayReview,
  mayPublish,
  error,
  actor,
  actorName,
  query,
}: {
  actor: Actor;
  actorName: string;
  query: { step?: string; manifest?: string; published?: string };
  locale: string;
  reference: string;
  data: Detail;
  values: InventoryValues;
  readiness: Awaited<ReturnType<typeof publicationReadiness>>;
  mayEdit: boolean;
  mayReview: boolean;
  mayPublish: boolean;
  error: ReactNode;
}) {
  const { listing, property, revision } = data;
  const copy = inventoryCopy(locale);
  const o16 = copy.o16;
  const decisionCopy = inventoryDecisionCopy(locale);
  const evidence = evidenceCopy(locale);
  const path = `/${locale}/inventory/${reference}`;
  const ref = listing.reference;
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

  // One explicit subject: the approved revision, which readiness, prepare and activate use. A
  // newer frozen revision is named separately and never inherits the approved one's checks.
  const input = readiness.input;
  const eligible = readiness.decision.outcome === "allowed";
  const [approved] = listing.approvedRevisionId
    ? await getDb()
        .select()
        .from(listingRevisions)
        .where(eq(listingRevisions.id, listing.approvedRevisionId))
    : [];
  const subject = approved ?? revision;
  const subjectFacts = !subject
    ? []
    : subject.id === revision?.id
      ? data.facts
      : await getDb()
          .select()
          .from(propertyFacts)
          .where(eq(propertyFacts.factRevisionId, subject.factRevisionId));
  const photos = [...data.media]
    .filter(({ relation }) => !relation.removedAt && !relation.hidden)
    .sort((a, b) => a.relation.position - b.relation.position);
  const cover = photos.find(({ asset }) => asset.scan === "clean" && asset.processing === "ready");
  const known = (state: string, value: string) =>
    state === "known" && value !== "" && Number.isFinite(Number(value));
  // Recorded money keeps its own currency and period; nothing is converted.
  const money = (value: unknown): string | null => {
    const amount = value as { amountMinor?: unknown; currency?: unknown; period?: unknown } | null;
    if (typeof amount?.amountMinor !== "number") return null;
    const currency =
      typeof amount.currency === "string" && /^[A-Z]{3}$/.test(amount.currency)
        ? amount.currency
        : null;
    const text = currency
      ? new Intl.NumberFormat(locale, {
          style: "currency",
          currency,
          maximumFractionDigits: 2,
          minimumFractionDigits: 0,
        }).format(amount.amountMinor / 100)
      : new Intl.NumberFormat(locale).format(amount.amountMinor / 100);
    return amount.period === "month" ? `${text} ${o16.perMonth}` : text;
  };
  const recorded = (
    fact: { state: string; value: unknown } | undefined,
    format: (v: unknown) => string | null,
  ) =>
    fact && (fact.state === "known" || fact.state === "conflicting")
      ? (Array.isArray(fact.value) ? fact.value : [fact.value])
          .map(format)
          .filter(Boolean)
          .join(" | ") || null
      : null;
  const priceLine = subject
    ? recorded(termsFacts(subject.terms).price, money)
    : known(values.priceState, values.price)
      ? money({
          amountMinor: Number(values.price) * 100,
          currency: "EUR",
          // A draft price is total for a sale and monthly for a rent, never assumed.
          period: pricePeriodByPurpose[listing.purpose],
        })
      : null;
  // Every recorded area basis with its own unit; several bases are shown, never one picked.
  const areaLines = subject
    ? subjectFacts
        .filter((fact) => fact.fieldKey.startsWith("area."))
        .map((fact) => {
          const text = recorded(fact, (value) => {
            const area = value as { value?: unknown; unit?: unknown } | null;
            if (typeof area?.value !== "number") return null;
            const unit = area.unit === "m2" ? "m²" : typeof area.unit === "string" ? area.unit : "";
            return `${new Intl.NumberFormat(locale).format(area.value)} ${unit}`.trim();
          });
          return text ? `${optionLabel(fact.fieldKey.slice(5), locale)} ${text}` : null;
        })
        .filter((line): line is string => Boolean(line))
    : known(values.areaState, values.area)
      ? [
          `${optionLabel(values.areaBasis, locale)} ${new Intl.NumberFormat(locale).format(Number(values.area))} m²`,
        ]
      : [];
  const bedroomFact = subjectFacts.find((fact) => fact.fieldKey === "bedrooms");
  const bedroomsValue = subject
    ? bedroomFact?.state === "known" && typeof bedroomFact.value === "number"
      ? bedroomFact.value
      : null
    : known(values.bedroomsState, values.bedrooms)
      ? Number(values.bedrooms)
      : null;
  const unknown = [
    priceLine === null ? o16.price : null,
    areaLines.length === 0 ? o16.area : null,
    bedroomsValue === null ? copy.o12.bedroomsLabel : null,
  ].filter(Boolean);
  const checks: [string, boolean][] = [
    [o16.checks.facts, input.factReviewValid],
    [o16.checks.photos, input.mediaEligible],
    [o16.checks.language, input.localeApprovedForSource],
    [o16.checks.version, input.revisionApprovalValid],
    [o16.checks.seller, input.sellerInstructionValid],
    ...(input.regulatedClaimsReviewed === false
      ? ([[o16.checks.claims, false]] as [string, boolean][])
      : []),
  ];

  const host = getEnv().hosts.public;
  const review = `${path}?tab=review`;

  // O16DONE (Figma 642:12842 / 642:12860): a confirmed activation by this staff member.
  const done = query.published ? await publishedReceipt(actor.id, ref, query.published) : null;
  // "Published" only while the public read itself (pointer, generation, seller evidence, approved
  // translation) still shows that exact package; anything else turns the receipt into a record of
  // what happened.
  const pointer = done ? data.publications.find((p) => p.locale === done.locale) : undefined;
  const shown = done ? await publicManifest(data.listing.id, done.locale) : null;
  if (done && shown !== done.manifestId) {
    const state = !pointer
      ? o16.stateNone
      : pointer.state !== "active"
        ? optionLabel(pointer.state, locale)
        : shown
          ? o16.stateNewer
          : o16.stateIneligible;
    return (
      <FocusedState closeHref={review} closeLabel={copy.o12.close}>
        <h1 className="pe-12 text-heading font-semibold sm:text-title">{o16.activationRecorded}</h1>
        <p role="status">
          {fill(o16.activationNotCurrent, {
            reference: ref,
            locale: done.locale.toUpperCase(),
            name: actorName,
            state,
          })}
        </p>
        <a href={review} className={buttonClass("primary")}>
          {copy.o12.toTask}
        </a>
      </FocusedState>
    );
  }
  if (done) {
    const manifest = data.manifests.find((item) => item.id === done.manifestId);
    const url = `${host}/${done.locale}/properties/${ref}/${listingSlug(ref)}`;
    return (
      <FocusedState closeHref={review} closeLabel={copy.o12.close}>
        <h1 className="pe-12 text-heading font-semibold sm:text-title">{o16.published}</h1>
        <CheckIcon className="size-8 text-success" />
        <p role="status">
          {fill(o16.publishedDetail, {
            reference: ref,
            locale: done.locale.toUpperCase(),
            name: actorName,
            digest: manifest?.contentDigest.slice(0, 12) ?? "",
          })}
        </p>
        <p>{o16.publicPage}</p>
        <p className="break-all">{url}</p>
        <div className="flex flex-wrap gap-3">
          <a href={url} className={buttonClass("primary")}>
            {o16.openPublic}
          </a>
          <a href={review} className={buttonClass("secondary")}>
            {copy.o12.toTask}
          </a>
        </div>
      </FocusedState>
    );
  }

  // O16PUB (Figma 642:12654 / 642:12748): the publishing decision for one prepared package.
  const chosen =
    query.step === "publish" && mayPublish
      ? manifests.find((item) => item.id === query.manifest)
      : undefined;
  if (chosen) {
    const live = data.publications.length > 0;
    // A translation package is checked for its own locale, never with the BG readiness.
    const local =
      chosen.locale === "bg"
        ? readiness
        : await publicationReadiness(getDb(), actor, reference, chosen.locale);
    const localInput = local.input;
    return (
      <FocusedState closeHref={review} closeLabel={copy.o12.close}>
        <h1 className="pe-12 text-heading font-semibold sm:text-title">
          {fill(o16.publishTitle, { locale: chosen.locale.toUpperCase() })}
        </h1>
        <p>{o16.publishLead}</p>
        <FocusedRows
          rows={[
            [
              o16.rows.manifest,
              fill(o16.package, {
                reference: ref,
                locale: chosen.locale.toUpperCase(),
                digest: chosen.contentDigest.slice(0, 12),
              }),
            ],
            [
              o16.rows.facts,
              localInput.factReviewValid && localInput.revisionApprovalValid
                ? o16.approvedScope
                : o16.missing,
            ],
            [o16.rows.seller, localInput.sellerInstructionValid ? o16.sellerCurrent : o16.missing],
            [
              o16.rows.media,
              localInput.mediaEligible ? fill(o16.mediaRights, { n: photos.length }) : o16.missing,
            ],
            [
              o16.rows.language,
              chosen.locale === "bg"
                ? o16.sourceLanguage
                : localInput.localeApprovedForSource
                  ? o16.localeApproved
                  : o16.missing,
            ],
            [o16.rows.actor, fill(o16.actorRole, { name: actorName })],
            [
              o16.rows.effect,
              fill(live ? o16.effectReplace : o16.effectNew, { host: new URL(host).host }),
            ],
          ]}
        />
        {local.decision.outcome === "denied" ? (
          <p role="alert" className="rounded-control bg-warning-soft p-4 text-dense">
            {fill(o16.notEligibleLocale, {
              locale: chosen.locale.toUpperCase(),
              reason: local.decision.code.replaceAll("_", " "),
            })}
          </p>
        ) : null}
        {decision(
          "activate",
          `${copy.activate} (${chosen.locale.toUpperCase()})`,
          listing.publicationGeneration,
          chosen.id,
        )}
        <p className="flex items-start gap-3 rounded-control bg-warning-soft p-4 text-dense">
          <WarningIcon className="size-5 text-warning" />
          {o16.publishNote}
        </p>
        <a href={review} className={buttonClass("tertiary", "text-text")}>
          {o16.cancel}
        </a>
      </FocusedState>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-gutter py-6 sm:gap-8 sm:px-gutter-wide sm:py-8">
      <header className="flex flex-col gap-6 sm:gap-8">
        <h1 className="text-heading font-semibold sm:text-title">{copy.o12.reviewTitle}</h1>
        <p className="text-text-muted">{o16.instruction}</p>
      </header>
      {error}
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6 lg:max-w-[46.8rem]">
          <section
            aria-labelledby="o16-candidate"
            className="flex flex-col gap-3 rounded-panel border border-divider bg-canvas p-4 text-dense"
          >
            <h2 id="o16-candidate" className="font-semibold">
              {o16.candidate}
            </h2>
            <p className="bg-subtle p-3 text-text-muted">
              {data.publications.length
                ? fill(o16.publicLive, {
                    locales: data.publications
                      .map((p) => `${p.locale.toUpperCase()} ${optionLabel(p.state, locale)}`)
                      .join(", "),
                  })
                : o16.publicNone}
            </p>
            <p className="bg-brand-tint p-3 text-brand">
              {approved
                ? fill(o16.candidateApproved, { n: approved.revisionNumber })
                : revision
                  ? fill(o16.candidateUnapproved, { n: revision.revisionNumber })
                  : o16.candidateDraft}
            </p>
            {approved && revision && revision.id !== approved.id ? (
              <p className="bg-warning-soft p-3 text-text">
                {fill(o16.newerPending, {
                  newer: revision.revisionNumber,
                  approved: approved.revisionNumber,
                })}
              </p>
            ) : null}
          </section>
          <section aria-labelledby="o16-working" className="flex flex-col gap-3">
            <h2 id="o16-working" className="text-dense font-semibold">
              {o16.working}
            </h2>
            <p className="text-dense text-text-muted">
              {fill(o16.workingLine, { reference: ref })}
            </p>
            <p className="text-compact font-semibold" lang="bg">
              {values.title}
            </p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <figure className="flex w-full shrink-0 flex-col gap-2 sm:w-60">
                {cover ? (
                  // biome-ignore lint/performance/noImgElement: Authenticated previews must bypass shared image optimizers.
                  <img
                    src={`/api/files/private/media/${cover.asset.id}?preview=1`}
                    alt={cover.asset.altText ?? ""}
                    className="h-45 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-45 w-full items-center justify-center bg-subtle text-text-muted">
                    <NoPhotoIcon className="size-8" />
                  </div>
                )}
                <figcaption className="text-dense text-text-muted">
                  {cover
                    ? fill(o16.photoCaption, { reference: ref, total: photos.length })
                    : o16.noPhoto}
                </figcaption>
              </figure>
              <p className="min-w-0 whitespace-pre-wrap" lang="bg">
                {values.description}
              </p>
            </div>
            <p className="text-dense text-text-muted">{o16.changesNeedReview}</p>
          </section>
          <section aria-labelledby="o16-approvals" className="flex flex-col gap-1">
            <h2 id="o16-approvals" className="text-dense font-semibold">
              {approved ? fill(o16.approvalsFor, { n: approved.revisionNumber }) : o16.approvals}
            </h2>
            <ul className="flex flex-col">
              {checks.map(([label, okay]) => (
                <li key={label} className="flex min-h-control items-center gap-3 p-3 text-dense">
                  {okay ? (
                    <CheckIcon className="size-5 text-success" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="size-5 rounded-control border border-border"
                    />
                  )}
                  <span className="flex-1">{label}</span>
                  <span className={okay ? "text-success" : "text-text-muted"}>
                    {okay ? o16.done : o16.missing}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <p
            role="status"
            className={`flex items-start gap-3 rounded-control p-4 text-dense ${eligible ? "bg-success-soft" : "bg-warning-soft"}`}
          >
            {eligible ? (
              <CheckIcon className="size-5 text-success" />
            ) : (
              <WarningIcon className="size-5 text-warning" />
            )}
            {eligible ? o16.eligible : o16.blocked}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={
                eligible
                  ? manifests[0]
                    ? `${review}&step=publish&manifest=${manifests[0].id}`
                    : `#${inventorySections.review}`
                  : `#${inventorySections.navigation}`
              }
              className={buttonClass("primary")}
            >
              {eligible ? o16.toDecision : o16.reviewMissing}
            </a>
            <a href={path} className={buttonClass("secondary", "text-text")}>
              {o16.editText}
            </a>
            <a href={`/${locale}/inventory`} className={buttonClass("tertiary", "text-text")}>
              {o16.back}
            </a>
          </div>
        </div>
        <aside
          aria-labelledby="o16-before"
          className="flex flex-col gap-5 rounded-card bg-subtle p-5 lg:w-[23.2rem] lg:shrink-0"
        >
          <h2 id="o16-before" className="text-heading font-semibold">
            {o16.beforeYouDecide}
          </h2>
          <a
            href={`${path}/evidence`}
            className="flex items-start gap-3 rounded-control bg-subtle p-3 text-dense text-text no-underline hover:bg-selected"
          >
            <DocumentIcon className="size-5" />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-semibold">
                <bdi>{ref}</bdi> · BG
              </span>
              <span className="font-medium text-text-muted">
                {input.factReviewValid ? copy.o12.sourceReviewed : copy.o12.sourceUnreviewed}
              </span>
            </span>
            <ExternalIcon className="size-4" />
          </a>
          <p>
            {[
              priceLine === null ? null : `${o16.price} ${priceLine}`,
              ...areaLines,
              bedroomsValue === null ? null : bedroomCount(locale, bedroomsValue),
              property.settlement,
            ]
              .filter(Boolean)
              .map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
          </p>
          {unknown.length ? (
            <>
              <hr className="border-divider" />
              <p className="text-dense font-semibold text-warning">{o16.needsCheck}</p>
              <p className="text-dense text-text-muted">{unknown.join(", ")}</p>
            </>
          ) : null}
        </aside>
      </div>

      <h2 className="text-section font-semibold">{o16.remaining}</h2>
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
        <h3 id="readiness-heading" className="text-subheading font-semibold">
          {evidence.readiness}
        </h3>
        <div className="flex flex-wrap gap-4">
          <a className="text-action underline" href={`${path}/evidence`}>
            {evidence.title}
          </a>
          <a className="text-action underline" href={`${path}/media`}>
            {copy.o12.photos}
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
      <section
        id={inventorySections.draft}
        className="scroll-mt-6 space-y-4"
        aria-labelledby="draft-heading"
        tabIndex={-1}
      >
        <h3 id="draft-heading" className="text-subheading font-semibold">
          {copy.edit}
        </h3>
        <p>{copy.draftNotice}</p>
        {mayEdit ? decision("freeze", copy.prepare, listing.version) : null}
      </section>
      <section
        id={inventorySections.review}
        className="scroll-mt-6 space-y-4 border-t border-divider pt-6"
        aria-labelledby="review-heading"
        tabIndex={-1}
      >
        <h3 id="review-heading" className="text-subheading font-semibold">
          {copy.review}
        </h3>
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

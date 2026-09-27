// O12/O14/O16: working draft, immutable candidate and publication decisions stay distinct.
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { publicLocales } from "@/domain/ids";
import { inventoryCopy, optionLabel } from "@/features/inventory/copy";
import {
  type InventoryDecisionContext,
  type InventoryDecisionIntent,
  inventorySections,
} from "@/features/inventory/decision-contract";
import { inventoryDecisionCopy } from "@/features/inventory/decision-copy";
import { InventoryDecisionForm } from "@/features/inventory/decision-form";
import { InventoryEditor, type InventoryValues } from "@/features/inventory/editor";
import { evidenceCopy } from "@/features/inventory/evidence-copy";
import { FrozenPreview } from "@/features/inventory/frozen-preview";
import { requireStaffPage } from "@/server/auth/pages";
import { can } from "@/server/authz";
import { isAppError } from "@/server/errors";
import { inventoryDetail } from "@/server/inventory/commands";
import { draftSchema, emptyDraft } from "@/server/inventory/contracts";
import { publicationReadiness } from "@/server/publication/commands";
import { saveInventory, submitInventoryDecision } from "../actions";

export default async function InventoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; reference: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale, reference } = await params;
  const session = await requireStaffPage(locale);
  const db = getDb();
  const data = await inventoryDetail(db, session.actor, reference).catch((error) => {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  });
  const { listing, property, revision } = data;
  const copy = inventoryCopy(locale);
  const decisionCopy = inventoryDecisionCopy(locale);
  const evidence = evidenceCopy(locale);
  const readiness = await publicationReadiness(db, session.actor, reference);
  const resource = { type: "listing", id: listing.id, propertyId: property.id };
  const mayEdit = await can(db, session.actor, "listing.edit", resource);
  const mayReview = await can(db, session.actor, "listing.review_facts", resource);
  const mayPublish = await can(db, session.actor, "publication.release", resource);
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
      <a href={`/${locale}/inventory`} className="text-action underline">
        {copy.back}
      </a>
      <header>
        <h1 className="text-title font-semibold">
          <bdi>{listing.reference}</bdi> · {property.settlement}
        </h1>
        <p>
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
        <a className="text-action underline" href={`/${locale}/inventory/${reference}/evidence`}>
          {evidence.title}
        </a>
        <div className="flex flex-wrap gap-4">
          <a className="text-action underline" href={`/${locale}/inventory/${reference}/media`}>
            {locale === "bg"
              ? "Снимки и права"
              : locale === "ru"
                ? "Фотографии и права"
                : "Photos and rights"}
          </a>
          <a className="text-action underline" href={`/${locale}/inventory/${reference}/documents`}>
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
                href={`/${locale}/inventory/${reference}/translations/${language}`}
              >
                {language.toUpperCase()}
              </a>
            ))}
        </nav>
      ) : null}
      {(await searchParams).error ? (
        <p role="alert" className="rounded-panel border border-error bg-surface p-4 text-error">
          {copy.blocked}
        </p>
      ) : null}
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
        <p className="text-compact text-text-muted">{copy.factsHint}</p>
        {mayEdit ? (
          <InventoryEditor
            locale={locale}
            reference={reference}
            action={saveInventory.bind(null, locale, reference)}
            initialState={{
              values,
              operationId: randomUUID(),
              expectedRevision: listing.version,
              responseId: randomUUID(),
              outcome: { kind: "idle" },
            }}
          />
        ) : (
          <p>{copy.permissions}</p>
        )}
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

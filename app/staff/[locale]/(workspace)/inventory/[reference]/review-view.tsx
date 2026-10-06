// O16 (Figma 18:1471 / 18:3002): review for publication. The candidate, the BG working preview
// and the six required human approvals are read from recorded state; the approvals are status,
// never boxes to tick (O16EL: separate decisions, no shared "verified" mark). Every decision
// below keeps its own form, actor, permission and revision check.
import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import { publicLocales } from "@/domain/ids";
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
import { FrozenPreview } from "@/features/inventory/frozen-preview";
import type { inventoryDetail } from "@/server/inventory/commands";
import type { publicationReadiness } from "@/server/publication/commands";
import { termsFacts } from "@/server/publication/presentation";
import { buttonClass } from "@/ui/button-class";
import { CheckIcon, DocumentIcon, ExternalIcon, NoPhotoIcon, WarningIcon } from "@/ui/icons";
import { submitInventoryDecision } from "../actions";

type Detail = Awaited<ReturnType<typeof inventoryDetail>>;

function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}
function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const record = value as { value?: unknown; amountMinor?: unknown } | null;
  if (typeof record?.amountMinor === "number") return record.amountMinor / 100;
  if (typeof record?.value === "number") return record.value;
  return null;
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
}: {
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

  // The candidate and its facts: the frozen revision when there is one, else the working draft.
  const input = readiness.input;
  const eligible = readiness.decision.outcome === "allowed";
  const photos = [...data.media]
    .filter(({ relation }) => !relation.removedAt && !relation.hidden)
    .sort((a, b) => a.relation.position - b.relation.position);
  const cover = photos.find(({ asset }) => asset.scan === "clean" && asset.processing === "ready");
  const price = revision ? termsFacts(revision.terms).price : null;
  const area = revision ? data.facts.find((fact) => fact.fieldKey.startsWith("area.")) : null;
  const bedrooms = revision ? data.facts.find((fact) => fact.fieldKey === "bedrooms") : null;
  const known = (state: string | undefined, value: unknown) =>
    state === "known" ? number(value) : null;
  const facts = {
    price: revision
      ? known(price?.state, price?.value)
      : known(values.priceState, values.price === "" ? null : Number(values.price)),
    area: revision
      ? known(area?.state, area?.value)
      : known(values.areaState, values.area === "" ? null : Number(values.area)),
    bedrooms: revision
      ? known(bedrooms?.state, bedrooms?.value)
      : known(values.bedroomsState, values.bedrooms === "" ? null : Number(values.bedrooms)),
  };
  const unknown = [
    facts.price === null ? o16.price : null,
    facts.area === null ? o16.area : null,
    facts.bedrooms === null ? copy.o12.bedroomsLabel : null,
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
              {revision
                ? fill(o16.candidateRevision, { n: revision.revisionNumber })
                : o16.candidateDraft}
            </p>
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
            <h2 id="o16-approvals" className="sr-only">
              {o16.approvals}
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
              href={eligible ? `#${inventorySections.review}` : `#${inventorySections.navigation}`}
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
              facts.price === null
                ? null
                : `${o16.price} ${new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(facts.price)}`,
              facts.area === null
                ? null
                : `${o16.area} ${new Intl.NumberFormat(locale).format(facts.area)} m²`,
              facts.bedrooms === null ? null : bedroomCount(locale, facts.bedrooms),
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

import "server-only";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { DiscoveryPage } from "@/features/discovery/page";
import { workCopy } from "@/features/work/copy";
import { isPublicLocale, isStaffLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import type { Session } from "@/server/auth/sessions";
import { getEnv } from "@/server/config/env";
import {
  listContent,
  readContentOperation,
  readContentPlaces,
  readContentWorkbench,
} from "@/server/content/commands";
import { contentBody } from "@/server/content/public";
import { AppError } from "@/server/errors";
import { initialFormState } from "@/ui/form/server";
import { Notice } from "@/ui/notice";
import { Receipt } from "@/ui/receipt";
import { TechnicalDetails } from "@/ui/technical-details";
import {
  type ContentValues,
  type DecisionValues,
  decideContentAction,
  saveContentAction,
} from "./actions";
import { contentCopy } from "./copy";
import { ContentEditionLinks } from "./edition-links";
import { ContentForm, ContentReviewForm } from "./forms";
import { contentLabel } from "./labels";

export function checkContentLocale(locale: string) {
  if (!isStaffLocale(locale)) notFound();
}
function privateError(error: unknown): never {
  if (
    error instanceof AppError &&
    ["not_found", "forbidden", "validation_failed"].includes(error.code)
  )
    notFound();
  throw error;
}
export async function ContentListScreen({ locale, session }: { locale: string; session: Session }) {
  const copy = contentCopy(locale),
    result = await listContent(getDb(), session).catch(privateError);
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">{copy.title}</h1>
      <p>{copy.bg}</p>
      {result.canCreate ? (
        <a href={`/${locale}/content/new`} className="underline">
          {copy.new}
        </a>
      ) : null}
      {result.rows.length ? (
        <ul className="divide-y divide-border">
          {result.rows.map((page) => (
            <li key={page.id} className="space-y-2 py-4">
              <a
                href={`/${locale}/content/${page.id}${page.entryLocale && page.entryLocale !== "bg" ? `/editions/${page.entryLocale}` : ""}`}
                className="font-semibold underline"
              >
                {page.kind === "area" || page.kind === "service" || page.kind === "help"
                  ? copy[page.kind]
                  : copy.kind}{" "}
                / {page.slug}
              </a>
              <p className="text-compact">
                {contentLabel("publication", page.publicationState, locale)}
              </p>
              <TechnicalDetails locale={locale}>
                <p>
                  {page.kind} · {page.publicationState}
                </p>
                <p>
                  {copy.draft}: {page.currentVersionNumber} · {copy.live}:{" "}
                  {page.publishedVersionNumber ?? copy.none}
                </p>
              </TechnicalDetails>
            </li>
          ))}
        </ul>
      ) : (
        <Notice tone="info" title={copy.empty} />
      )}
    </DiscoveryPage>
  );
}
export async function ContentNewScreen({ locale, session }: { locale: string; session: Session }) {
  const copy = contentCopy(locale),
    result = await listContent(getDb(), session).catch(privateError);
  if (!result.canCreate) notFound();
  const { places, placesAvailable } = await readContentPlaces(getDb(), session).catch(privateError);
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">{copy.new}</h1>
      <p>{copy.bg}</p>
      <p>{copy.sequence}</p>
      <ContentForm
        locale={locale}
        places={places}
        placesAvailable={placesAvailable}
        initialState={initialFormState<ContentValues>("content.create", {
          kind: "help",
          slug: "",
          title: "",
          text: "",
          jurisdiction: "",
          reviewScope: "",
          placeId: "",
        })}
        action={saveContentAction.bind(null, locale, null)}
      />
    </DiscoveryPage>
  );
}
export async function ContentWorkbenchScreen({
  locale,
  session,
  id,
}: {
  locale: string;
  session: Session;
  id: string;
}) {
  const copy = contentCopy(locale),
    {
      page,
      current,
      decisions,
      access,
      places,
      placesAvailable,
      publishedPlaceId,
      localeEditions,
    } = await readContentWorkbench(getDb(), session, id).catch(privateError);
  const body = contentBody.parse(current.body);
  const placeLabel = (placeId: string | null | undefined) => {
    if (!placeId) return copy.unbound;
    const place = places.find((option) => option.id === placeId);
    return place
      ? `${place.nameNative} · ${copy[place.level]}${place.context ? ` / ${place.context}` : ""} (${place.countryCode})`
      : copy.placeUnavailable;
  };
  const publicPath =
    page.kind === "service" && ["sell", "let"].includes(page.slug)
      ? page.slug
      : page.kind === "help" && page.slug === "contact"
        ? "contact"
        : `${page.kind === "area" ? "areas" : page.kind === "service" ? "services" : page.kind === "review" ? "reviews" : "help"}/${page.slug}`;
  const now = new Date();
  const reviewed = (kind: string) =>
    decisions.some(
      (d) =>
        d.kind === kind &&
        d.state === "approved" &&
        d.subjectVersion === current.versionNumber &&
        d.subjectHash === current.contentHash &&
        !d.invalidatedAt &&
        d.decidedAt &&
        d.decidedAt <= now &&
        (!d.expiresAt || d.expiresAt > now),
    );
  const actions: ("claims" | "editorial" | "publish" | "withdraw")[] = [];
  if (access["claim.approve"]) actions.push("claims");
  if (access["listing.review_facts"] && current.reviewedAt && reviewed("legal_process_claim"))
    actions.push("editorial");
  if (
    access["publication.release"] &&
    current.reviewedAt &&
    reviewed("legal_process_claim") &&
    reviewed("editorial")
  )
    actions.push("publish");
  if (access["publication.release"] && page.publicationState === "active") actions.push("withdraw");
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">{body.title}</h1>
      <p>{copy.bg}</p>
      <p>{copy.sequence}</p>
      {localeEditions ? (
        <ContentEditionLinks shell={locale} id={id} selected="bg" editions={localeEditions} />
      ) : null}
      <div className="flex flex-wrap gap-4">
        <a className="underline" href={`/${locale}/content`}>
          {copy.back}
        </a>
        {page.publicationState === "active" ? (
          <a className="underline" href={`${getEnv().hosts.public}/bg/${publicPath}`}>
            {copy.public}
          </a>
        ) : null}
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        {[
          [
            copy.kind,
            page.kind === "area" || page.kind === "service" || page.kind === "help"
              ? copy[page.kind]
              : copy.kind,
          ],
          [copy.slug, page.slug],
          [copy.state, contentLabel("publication", page.publicationState, locale)],
          ...(page.kind === "area" ? [[copy.workingPlace, placeLabel(body.placeId)]] : []),
          ...(page.kind === "area" && page.publishedVersionNumber
            ? [[copy.publishedPlace, placeLabel(publishedPlaceId)]]
            : []),
          [copy.jurisdiction, current.jurisdiction],
          [copy.scope, current.reviewScope],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt className="text-caption text-text-muted">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <TechnicalDetails locale={locale}>
        <p>
          {page.kind} · {page.publicationState}
        </p>
        <p>
          {copy.draft}: {current.versionNumber} · {copy.live}:{" "}
          {page.publishedVersionNumber ?? copy.none}
        </p>
        <p>
          <bdi>{current.contentHash}</bdi>
        </p>
        {body.placeId ? (
          <p>
            <bdi>{body.placeId}</bdi>
          </p>
        ) : null}
        {publishedPlaceId ? (
          <p>
            <bdi>{publishedPlaceId}</bdi>
          </p>
        ) : null}
      </TechnicalDetails>
      {page.kind === "area" && body.placeId === undefined && page.placeId ? (
        <Notice tone="info" title={copy.legacyPlace} />
      ) : null}
      <section className="space-y-4 rounded-panel border border-border p-5">
        <h2 className="text-subheading font-semibold">{copy.preview}</h2>
        <h3 className="font-semibold" lang="bg">
          {body.title}
        </h3>
        {body.paragraphs.map((paragraph, index) => (
          // Immutable edition positions distinguish identical paragraphs; there is no local state.
          <p
            // biome-ignore lint/suspicious/noArrayIndexKey: immutable edition paragraph position
            key={`${current.id}:${index}`}
            lang="bg"
            className="whitespace-pre-wrap break-words"
          >
            {paragraph}
          </p>
        ))}
        <p className="text-caption">
          {current.reviewedAt
            ? `${copy.reviewDate}: ${formatDateTime(isPublicLocale(locale) ? locale : "bg", current.reviewedAt)}`
            : copy.missingReview}
        </p>
      </section>
      {access["content.edit"] ? (
        <section className="space-y-4">
          <h2 className="text-subheading font-semibold">{copy.draft}</h2>
          <ContentForm
            locale={locale}
            id={id}
            places={places}
            placesAvailable={placesAvailable}
            initialState={initialFormState<ContentValues>(
              `content.save.${id}`,
              {
                kind: page.kind,
                slug: page.slug,
                title: body.title,
                text: body.paragraphs.join("\n\n"),
                jurisdiction: current.jurisdiction ?? "",
                reviewScope: current.reviewScope ?? "",
                placeId: body.placeId ?? "",
              },
              page.version,
            )}
            action={saveContentAction.bind(null, locale, id)}
          />
        </section>
      ) : null}
      <section className="space-y-3">
        <h2 className="text-subheading font-semibold">{copy.reviews}</h2>
        {decisions.length ? (
          <ul className="space-y-3">
            {decisions.map((decision) => (
              <li key={decision.id} className="break-words">
                {contentLabel("review", decision.kind, locale)} ·{" "}
                {contentLabel("state", decision.state, locale)} ·{" "}
                {decision.decidedAt
                  ? formatDateTime(isPublicLocale(locale) ? locale : "bg", decision.decidedAt)
                  : copy.none}{" "}
                · {copy.until}:{" "}
                {decision.expiresAt
                  ? formatDateTime(isPublicLocale(locale) ? locale : "bg", decision.expiresAt)
                  : copy.none}
                <p className="text-caption">{decision.decisionNote}</p>
                <TechnicalDetails locale={locale}>
                  <p>
                    {decision.kind} · {decision.state}
                  </p>
                  <p>
                    <bdi>{decision.id}</bdi> · {decision.subjectVersion} ·{" "}
                    <bdi>{decision.subjectHash}</bdi>
                  </p>
                </TechnicalDetails>
              </li>
            ))}
          </ul>
        ) : (
          <p>{copy.none}</p>
        )}
      </section>
      {actions.map((decision) => (
        <section key={decision} className="space-y-4 rounded-panel border border-border p-5">
          <h2 className="text-subheading font-semibold">{copy[decision]}</h2>
          <ContentReviewForm
            locale={locale}
            id={id}
            decision={decision}
            initialState={initialFormState<DecisionValues>(
              `content.decide.${id}.${decision}`,
              { note: "", expiresAt: "", reviewed: "" },
              page.version,
            )}
            action={decideContentAction.bind(null, locale, id, decision)}
          />
        </section>
      ))}
    </DiscoveryPage>
  );
}
export async function ContentOperationScreen({
  locale,
  session,
  kind,
  operationKey,
  id,
}: {
  locale: string;
  session: Session;
  kind: "create" | "save" | "decide";
  operationKey: string;
  id?: string;
}) {
  const copy = contentCopy(locale),
    result = await readContentOperation(getDb(), session, kind, operationKey, id).catch(
      privateError,
    );
  const formCopy = workCopy(locale).form;
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">{copy.check}</h1>
      {result?.status === "succeeded" && result.id && result.recordedAt ? (
        <Receipt
          locale={locale}
          title={copy.saved}
          reference={result.operationId}
          referenceLabel={formCopy.reference}
          recordedAt={{
            dateTime: result.recordedAt,
            label: formatDateTime(isPublicLocale(locale) ? locale : "bg", result.recordedAt),
          }}
          recordedAtLabel={formCopy.recordedAt}
        >
          <p>{copy.next}</p>
        </Receipt>
      ) : (
        <Notice
          tone="info"
          title={result ? contentLabel("operation", result.status, locale) : copy.statusMissing}
        >
          {result ? (
            <TechnicalDetails locale={locale}>
              <p>{result.status}</p>
            </TechnicalDetails>
          ) : null}
        </Notice>
      )}
      <a
        className="underline"
        href={result?.id || id ? `/${locale}/content/${result?.id ?? id}` : `/${locale}/content`}
      >
        {copy.open}
      </a>
    </DiscoveryPage>
  );
}

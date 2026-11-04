import "server-only";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDb } from "@/db/client";
import { isCurrencyCode, isPublicLocale, type PublicLocale } from "@/domain/ids";
import { Ltr } from "@/i18n/bidi";
import { formatExactArea, formatMoney, formatNumber } from "@/i18n/format";
import { workflowCopy } from "@/i18n/workflow-copy";
import { getOwnerPreview } from "@/server/cases/owner-preview";
import { isAppError } from "@/server/errors";
import { ownerPreviewCopy, ownerPreviewLabel } from "./owner-preview-copy";
import {
  BoundWorkflowForm,
  type ScreenProps,
  WorkflowPage,
  WorkflowSection,
  workflowLink,
} from "./screens";

const separated = (values: ReactNode[], separator: string) =>
  values.reduce<ReactNode>(
    (result, value, index) =>
      index ? (
        <>
          {result}
          {separator}
          {value}
        </>
      ) : (
        value
      ),
    null,
  );

const scalar = (value: unknown, locale: PublicLocale): ReactNode => {
  const label = (value: string) => ownerPreviewLabel(value, locale);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    // Only the source money domain has a known minor-unit scale. Other objects retain
    // their recorded fields instead of being converted or assigned a currency meaning.
    if (
      typeof object.amountMinor === "number" &&
      Number.isSafeInteger(object.amountMinor) &&
      object.amountMinor >= 0 &&
      typeof object.currency === "string" &&
      isCurrencyCode(object.currency)
    )
      return (
        <>
          <bdi>{formatMoney(locale, object.amountMinor, object.currency)}</bdi>
          {object.period === "month" ? ` / ${label("month")}` : ""}
          {typeof object.basis === "string" ? ` · ${label(object.basis)}` : ""}
          {Array.isArray(object.inclusions) && object.inclusions.length ? (
            <> · {scalar(object.inclusions, locale)}</>
          ) : null}
        </>
      );
    if (typeof object.value === "number" && typeof object.unit === "string")
      return (
        <>
          <Ltr>
            {object.unit === "m2" && Number.isFinite(object.value) && object.value > 0
              ? formatExactArea(locale, object.value)
              : `${formatNumber(locale, object.value, { maximumFractionDigits: 20 })} ${object.unit}`}
          </Ltr>
          {typeof object.basis === "string" ? ` · ${label(object.basis)}` : ""}
        </>
      );
    return separated(
      Object.entries(object).map(([key, v]) => (
        <>
          {label(key)}: {scalar(v, locale)}
        </>
      )),
      " · ",
    );
  }
  if (typeof value === "number")
    return <Ltr>{formatNumber(locale, value, { maximumFractionDigits: 20 })}</Ltr>;
  if (typeof value === "boolean") return label(String(value));
  if (typeof value === "string") return value;
  return Array.isArray(value)
    ? separated(
        value.map((value) => scalar(value, locale)),
        ", ",
      )
    : "—";
};
export async function OwnerPreviewScreen(props: ScreenProps & { id: string; reference: string }) {
  const locale = isPublicLocale(props.locale) ? props.locale : "en";
  const c = ownerPreviewCopy(locale);
  let view: Awaited<ReturnType<typeof getOwnerPreview>>;
  try {
    view = await getOwnerPreview(getDb(), props.session, props.id, props.reference);
  } catch (error) {
    if (isAppError(error) && ["not_found", "forbidden"].includes(error.code)) notFound();
    if (!isAppError(error) || error.code !== "approval_stale") throw error;
    return (
      <WorkflowPage {...props} title={c.title}>
        <p>{c.unavailable}</p>
      </WorkflowPage>
    );
  }
  const path = `/${props.locale}/properties/${props.id}/preview?listing=${encodeURIComponent(props.reference)}`;
  return (
    <WorkflowPage {...props} title={`${c.title} · ${view.reference}`}>
      <a className={workflowLink} href={`/${props.locale}/overview/${props.id}`}>
        {c.back}
      </a>
      <p>{c.consequences}</p>
      <WorkflowSection title={c.source}>
        <p>{view.caseReference}</p>
        <details>
          <summary className="cursor-pointer font-semibold">{c.technical}</summary>
          <p>
            {workflowCopy(locale, "cases").revision} {scalar(view.revision, locale)}
          </p>
        </details>
        <div lang="bg" dir="ltr">
          <h2 className="font-semibold">{view.title}</h2>
          <p className="whitespace-pre-wrap">{view.description}</p>
        </div>
      </WorkflowSection>
      <WorkflowSection title={c.facts}>
        <dl className="space-y-3">
          {[...view.terms, ...view.facts].map((fact) => (
            <div key={fact.key}>
              <dt className="font-semibold">{ownerPreviewLabel(fact.key, locale)}</dt>
              <dd>
                {fact.state === "known"
                  ? scalar(
                      typeof fact.value === "number" && fact.unit
                        ? { value: fact.value, unit: fact.unit, basis: fact.basis }
                        : fact.value,
                      locale,
                    )
                  : ownerPreviewLabel(fact.state, locale)}
                {fact.unit && typeof fact.value !== "object" && typeof fact.value !== "number"
                  ? ` ${fact.unit}`
                  : ""}
                {fact.basis &&
                typeof fact.value !== "object" &&
                !(typeof fact.value === "number" && fact.unit)
                  ? ` · ${ownerPreviewLabel(fact.basis, locale)}`
                  : ""}
              </dd>
            </div>
          ))}
        </dl>
        <p>
          {c.privacy}: {ownerPreviewLabel(view.location.precision, locale)}
        </p>
        <p>
          {[
            view.location.country,
            view.location.region,
            view.location.municipality,
            view.location.settlement,
            view.location.neighborhood,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </WorkflowSection>
      <WorkflowSection title={c.media}>
        <div className="grid gap-5 sm:grid-cols-2">
          {view.media.map((image) => (
            <figure key={image.id}>
              {/* biome-ignore lint/performance/noImgElement: Private derivatives require the client session. */}
              <img
                src={`/${props.locale}/properties/${props.id}/preview/media/${image.id}?listing=${encodeURIComponent(view.reference)}&digest=${view.hash}`}
                alt={image.alt}
                className="h-auto w-full rounded-control"
              />
              <figcaption>
                {image.caption}
                {image.modification ? ` · ${image.modification}` : ""}
              </figcaption>
            </figure>
          ))}
        </div>
      </WorkflowSection>
      <WorkflowSection title={c.authorised}>
        <p>{view.instruction.reference}</p>
        <p>{ownerPreviewLabel(view.instruction.scope, locale)}</p>
        <p>{view.instruction.commissionTerms}</p>
        <p>
          {c.rights}: {scalar(view.instruction.mediaUsageRights, locale)}
        </p>
        <p>
          {c.permission}: {scalar(view.instruction.publicationPermission, locale)}
        </p>
        <p>{c.consequences}</p>
      </WorkflowSection>
      {view.acknowledged ? (
        <p role="status">{c.recorded}</p>
      ) : (
        <BoundWorkflowForm
          {...props}
          command="ownerAcknowledge"
          id={props.id}
          revision={view.caseVersion}
          path={path}
          fields={[
            { name: "reference", label: "Reference", type: "hidden" },
            { name: "previewHash", label: "Preview", type: "hidden" },
            { name: "reviewed", label: c.check, type: "checkbox", required: true },
          ]}
          values={{ reference: view.reference, previewHash: view.hash }}
          submit={c.acknowledge}
        />
      )}
    </WorkflowPage>
  );
}

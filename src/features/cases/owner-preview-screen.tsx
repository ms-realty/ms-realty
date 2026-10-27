import "server-only";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { isCurrencyCode } from "@/domain/ids";
import { isPublicLocale } from "@/i18n/config";
import { formatMoney } from "@/i18n/format";
import { getOwnerPreview } from "@/server/cases/owner-preview";
import { isAppError } from "@/server/errors";
import { clientWorkflowCopy } from "./client-workflow-copy";
import { ownerPreviewCopy, ownerPreviewLabel } from "./owner-preview-copy";
import {
  BoundWorkflowForm,
  type ScreenProps,
  WorkflowPage,
  WorkflowSection,
  workflowLink,
} from "./screens";

export const ownerPreviewScalar = (value: unknown, locale: string): string => {
  const label = (value: string) => ownerPreviewLabel(value, locale);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    if (
      typeof object.amountMinor === "number" &&
      typeof object.currency === "string" &&
      isCurrencyCode(object.currency)
    )
      return `${formatMoney(isPublicLocale(locale) ? locale : "bg", object.amountMinor, object.currency)}${object.period === "month" ? ` / ${label("month")}` : ""}${typeof object.basis === "string" ? ` · ${label(object.basis)}` : ""}${Array.isArray(object.inclusions) && object.inclusions.length ? ` · ${ownerPreviewScalar(object.inclusions, locale)}` : ""}`;
    if (typeof object.value === "number" && typeof object.unit === "string")
      return `${object.value} ${object.unit === "m2" ? "m²" : object.unit}${typeof object.basis === "string" ? ` · ${label(object.basis)}` : ""}`;
    return Object.entries(object)
      .map(([key, v]) => `${label(key)}: ${ownerPreviewScalar(v, locale)}`)
      .join(" · ");
  }
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? typeof value === "boolean"
      ? label(String(value))
      : String(value)
    : Array.isArray(value)
      ? value.map((value) => ownerPreviewScalar(value, locale)).join(", ")
      : "—";
};
export async function OwnerPreviewScreen(props: ScreenProps & { id: string; reference: string }) {
  const c = ownerPreviewCopy(props.locale);
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
          <p>Revision {view.revision}</p>
        </details>
        <div lang="bg">
          <h2 className="font-semibold">{view.title}</h2>
          <p className="whitespace-pre-wrap">{view.description}</p>
        </div>
      </WorkflowSection>
      <WorkflowSection title={c.facts}>
        <dl className="space-y-3">
          {[...view.terms, ...view.facts].map((fact) => (
            <div key={fact.key}>
              <dt className="font-semibold">{ownerPreviewLabel(fact.key, props.locale)}</dt>
              <dd>
                {fact.state === "known"
                  ? ownerPreviewScalar(fact.value, props.locale)
                  : ownerPreviewLabel(fact.state, props.locale)}
                {fact.unit && typeof fact.value !== "object" ? ` ${fact.unit}` : ""}
                {fact.basis && typeof fact.value !== "object"
                  ? ` · ${ownerPreviewLabel(fact.basis, props.locale)}`
                  : ""}
              </dd>
            </div>
          ))}
        </dl>
        <p>
          {c.privacy}: {ownerPreviewLabel(view.location.precision, props.locale)}
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
        <p>{view.instruction.scope}</p>
        <p>{view.instruction.commissionTerms}</p>
        <p>
          {c.rights}: {ownerPreviewScalar(view.instruction.mediaUsageRights, props.locale)}
        </p>
        <p>
          {c.permission}: {ownerPreviewScalar(view.instruction.publicationPermission, props.locale)}
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
      <WorkflowSection title={clientWorkflowCopy(props.locale).requestCorrection}>
        <p>{clientWorkflowCopy(props.locale).correctionHint}</p>
        <BoundWorkflowForm
          {...props}
          command="ownerCorrection"
          commandAvailable={view.canCorrect}
          id={props.id}
          revision={view.caseVersion}
          path={path}
          fields={[
            { name: "reference", label: "Reference", type: "hidden" },
            { name: "previewHash", label: "Preview", type: "hidden" },
            {
              name: "body",
              label: clientWorkflowCopy(props.locale).correction,
              type: "textarea",
              required: true,
            },
          ]}
          values={{ reference: view.reference, previewHash: view.hash }}
          submit={clientWorkflowCopy(props.locale).requestCorrection}
        />
      </WorkflowSection>
    </WorkflowPage>
  );
}

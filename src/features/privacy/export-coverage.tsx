// O26/F30 · AT45. Every declared category has a guarded native human decision.
import { randomUUID } from "node:crypto";
import {
  type PrivacyExportReview,
  privacyExportBasis,
  privacyExportDispositions,
} from "@/domain/privacy-export";
import type { PrivacyDossier } from "@/server/privacy/exports";
import { controlClass, labelClass } from "@/ui/field-class";
import { NativeForm } from "@/ui/form/native-form";
import { Notice } from "@/ui/notice";
import { TechnicalDetails } from "@/ui/technical-details";
import { privacyExportCopy } from "./export-copy";
import { Area, Check, Submit, TextField } from "./forms";

export function ExportCoverageForms({
  locale,
  action,
  requestVersion,
  exportId,
  exportVersion,
  digest,
  reviewDigest,
  review,
  dossier,
  policyReference,
}: {
  locale: string;
  action: string;
  requestVersion: number;
  exportId: string;
  exportVersion: number;
  digest: string;
  reviewDigest: string;
  review: PrivacyExportReview;
  dossier: PrivacyDossier;
  policyReference: string;
}) {
  const c = privacyExportCopy(locale);
  return (
    <div className="grid min-w-0 gap-4">
      <h3 className="font-semibold">{c.inventory}</h3>
      <p>{c.inventoryHelp}</p>
      {review.inventory.categories.map((bucket) => {
        const previous = review.decisions.find((row) => row.category === bucket.category);
        return (
          <NativeForm
            key={bucket.category}
            action={action}
            method="post"
            className="grid min-w-0 gap-3 rounded-panel border border-divider p-4"
            data-export-category={bucket.category}
          >
            <input type="hidden" name="intent" value="disposition" />
            <input type="hidden" name="operationId" value={randomUUID()} />
            <input type="hidden" name="expectedVersion" value={requestVersion} />
            <input type="hidden" name="exportId" value={exportId} />
            <input type="hidden" name="exportVersion" value={exportVersion} />
            <input type="hidden" name="digest" value={digest} />
            <input type="hidden" name="reviewDigest" value={reviewDigest} />
            <input type="hidden" name="category" value={bucket.category} />
            <h4 className="font-semibold">{c.categories[bucket.category]}</h4>
            {bucket.blocked ? <Notice tone="info">{c.sourceUnknown}</Notice> : null}
            <label className="grid gap-2">
              <span className={labelClass}>{c.disposition}</span>
              <select
                name="disposition"
                className={controlClass}
                defaultValue={previous?.disposition ?? "unsupported"}
              >
                {privacyExportDispositions.map((value) => (
                  <option key={value} value={value}>
                    {c.dispositions[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className={labelClass}>{c.basis}</span>
              <select
                name="basis"
                className={controlClass}
                defaultValue={previous?.basis ?? "pending_review"}
              >
                {privacyExportBasis.options.map((value) => (
                  <option key={value} value={value}>
                    {c.bases[value]}
                  </option>
                ))}
              </select>
            </label>
            <TechnicalDetails locale={locale}>
              {bucket.sources.map((source) => (
                <div key={source.key} className="grid min-w-0 gap-2 py-2">
                  <input type="hidden" name="sourceKey" value={source.key} />
                  <p className="break-all" dir="ltr">
                    {source.key}
                  </p>
                  {bucket.category !== "personal_activity" ? (
                    <label className="grid gap-2">
                      <span className={labelClass}>{c.sourceProof}</span>
                      <select
                        name={`proof:${source.key}`}
                        className={controlClass}
                        defaultValue={
                          previous?.evidence.find((row) => row.sourceKey === source.key)
                            ?.documentVersionId ?? ""
                        }
                      >
                        <option value="">—</option>
                        {dossier.supplements
                          .filter((row) => row.category === bucket.category)
                          .map((row) => (
                            <option key={row.source.versionId} value={row.source.versionId}>
                              {row.source.versionId}
                            </option>
                          ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              ))}
              {previous ? (
                <p>
                  {c.reviewer}: <bdi>{previous.reviewedById}</bdi>
                </p>
              ) : null}
            </TechnicalDetails>
            <TextField
              name="policyReference"
              label={c.policyReference}
              value={policyReference}
              required
            />
            <Area
              name="evidenceReference"
              label={c.evidenceReference}
              value={previous?.evidenceReference}
              required
            />
            <Check name="confirmed">{c.decisionConfirm}</Check>
            <Submit>{c.saveDisposition}</Submit>
          </NativeForm>
        );
      })}
    </div>
  );
}

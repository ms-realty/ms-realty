// O26/C18 · AT43/AT45: native review of frozen personal data and explicit partial scope.
import { randomUUID } from "node:crypto";
import { getDb } from "@/db/client";
import type { Session } from "@/server/auth/sessions";
import {
  exportSections,
  privacyExportOperationStatus,
  privacyExportReceipt,
  staffPrivacyExports,
} from "@/server/privacy/exports";
import { controlClass, labelClass } from "@/ui/field-class";
import { NativeForm } from "@/ui/form/native-form";
import { Notice } from "@/ui/notice";
import { TechnicalDetails } from "@/ui/technical-details";
import { privacyExportCopy } from "./export-copy";
import { ExportCoverageForms } from "./export-coverage";
import { Check, Submit, TextField } from "./forms";

export async function StaffPrivacyExportScreen({
  locale,
  session,
  requestId,
  query,
}: {
  locale: string;
  session: Session;
  requestId: string;
  query: { error?: string; receipt?: string; operation?: string };
}) {
  const c = privacyExportCopy(locale),
    db = getDb(),
    data = await staffPrivacyExports(db, session, requestId);
  const operation = query.operation
    ? await privacyExportOperationStatus(db, session, requestId, query.operation)
    : null;
  const pending = operation && !["succeeded", "failed", "absent"].includes(operation);
  const action = `/${locale}/operations/privacy/${requestId}/export/submit`;
  return (
    <div className="mx-auto grid min-w-0 max-w-4xl gap-5 px-gutter py-8">
      <h1 className="text-title font-semibold">{c.title}</h1>
      <p>
        <bdi>{data.request.reference}</bdi>
      </p>
      <Notice tone="info">
        {data.request.state === "completed" ? c.completedScope : c.inventoryHelp}
      </Notice>
      {query.receipt && (await privacyExportReceipt(db, session, requestId, query.receipt)) ? (
        <Notice tone="success">{c.saved}</Notice>
      ) : null}
      {query.error ? <Notice tone="error">{c.error}</Notice> : null}
      {pending ? (
        <Notice tone="info">
          {c.pending}
          <a
            className="block underline"
            href={`/${locale}/operations/privacy/${requestId}/export?operation=${encodeURIComponent(query.operation ?? "")}`}
          >
            {c.check}
          </a>
        </Notice>
      ) : null}
      {data.request.state === "in_progress" && !pending ? (
        <NativeForm
          action={action}
          method="post"
          className="grid gap-4 rounded-panel border border-divider p-5"
        >
          <input type="hidden" name="intent" value="prepare" />
          <input type="hidden" name="operationId" value={randomUUID()} />
          <input type="hidden" name="expectedVersion" value={data.request.version} />
          <label className="grid gap-2">
            <span className={labelClass}>{c.recipient}</span>
            <select name="recipientId" required className={controlClass}>
              {data.recipients.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.email}
                </option>
              ))}
            </select>
          </label>
          <Check name="confirmed">{c.confirm}</Check>
          <Submit>{c.prepare}</Submit>
        </NativeForm>
      ) : null}
      {data.exports.map((row) => (
        <section
          key={row.id}
          className="grid min-w-0 gap-4 rounded-panel border border-divider p-5"
        >
          <h2 className="font-semibold">{c[row.state]}</h2>
          {row.reviewStale ? <Notice tone="info">{c.manifestStale}</Notice> : null}
          {row.coverageComplete && row.review ? <Notice tone="info">{c.readyScope}</Notice> : null}
          <p>
            {c.recipient}:{" "}
            <bdi>{data.recipients.find((p) => p.id === row.recipientId)?.email ?? "—"}</bdi>
          </p>
          <TechnicalDetails locale={locale}>
            <p>{row.sha256}</p>
            {row.dossier ? (
              <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-all" dir="auto">
                {JSON.stringify(row.dossier, null, 2)}
              </pre>
            ) : null}
          </TechnicalDetails>
          {row.dossier && !pending ? (
            <TechnicalDetails locale={locale}>
              <NativeForm action={action} method="post" className="grid gap-4">
                <input type="hidden" name="intent" value="supplement" />
                <input type="hidden" name="operationId" value={randomUUID()} />
                <input type="hidden" name="expectedVersion" value={data.request.version} />
                <input type="hidden" name="exportId" value={row.id} />
                <input type="hidden" name="exportVersion" value={row.version} />
                <input type="hidden" name="digest" value={row.sha256} />
                <TextField name="documentVersionId" label={c.sourceVersion} required />
                <label className="grid gap-2">
                  <span className={labelClass}>{c.disclosureCategory}</span>
                  <select name="category" className={controlClass}>
                    {(
                      [
                        "private_files",
                        "joint_records_and_received_communications",
                        "restricted_material_and_security_credentials",
                      ] as const
                    ).map((value) => (
                      <option key={value} value={value}>
                        {c.categories[value]}
                      </option>
                    ))}
                  </select>
                </label>
                <Check name="reviewedRedaction">{c.supplementConfirm}</Check>
                <Submit>{c.supplement}</Submit>
              </NativeForm>
            </TechnicalDetails>
          ) : null}
          {row.dossier && !pending ? (
            <>
              <NativeForm action={action} method="post" className="grid gap-3">
                <input type="hidden" name="intent" value="inventory" />
                <input type="hidden" name="operationId" value={randomUUID()} />
                <input type="hidden" name="expectedVersion" value={data.request.version} />
                <input type="hidden" name="exportId" value={row.id} />
                <input type="hidden" name="exportVersion" value={row.version} />
                <input type="hidden" name="digest" value={row.sha256} />
                <Submit>{row.review ? c.refreshInventory : c.inventory}</Submit>
              </NativeForm>
              {row.review && row.reviewSha256 ? (
                <ExportCoverageForms
                  locale={locale}
                  action={action}
                  requestVersion={data.request.version}
                  exportId={row.id}
                  exportVersion={row.version}
                  digest={row.sha256}
                  reviewDigest={row.reviewSha256}
                  review={row.review}
                  dossier={row.dossier}
                  policyReference={String(
                    (data.request.scope as { policyReference?: string }).policyReference ?? "",
                  )}
                />
              ) : null}
            </>
          ) : null}
          {row.dossier && !pending ? (
            <NativeForm action={action} method="post" className="grid gap-4">
              <input type="hidden" name="intent" value="redact" />
              <input type="hidden" name="operationId" value={randomUUID()} />
              <input type="hidden" name="expectedVersion" value={data.request.version} />
              <input type="hidden" name="exportId" value={row.id} />
              <input type="hidden" name="exportVersion" value={row.version} />
              <input type="hidden" name="digest" value={row.sha256} />
              <h3 className="font-semibold">{c.review}</h3>
              {exportSections.map((section) =>
                row.dossier?.data[section].map((item) => (
                  <div
                    key={`${section}:${item.id}`}
                    className="grid gap-2 border-b border-divider pb-3"
                  >
                    <p className="whitespace-pre-wrap break-words" dir="auto">
                      {item.text}
                    </p>
                    <label className="flex gap-2">
                      <input
                        type="checkbox"
                        name="omitText"
                        value={`${section}:${item.id}`}
                        className="size-5"
                        disabled={row.dossier?.redactedText.some(
                          (entry) => entry.section === section && entry.id === item.id,
                        )}
                      />
                      <span>{c.omit}</span>
                    </label>
                  </div>
                )),
              )}
              <Submit>{c.redact}</Submit>
            </NativeForm>
          ) : null}
          {row.dossier && !pending ? (
            <NativeForm action={action} method="post" className="grid gap-4">
              <input type="hidden" name="intent" value="issue" />
              <input type="hidden" name="operationId" value={randomUUID()} />
              <input type="hidden" name="expectedVersion" value={data.request.version} />
              <input type="hidden" name="exportId" value={row.id} />
              <input type="hidden" name="exportVersion" value={row.version} />
              <input type="hidden" name="digest" value={row.sha256} />
              <TextField name="expiresMinutes" label={c.expiry} type="number" value="60" required />
              <Check name="reviewed">{c.reviewed}</Check>
              <Check name="partialAcknowledged">{c.acknowledge}</Check>
              <Submit>
                {row.dossier.fulfilment === "reviewed_scope" ? c.issueReviewed : c.issue}
              </Submit>
            </NativeForm>
          ) : null}
          {row.state === "issued" &&
          row.coverageComplete &&
          row.review &&
          row.reviewSha256 &&
          data.request.state === "in_progress" &&
          !pending ? (
            <NativeForm action={action} method="post" className="grid gap-3">
              <input type="hidden" name="intent" value="complete" />
              <input type="hidden" name="operationId" value={randomUUID()} />
              <input type="hidden" name="expectedVersion" value={data.request.version} />
              <input type="hidden" name="exportId" value={row.id} />
              <input type="hidden" name="exportVersion" value={row.version} />
              <input type="hidden" name="digest" value={row.sha256} />
              <input type="hidden" name="reviewDigest" value={row.reviewSha256} />
              <Check name="confirmed">{c.completeConfirm}</Check>
              <Submit>{c.complete}</Submit>
            </NativeForm>
          ) : null}
          {row.state !== "revoked" && !pending ? (
            <NativeForm action={action} method="post" className="grid gap-3">
              <input type="hidden" name="intent" value="revoke" />
              <input type="hidden" name="operationId" value={randomUUID()} />
              <input type="hidden" name="exportId" value={row.id} />
              <input type="hidden" name="exportVersion" value={row.version} />
              <Check name="confirmed">{c.revokeConfirm}</Check>
              <Submit>{c.revoke}</Submit>
            </NativeForm>
          ) : null}
        </section>
      ))}
      <a className="underline" href={`/${locale}/operations/privacy`}>
        {c.back}
      </a>
    </div>
  );
}

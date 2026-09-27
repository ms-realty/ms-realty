import "server-only";
import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { documentClassifications } from "@/domain/document";
import { isFresh } from "@/server/auth/sessions";
import { documentRequestWorkbench } from "@/server/documents/requests";
import { isAppError } from "@/server/errors";
import { fileReceipt } from "@/server/files/receipts";
import { findOperation } from "@/server/operations";
import { controlClass } from "@/ui/field-class";
import { initialFormState } from "@/ui/form/server";
import { caseCopy } from "../cases/copy";
import { type WorkflowField, WorkflowForm } from "../cases/form";
import {
  type ScreenProps,
  WorkflowPage,
  WorkflowSection,
  WorkflowTime,
  workflowLink,
} from "../cases/screens";
import { fileLabel, filesCopy } from "../files/copy";
import { documentRequestAction } from "./actions";
import { type RequestBinding, requestFields, requestScope } from "./contract";
import { documentRequestCopy } from "./copy";

function RequestForm({
  locale,
  binding,
  version,
  fields,
  path,
  submit,
  values = {},
}: {
  locale: string;
  binding: RequestBinding;
  version: number;
  fields: WorkflowField[];
  path: string;
  submit: string;
  values?: Record<string, string>;
}) {
  const initial = initialFormState(
    requestScope(binding),
    Object.fromEntries(requestFields[binding.command].map((name) => [name, values[name] ?? ""])),
    version,
  );
  return (
    <WorkflowForm
      locale={locale}
      initialState={initial}
      fields={fields}
      action={documentRequestAction.bind(null, locale, binding)}
      path={path}
      submit={submit}
      status={{
        href: `${path}?command=${binding.command}&key=${encodeURIComponent(initial.operationId)}`,
        label: documentRequestCopy(locale).refresh,
      }}
    />
  );
}
export async function DocumentRequestsScreen(
  props: ScreenProps & {
    caseId?: string;
    id?: string;
    query?: Record<string, string | string[] | undefined>;
  },
) {
  const { locale, session, query = {} } = props,
    c = documentRequestCopy(locale),
    fc = filesCopy(locale);
  const staff = session.actor.kind === "staff",
    db = getDb();
  const path = staff
    ? `/${locale}/cases/${props.caseId}/document-requests`
    : `/${locale}/documents/requests${props.id ? `/${props.id}` : ""}`;
  if (!isFresh(session)) redirect(`/${locale}/access/reauth?returnTo=${encodeURIComponent(path)}`);
  const view = await documentRequestWorkbench(db, session, {
    caseId: props.caseId,
    id: props.id,
  }).catch((error) => {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  });
  const saved =
    typeof query.saved === "string" ? await fileReceipt(db, session, query.saved) : null;
  const command =
    typeof query.command === "string" && ["create", "review", "cancel"].includes(query.command)
      ? query.command
      : null;
  const receipt =
    staff && command && typeof query.key === "string"
      ? await findOperation(db, session.actor, `document.request.${command}`, query.key)
      : null;
  return (
    <WorkflowPage {...props} title={c.title}>
      <p>{c.audience}</p>
      <p className="text-text-muted">{c.safety}</p>
      {saved ? <p role="status">{c.saved}</p> : null}
      {query.error ? <p role="alert">{c.failed}</p> : null}
      {query.key ? (
        <section aria-label={caseCopy(locale).status} className="space-y-2" role="status">
          <h2 className="font-semibold">
            {receipt?.status === "succeeded"
              ? caseCopy(locale).statusSaved
              : receipt?.status === "failed"
                ? c.failed
                : c.processing}
          </h2>
          {receipt ? <p>{receipt.operationId}</p> : null}
          <a className={workflowLink} href={`${path}?refresh=${randomUUID()}`}>
            {caseCopy(locale).back}
          </a>
        </section>
      ) : null}
      <a className={workflowLink} href={`${path}?refresh=${randomUUID()}`}>
        {c.refresh}
      </a>
      {view.canCreate && view.case ? (
        <WorkflowSection title={c.create}>
          <RequestForm
            locale={locale}
            binding={{ command: "create", caseId: view.case.id }}
            version={view.case.version}
            path={path}
            submit={c.create}
            values={{
              classification: "property",
              allowedContentTypes: "application/pdf",
              maxBytes: "20971520",
            }}
            fields={[
              {
                name: "recipientParticipantId",
                label: c.recipient,
                type: "select",
                required: true,
                options: [
                  { value: "", label: "—" },
                  ...view.recipients.map((r) => ({ value: r.id, label: `${r.name} · ${r.role}` })),
                ],
              },
              {
                name: "policyId",
                label: c.policy,
                type: "select",
                required: true,
                options: [
                  { value: "", label: "—" },
                  ...view.policies.map((p) => ({
                    value: p.id,
                    label: `${p.title} · ${p.country}`,
                  })),
                ],
              },
              { name: "title", label: c.name, required: true },
              { name: "purpose", label: c.purpose, type: "textarea", required: true },
              { name: "instructions", label: c.instructions, type: "textarea", required: true },
              { name: "alternatives", label: c.alternatives, type: "textarea", required: true },
              {
                name: "classification",
                label: c.classification,
                type: "select",
                required: true,
                options: documentClassifications.map((value) => ({
                  value,
                  label: fileLabel(fc, value),
                })),
              },
              {
                name: "allowedContentTypes",
                label: c.types,
                type: "select",
                options: [
                  { value: "application/pdf", label: "PDF" },
                  {
                    value: "application/pdf,image/jpeg,image/png,image/webp",
                    label: "PDF, JPEG, PNG, WebP",
                  },
                ],
              },
              { name: "maxBytes", label: c.limit, type: "number", required: true },
              { name: "expiresAt", label: c.expires, type: "datetime-local", required: true },
            ]}
          />
        </WorkflowSection>
      ) : null}
      {!view.requests.length ? <p>{c.empty}</p> : null}
      {view.requests.map((row) => (
        <WorkflowSection key={row.id} title={`${row.title} · ${row.reference}`}>
          <p>
            {c.recipient}: {row.recipientName}
          </p>
          <p>
            <strong>{c.purpose}:</strong> {row.purpose}
          </p>
          <p>
            <strong>{c.instructions}:</strong> {row.instructions}
          </p>
          <p>
            <strong>{c.alternatives}:</strong> {row.alternatives}
          </p>
          <p>
            {c.types}:{" "}
            {row.allowedContentTypes
              .map(
                (type) =>
                  ({
                    "application/pdf": "PDF",
                    "image/jpeg": "JPEG",
                    "image/png": "PNG",
                    "image/webp": "WebP",
                  })[type] ?? type,
              )
              .join(", ")}{" "}
            ·{" "}
            {new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
              row.maxBytes / (1024 * 1024),
            )}{" "}
            MiB
          </p>
          <p>
            {c.expires}: <WorkflowTime value={row.expiresAt} locale={locale} />
          </p>
          {row.cancelledAt ? (
            <p role="status">{c.cancelled}</p>
          ) : row.expiresAt <= new Date() ? (
            <p role="status">{c.expired}</p>
          ) : null}
          {row.clientOutcome ? (
            <p>
              {c.outcome}: {row.clientOutcome}
            </p>
          ) : null}
          {row.file ? (
            <div className="space-y-2">
              <p>
                {row.file.fileName} · {fc.version} {row.file.number}
              </p>
              <p>
                {fc.state}: {fileLabel(fc, row.file.state)}
              </p>
              <p>
                {fc.scan}: {fileLabel(fc, row.file.scan)}
              </p>
              <p>
                {fc.review}: {row.file.reviewType ? fileLabel(fc, row.file.reviewType) : fc.pending}
              </p>
              {row.file.scan === "clean" &&
              ["ready_for_review", "reviewed"].includes(row.file.state) ? (
                <a
                  className={workflowLink}
                  href={`/api/files/private/document/${row.file.id}`}
                  download
                >
                  {c.download}
                </a>
              ) : null}
            </div>
          ) : (
            <p>{c.pending}</p>
          )}
          {!staff && !props.id ? (
            <a className={workflowLink} href={`/${locale}/documents/requests/${row.id}`}>
              {c.current}
            </a>
          ) : null}
          {!staff && props.id && row.canUpload ? (
            <form
              method="post"
              encType="multipart/form-data"
              action={`${path}/submit`}
              className="space-y-4"
            >
              <input type="hidden" name="operationId" value={randomUUID()} />
              <input type="hidden" name="expectedRevision" value={row.version} />
              <label className="block space-y-2">
                <span className="font-semibold">{c.file}</span>
                <input
                  className={controlClass}
                  type="file"
                  name="file"
                  accept={row.allowedContentTypes.join(",")}
                  required
                />
              </label>
              <button
                type="submit"
                className="min-h-control rounded-control bg-action px-5 py-2 font-semibold text-on-action"
              >
                {c.upload}
              </button>
            </form>
          ) : !staff && props.id && !row.cancelledAt ? (
            <p>{c.unavailable}</p>
          ) : null}
          {staff && row.canReview && row.file ? (
            <RequestForm
              locale={locale}
              binding={{
                command: "review",
                caseId: row.caseId,
                requestId: row.id,
                versionId: row.file.id,
                fileRevision: row.file.version,
              }}
              version={row.version}
              path={path}
              submit={c.review}
              fields={[
                {
                  name: "reviewType",
                  label: fc.decision,
                  type: "select",
                  required: true,
                  options: [
                    { value: "", label: "—" },
                    ...[
                      "accepted_for_purpose",
                      "needs_replacement",
                      "reviewed_with_open_questions",
                    ].map((value) => ({ value, label: fileLabel(fc, value) })),
                  ],
                },
                { name: "note", label: c.internal, type: "textarea", required: true },
                { name: "clientOutcome", label: c.outcome, type: "textarea", required: true },
                { name: "confirmed", label: c.confirm, type: "checkbox", required: true },
              ]}
            />
          ) : null}
          {staff && view.canCreate && !row.cancelledAt ? (
            <RequestForm
              locale={locale}
              binding={{ command: "cancel", caseId: row.caseId, requestId: row.id }}
              version={row.version}
              path={path}
              submit={c.cancel}
              fields={[
                { name: "clientOutcome", label: c.outcome, type: "textarea", required: true },
              ]}
            />
          ) : null}
          <a
            className={workflowLink}
            href={`/${locale}/${staff ? "cases" : "overview"}/${row.caseId}`}
          >
            {c.back}
          </a>
        </WorkflowSection>
      ))}
    </WorkflowPage>
  );
}

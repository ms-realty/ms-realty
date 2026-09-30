import "server-only";
import { getDb } from "@/db/client";
import { documentClassifications } from "@/domain/document";
import type { Session } from "@/server/auth/sessions";
import { caseDocumentPurposes } from "@/server/documents/purposes";
import { isAppError } from "@/server/errors";
import { attachmentProviderEnabled } from "@/server/inbound/attachment-provider";
import { attachmentImportScope, readInboundAttachments } from "@/server/inbound/attachments";
import type { ReceivedEmail } from "@/server/jobs/resend-receiving";
import { buttonClass } from "@/ui/button-class";
import { controlClass } from "@/ui/field-class";
import { issueFormOperation } from "@/ui/form/server";
import { Notice } from "@/ui/notice";
import { attachmentCopy } from "./attachment-copy";
import { attachmentDraft, attachmentReceipt } from "./attachment-native";
export async function InboundAttachments({
  session,
  locale,
  id,
  caseId,
  receipt,
}: {
  session: Session;
  locale: string;
  id: string;
  caseId: string;
  receipt?: string;
}) {
  const db = getDb(),
    c = attachmentCopy(locale),
    base = `/${locale}/operations/inbound/${id}`;
  let view: Awaited<ReturnType<typeof readInboundAttachments>>;
  try {
    view = await readInboundAttachments(db, session, id, caseId);
  } catch (error) {
    if (isAppError(error) && error.code === "step_up_required")
      return (
        <a
          className="underline"
          href={`/${locale}/access/reauth?returnTo=${encodeURIComponent(base)}`}
        >
          {c.reauth}
        </a>
      );
    if (isAppError(error) && ["not_found", "forbidden"].includes(error.code))
      return <p>{c.denied}</p>;
    throw error;
  }
  const saved = await attachmentReceipt(db, session, id, receipt),
    draft = await attachmentDraft(session, id);
  const pending = (view.row.attachments as ReceivedEmail["attachments"]).filter(
    (a) => !view.imports.some((i) => i.link.attachmentId === a.id),
  );
  const configured = attachmentProviderEnabled(view.row.provider);
  return (
    <section
      className="grid min-w-0 gap-4 rounded-control border border-border p-4"
      aria-labelledby="attachment-title"
    >
      <h2 id="attachment-title" className="text-subheading font-semibold">
        {c.title}
      </h2>
      <p>{c.lead}</p>
      {saved && view.imports.some((i) => i.file.id === saved.versionId) ? (
        <div role="status">
          <Notice tone="success">
            {c.receipt}: <bdi data-attachment-receipt>{saved.id}</bdi>
          </Notice>
        </div>
      ) : null}
      {view.imports.length ? (
        <div className="grid min-w-0 gap-2">
          <h3>{c.imported}</h3>
          <ul className="grid min-w-0 gap-2">
            {view.imports.map(({ link, file }) => (
              <li key={link.id} data-imported-attachment={link.attachmentId} className="break-all">
                <bdi>{file.fileName}</bdi> — {c[file.scan]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <a className="underline" href={`/${locale}/cases/${caseId}/documents`}>
        {c.documents}
      </a>
      {!configured ? (
        <p>{c.unavailable}</p>
      ) : view.record.disposition === "closed" ? (
        <p>{c.closed}</p>
      ) : pending.length ? (
        <form
          method="post"
          action={`${base}/attachments/submit`}
          className="grid min-w-0 gap-4"
          data-attachment-form
        >
          <input
            type="hidden"
            name="operationId"
            value={issueFormOperation(`${attachmentImportScope}:${id}`)}
          />
          <input type="hidden" name="expectedVersion" value={view.row.version} />
          <input type="hidden" name="caseId" value={caseId} />
          <input type="hidden" name="caseVersion" value={view.record.version} />
          <p id="attachment-limit">{c.limit}</p>
          <label htmlFor="attachment-choice">{c.select}</label>
          <select
            id="attachment-choice"
            name="attachmentId"
            className={`${controlClass} min-w-0 max-w-full text-ellipsis`}
            required
            defaultValue={draft?.attachmentId ?? ""}
            aria-describedby="attachment-limit"
          >
            <option value="">—</option>
            {pending.map((a) => (
              <option key={a.id} value={a.id}>
                {a.filename ?? a.id} · {a.contentType}
              </option>
            ))}
          </select>
          <label htmlFor="attachment-filename">{c.fileName}</label>
          <input
            id="attachment-filename"
            name="fileName"
            className={controlClass}
            required
            maxLength={160}
            defaultValue={draft?.fileName ?? ""}
          />
          <label htmlFor="attachment-purpose">{c.purpose}</label>
          <select
            id="attachment-purpose"
            name="purpose"
            className={controlClass}
            required
            defaultValue={draft?.purpose ?? ""}
          >
            <option value="">—</option>
            {caseDocumentPurposes.map((p) => (
              <option key={p} value={p}>
                {c[p]}
              </option>
            ))}
          </select>
          <label htmlFor="attachment-class">{c.classification}</label>
          <select
            id="attachment-class"
            name="classification"
            className={controlClass}
            required
            defaultValue={draft?.classification ?? ""}
          >
            <option value="">—</option>
            {documentClassifications.map((p) => (
              <option key={p} value={p}>
                {p === "title" ? c.titleDocument : c[p]}
              </option>
            ))}
          </select>
          <label htmlFor="attachment-reason">{c.reason}</label>
          <textarea
            id="attachment-reason"
            name="reason"
            rows={4}
            className={controlClass}
            required
            minLength={10}
            maxLength={500}
            defaultValue={draft?.reason ?? ""}
          />
          <label className="flex min-w-0 items-start gap-3">
            <input type="checkbox" name="reviewed" value="yes" required className="mt-1 shrink-0" />
            <span>{c.reviewed}</span>
          </label>
          <button type="submit" className={buttonClass("primary")}>
            {c.submit}
          </button>
        </form>
      ) : null}
    </section>
  );
}

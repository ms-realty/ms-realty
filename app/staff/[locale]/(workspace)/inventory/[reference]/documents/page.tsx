// O20/F15: evidence is accepted only for its named purpose and exact current version.
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import {
  documentClassifications,
  documentReviewTypes,
  isDocumentExposable,
} from "@/domain/document";
import { fileError, fileLabel, filesCopy } from "@/features/files/copy";
import { FileButton, FileCheck, FileEnvelope, FileField } from "@/features/files/forms";
import { requireStaffPage } from "@/server/auth/pages";
import { isFresh } from "@/server/auth/sessions";
import { documentsForListing } from "@/server/documents/commands";
import { isAppError } from "@/server/errors";
import { fileReceipt } from "@/server/files/receipts";
import { controlClass, labelClass, textareaClass } from "@/ui/field-class";
import { Notice } from "@/ui/notice";

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; reference: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { locale, reference } = await params;
  const session = await requireStaffPage(locale);
  const path = `/${locale}/inventory/${reference}/documents`;
  if (!isFresh(session)) redirect(`/${locale}/access/reauth?returnTo=${encodeURIComponent(path)}`);
  const data = await documentsForListing(getDb(), session, reference).catch((error) => {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  });
  const copy = filesCopy(locale);
  const query = await searchParams;
  const saved = await fileReceipt(getDb(), session, query.saved);
  const action = `${path}/submit`;
  const chooser = (
    <label className="grid gap-2">
      <span className={labelClass}>{copy.file}</span>
      <input
        type="file"
        name="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        required
      />
    </label>
  );
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-gutter py-8">
      <a href={`/${locale}/inventory/${reference}`} className="underline">
        {copy.back}
      </a>
      <h1 className="text-title font-semibold">
        {copy.documents} · <bdi>{data.listing.reference}</bdi>
      </h1>
      <p>{copy.documentLimit}</p>
      {saved ? (
        <Notice tone="success">
          {copy.saved} <bdi>{saved}</bdi>
        </Notice>
      ) : null}
      {query.error ? <Notice tone="error">{fileError(copy, query.error)}</Notice> : null}
      {data.mayCreate ? (
        <form
          action={action}
          method="post"
          encType="multipart/form-data"
          className="grid gap-4 rounded-panel border border-divider bg-surface p-5"
        >
          <h2 className="text-section font-semibold">{copy.upload}</h2>
          <FileEnvelope intent="upload" version={0} />
          {chooser}
          <label className="grid gap-2">
            <span className={labelClass}>{copy.purpose}</span>
            <select className={controlClass} name="purpose">
              {["seller_authority", "seller_instruction", "property_evidence", "other"].map(
                (purpose) => (
                  <option key={purpose} value={purpose}>
                    {fileLabel(copy, purpose)}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="grid gap-2">
            <span className={labelClass}>{copy.classification}</span>
            <select className={controlClass} name="classification" defaultValue="property">
              {documentClassifications.map((value) => (
                <option key={value} value={value}>
                  {fileLabel(copy, value)}
                </option>
              ))}
            </select>
          </label>
          <FileButton>{copy.submit}</FileButton>
        </form>
      ) : (
        <p>{copy.denied}</p>
      )}
      <a href={path} className="underline">
        {copy.refresh}
      </a>
      {data.documents.length === 0 ? <p>{copy.empty}</p> : null}
      {data.documents.map(({ document, file, upload, mayReview }) => (
        <section
          key={document.id}
          className="space-y-4 rounded-panel border border-divider bg-surface p-5"
        >
          <h2 className="text-section font-semibold">
            <bdi>{document.reference}</bdi> · {file.fileName}
          </h2>
          <dl className="grid gap-2 sm:grid-cols-2">
            {[
              [copy.purpose, fileLabel(copy, document.purpose)],
              [copy.version, String(file.versionNumber)],
              [copy.scan, fileLabel(copy, file.scan)],
              [copy.state, fileLabel(copy, file.state)],
              [
                copy.audience,
                document.audience === "internal"
                  ? copy.private
                  : fileLabel(copy, document.audience),
              ],
              [copy.review, file.reviewType ? fileLabel(copy, file.reviewType) : copy.pending],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="font-semibold">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {document.expiresAt ? (
            <p>
              {copy.expiry}:{" "}
              <time dateTime={document.expiresAt.toISOString()}>
                {document.expiresAt.toISOString().slice(0, 10)}
              </time>
            </p>
          ) : null}
          {isDocumentExposable(file.state, file.scan) ? (
            <a className="underline" href={`/api/files/private/document/${file.id}`}>
              {copy.original}
            </a>
          ) : null}
          {upload && !upload.completedAt && upload.expiresAt > new Date() ? (
            <form
              action={action}
              method="post"
              encType="multipart/form-data"
              className="grid gap-3"
            >
              <FileEnvelope intent="upload" version={file.version} />
              <input type="hidden" name="uploadId" value={upload.id} />
              {chooser}
              <FileButton>{copy.resume}</FileButton>
            </form>
          ) : null}
          {file.sealedKey && file.scan === "failed" ? (
            <form action={action} method="post">
              <FileEnvelope intent="scan" version={file.version} id={file.id} />
              <FileButton>{copy.retry}</FileButton>
            </form>
          ) : null}
          {mayReview && isDocumentExposable(file.state, file.scan) ? (
            <form action={action} method="post" className="grid gap-4 border-t border-divider pt-4">
              <FileEnvelope intent="review" version={file.version} id={file.id} />
              <label className="grid gap-2">
                <span className={labelClass}>{copy.decision}</span>
                <select
                  name="reviewType"
                  className={controlClass}
                  defaultValue={file.reviewType ?? "accepted_for_purpose"}
                >
                  {documentReviewTypes.map((value) => (
                    <option key={value} value={value}>
                      {fileLabel(copy, value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2">
                <span className={labelClass}>{copy.note}</span>
                <textarea
                  className={textareaClass}
                  name="note"
                  defaultValue={file.reviewNote ?? ""}
                  minLength={5}
                  maxLength={4000}
                  required
                />
              </label>
              <FileField
                name="expiresAt"
                label={copy.expiry}
                type="date"
                value={document.expiresAt?.toISOString().slice(0, 10) ?? ""}
                required={false}
              />
              <FileCheck name="confirmed">{copy.documentCheck}</FileCheck>
              <FileButton>{copy.reviewAction}</FileButton>
            </form>
          ) : null}
          <details>
            <summary className="cursor-pointer underline">{copy.replace}</summary>
            <form
              action={action}
              method="post"
              encType="multipart/form-data"
              className="mt-4 grid gap-3"
            >
              <FileEnvelope intent="upload" version={document.version} />
              <input type="hidden" name="documentId" value={document.id} />
              <input type="hidden" name="purpose" value={document.purpose} />
              <input type="hidden" name="classification" value={document.classification} />
              {chooser}
              <FileButton>{copy.replace}</FileButton>
            </form>
          </details>
        </section>
      ))}
    </div>
  );
}

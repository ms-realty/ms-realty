import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { PublicLocale } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";
import { fileServices } from "@/server/files/config";
import { maxInquiryPhotos, ownerInquiryPhotos } from "@/server/inquiries/attachments";
import { buttonClass } from "@/ui/button-class";
import { controlClass, labelClass } from "@/ui/field-class";
import { Notice } from "@/ui/notice";
import { brandPhone } from "../shell/agency";
import { discoveryCopy } from "./copy";
import { inquiryPhotoCopy } from "./inquiry-photo-copy";

/** P19: real native upload after durable receipt authorization; optional failure is separate. */
export async function InquiryPhotos({
  locale,
  receiptId,
  receiptSession,
  requestedOperation,
  error,
}: {
  locale: PublicLocale;
  receiptId: string;
  receiptSession: string | null;
  requestedOperation?: unknown;
  error?: unknown;
}) {
  const copy = discoveryCopy(locale),
    labels = inquiryPhotoCopy(locale);
  let result: Awaited<ReturnType<typeof ownerInquiryPhotos>> | null = null;
  let configured = false;
  try {
    result = await ownerInquiryPhotos(getDb(), { submissionKey: receiptId, receiptSession });
    fileServices();
    configured = true;
  } catch {
    /* Keep the already accepted inquiry and its manual path useful. */
  }
  const requested = z.uuid().safeParse(requestedOperation).success
    ? String(requestedOperation)
    : null;
  const requestedPhoto = result?.photos.find((photo) => photo.operationId === requested);
  const incomplete = result?.photos.find((photo) => photo.stage === "upload_incomplete");
  // A lost response must not strand a durable reservation or mint a replacement on reload.
  const operationId =
    requestedPhoto?.operationId ?? incomplete?.operationId ?? requested ?? randomUUID();
  const current = result?.photos.find((photo) => photo.operationId === operationId);
  const retry = current?.stage === "upload_incomplete";
  const canAttach =
    configured && result?.canUpload && (retry || result.photos.length < maxInquiryPhotos);
  const failed =
    typeof error === "string" &&
    [
      "validation_failed",
      "rate_limited",
      "idempotency_key_reused",
      "unavailable",
      "transition_denied",
      "version_conflict",
    ].includes(error);
  const fieldId = `inquiry-photo-${operationId}`;
  return (
    <section
      className="min-w-0 max-w-reading space-y-4 rounded-panel border border-divider bg-surface p-5"
      aria-labelledby="inquiry-photo-title"
    >
      <h2 id="inquiry-photo-title" className="text-heading font-semibold">
        {labels.title}
      </h2>
      <p>{labels.lead}</p>
      <p className="text-compact text-text-muted">{labels.limits}</p>
      {failed ? <Notice tone="warning" title={labels.failed} /> : null}
      {result?.photos.length ? (
        <ol className="space-y-3">
          {result.photos.map((photo, index) => (
            <li key={photo.id} className="rounded-control bg-subtle p-3">
              <p className="text-compact font-semibold">
                {copy.mediaPhoto} <bdi>{index + 1}</bdi> ·{" "}
                <bdi>{formatNumber(locale, photo.byteSize)} B</bdi>
              </p>
              <p className="text-compact">{labels[photo.stage]}</p>
              {photo.stage === "upload_incomplete" && configured && result.canUpload ? (
                <a
                  className="inline-flex min-h-control items-center underline"
                  href={`/${locale}/requests/${encodeURIComponent(receiptId)}?${new URLSearchParams({ photoOperation: photo.operationId })}#inquiry-photo-title`}
                  data-print-hide
                >
                  {labels.retry} · {copy.mediaPhoto} {index + 1}
                </a>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {canAttach && (!current || retry) ? (
        <form
          action={`/api/inquiries/${encodeURIComponent(receiptId)}/photos?locale=${locale}`}
          method="post"
          encType="multipart/form-data"
          className="space-y-4"
          data-print-hide=""
        >
          <input type="hidden" name="operationId" value={operationId} />
          <label htmlFor={fieldId} className={labelClass}>
            {retry ? labels.retry : labels.title}
          </label>
          <input
            id={fieldId}
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp"
            required
            className={controlClass}
          />
          <label className="flex min-h-11 items-start gap-3 text-compact">
            <input
              type="checkbox"
              name="sharedForInquiry"
              value="1"
              required
              className="mt-1 size-5 shrink-0 accent-action"
            />
            <span>{labels.permission}</span>
          </label>
          <button type="submit" className={buttonClass("secondary")}>
            {retry ? labels.retry : labels.attach}
          </button>
        </form>
      ) : canAttach ? (
        <a
          className={buttonClass("secondary")}
          href={`/${locale}/requests/${encodeURIComponent(receiptId)}`}
        >
          {labels.another}
        </a>
      ) : (
        <p className="text-compact">
          {configured && result && result.photos.length >= maxInquiryPhotos
            ? labels.limitReached
            : labels.unavailable}
        </p>
      )}
      <a
        href={`tel:${brandPhone.e164}`}
        className="inline-flex min-h-11 items-center gap-2 text-compact font-semibold underline"
      >
        {copy.callAgency} <bdi>{brandPhone.display}</bdi>
      </a>
    </section>
  );
}

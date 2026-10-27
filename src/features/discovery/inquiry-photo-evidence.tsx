import { getDb } from "@/db/client";
import type { PublicLocale } from "@/i18n/config";
import type { Session } from "@/server/auth/sessions";
import { staffInquiryPhotos } from "@/server/inquiries/attachments";
import { buttonClass } from "@/ui/button-class";
import { discoveryCopy, inquiryPhotosCopy } from "./copy";

/** O02: staff can assess a receipt's real private evidence without creating a Property. */
export async function InquiryPhotoEvidence({
  locale,
  session,
  inquiryId,
}: {
  locale: PublicLocale;
  session: Session;
  inquiryId: string;
}) {
  const photos = await staffInquiryPhotos(getDb(), session, inquiryId);
  if (!photos.length) return null;
  const copy = discoveryCopy(locale),
    labels = inquiryPhotosCopy(locale);
  return (
    <section
      className="min-w-0 space-y-3 rounded-panel border border-divider bg-surface p-5"
      aria-labelledby="inquiry-photo-evidence-heading"
    >
      <h2 id="inquiry-photo-evidence-heading" className="text-heading font-semibold">
        {labels.evidenceTitle}
      </h2>
      <p className="text-compact text-text-muted">{labels.evidenceLead}</p>
      <ol className="space-y-3">
        {photos.map((photo, index) => (
          <li
            key={photo.id}
            className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-divider pt-3"
          >
            <div className="min-w-0">
              <p className="font-semibold">
                {copy.mediaPhoto} {index + 1}
              </p>
              <p className="text-compact text-text-muted">{labels[photo.stage]}</p>
            </div>
            {photo.stage === "available_for_review" ? (
              <a
                className={buttonClass("secondary")}
                href={`/api/inquiry-attachments/${photo.id}`}
                data-print-hide
              >
                {copy.mediaPhoto} {index + 1}
              </a>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

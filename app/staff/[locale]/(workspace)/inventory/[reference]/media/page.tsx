// O14/F23/AT28/AT42: originals, scan, processing, rights and publication stay separate.
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { mediaModifications } from "@/domain/media";
import { fileError, fileLabel, filesCopy } from "@/features/files/copy";
import { FileButton, FileCheck, FileEnvelope, FileField } from "@/features/files/forms";
import { requireStaffPage } from "@/server/auth/pages";
import { isAppError } from "@/server/errors";
import { fileReceipt } from "@/server/files/receipts";
import { mediaForListing } from "@/server/media/commands";
import { controlClass } from "@/ui/field-class";
import { Notice } from "@/ui/notice";

export default async function MediaPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; reference: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { locale, reference } = await params;
  const session = await requireStaffPage(locale);
  const { listing, assets } = await mediaForListing(getDb(), session, reference).catch((error) => {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  });
  const copy = filesCopy(locale);
  const query = await searchParams;
  const saved = await fileReceipt(getDb(), session, query.saved);
  const path = `/${locale}/inventory/${reference}/media`;
  const action = `${path}/submit`;
  const fileChooser = (
    <label className="grid gap-1">
      {copy.file}
      <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required />
    </label>
  );
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-gutter py-8">
      <a href={`/${locale}/inventory/${reference}`} className="underline">
        {copy.back}
      </a>
      <h1 className="text-title font-semibold">
        {copy.media} · <bdi>{listing.reference}</bdi>
      </h1>
      <p>{copy.imageLimit}</p>
      <p>{copy.permission}</p>
      {saved ? (
        <Notice tone="success">
          {copy.saved} <bdi>{saved}</bdi>
        </Notice>
      ) : null}
      {query.error ? <Notice tone="error">{fileError(copy, query.error)}</Notice> : null}
      <form
        action={action}
        method="post"
        encType="multipart/form-data"
        className="grid gap-4 rounded-panel border border-divider bg-surface p-5"
      >
        <h2 className="text-section font-semibold">{copy.upload}</h2>
        <FileEnvelope intent="upload" version={listing.version} />
        {fileChooser}
        <label className="grid gap-1">
          {copy.kind}
          <select className={controlClass} name="kind">
            {["photo", "floor_plan", "render"].map((kind) => (
              <option key={kind} value={kind}>
                {fileLabel(copy, kind)}
              </option>
            ))}
          </select>
        </label>
        <FileButton>{copy.submit}</FileButton>
      </form>
      <a href={path} className="underline">
        {copy.refresh}
      </a>
      {assets.length === 0 ? <p>{copy.empty}</p> : null}
      {assets.map(({ asset, relation, upload }, index) => (
        <section
          key={relation.id}
          className="space-y-4 rounded-panel border border-divider bg-surface p-5"
        >
          <h2 className="text-section font-semibold">
            {index + 1}. {asset.caption ?? fileLabel(copy, asset.kind)}
          </h2>
          {relation.hidden ? <p>{copy.hidden}</p> : null}
          <dl className="grid gap-2 sm:grid-cols-2">
            {[
              [copy.scan, asset.scan],
              [copy.processing, asset.processing],
              [copy.review, asset.review],
              [copy.rights, asset.rights],
              [copy.audience, asset.audience],
            ].map(([label, state]) => (
              <div key={label}>
                <dt className="font-semibold">{label}</dt>
                <dd>{fileLabel(copy, state ?? "unknown")}</dd>
              </div>
            ))}
          </dl>
          {asset.scan === "clean" && asset.processing === "ready" ? (
            <>
              {/* biome-ignore lint/performance/noImgElement: Authenticated previews must bypass shared image optimizers. */}
              <img
                src={`/api/files/private/media/${asset.id}?preview=1`}
                alt={asset.altText ?? copy.preview}
                className="max-h-96 max-w-full object-contain"
              />
              <a className="underline" href={`/api/files/private/media/${asset.id}`}>
                {copy.original}
              </a>
            </>
          ) : null}
          {upload && !upload.completedAt ? (
            upload.expiresAt > new Date() ? (
              <form
                action={action}
                method="post"
                encType="multipart/form-data"
                className="grid gap-3"
              >
                <FileEnvelope intent="upload" version={asset.version} />
                <input type="hidden" name="uploadId" value={upload.id} />
                {fileChooser}
                <FileButton>{copy.resume}</FileButton>
              </form>
            ) : (
              <p>{copy.expired}</p>
            )
          ) : null}
          {asset.sealedKey && asset.scan === "failed" ? (
            <form action={action} method="post">
              <FileEnvelope intent="scan" version={asset.version} id={asset.id} />
              <FileButton>{copy.retry}</FileButton>
            </form>
          ) : null}
          {asset.scan === "clean" && asset.processing === "ready" ? (
            <form action={action} method="post" className="grid gap-4 border-t border-divider pt-4">
              <FileEnvelope intent="review" version={asset.version} id={asset.id} />
              <FileField
                name="rightsHolder"
                label={copy.rightsHolder}
                value={asset.rightsHolder ?? ""}
              />
              <FileField
                name="rightsReference"
                label={copy.rightsReference}
                value={asset.rightsReference ?? ""}
              />
              <FileField
                name="caption"
                label={copy.caption}
                value={asset.caption ?? ""}
                required={false}
              />
              <FileField name="altText" label={copy.altText} value={asset.altText ?? ""} />
              <label className="grid gap-1">
                {copy.modification}
                <select
                  name="modification"
                  defaultValue={asset.modification}
                  className={controlClass}
                >
                  {mediaModifications.map((value) => (
                    <option key={value} value={value}>
                      {fileLabel(copy, value)}
                    </option>
                  ))}
                </select>
              </label>
              <FileField
                name="modificationDisclosure"
                label={copy.disclosure}
                value={asset.modificationDisclosure ?? ""}
                required={false}
              />
              <FileCheck name="privacyReviewed">{copy.privacy}</FileCheck>
              <FileCheck name="rightsConfirmed">{copy.rightsCheck}</FileCheck>
              <label className="grid gap-1">
                {copy.decision}
                <select name="decision" className={controlClass}>
                  <option value="approve">{copy.approve}</option>
                  <option value="reject">{copy.reject}</option>
                </select>
              </label>
              <FileButton>{copy.reviewAction}</FileButton>
            </form>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {index > 0 ? (
              <form action={action} method="post">
                <FileEnvelope intent="place" version={listing.version} />
                <input type="hidden" name="relationId" value={relation.id} />
                <input type="hidden" name="before" value={assets[index - 1]?.relation.id} />
                <FileButton>{copy.up}</FileButton>
              </form>
            ) : null}
            {index + 1 < assets.length ? (
              <form action={action} method="post">
                <FileEnvelope intent="place" version={listing.version} />
                <input type="hidden" name="relationId" value={relation.id} />
                <input type="hidden" name="after" value={assets[index + 1]?.relation.id} />
                <FileButton>{copy.down}</FileButton>
              </form>
            ) : null}
            <form action={action} method="post">
              <FileEnvelope intent="place" version={listing.version} />
              <input type="hidden" name="relationId" value={relation.id} />
              <input type="hidden" name="hidden" value={String(!relation.hidden)} />
              <FileButton>{relation.hidden ? copy.show : copy.hide}</FileButton>
            </form>
          </div>
        </section>
      ))}
    </div>
  );
}

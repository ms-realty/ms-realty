// O13/O14/F23/AT28/AT42: one selected photo, a staged order change that writes nothing until Save,
// and originals, scan, processing, rights and publication kept separate. Figma O13 11:5356,
// O13ORDER 46:5049 / 46:5107, O13ORDERSAVED 46:5165 / 46:5184.
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDb } from "@/db/client";
import { mediaModifications, moveRelation } from "@/domain/media";
import { fileError, fileLabel, filesCopy, fillCopy } from "@/features/files/copy";
import { FileButton, FileCheck, FileEnvelope, FileField } from "@/features/files/forms";
import { FocusedState } from "@/features/inventory/focused-state";
import { requireStaffPage } from "@/server/auth/pages";
import { isAppError } from "@/server/errors";
import { mediaForListing, mediaReceipt } from "@/server/media/commands";
import { buttonClass } from "@/ui/button-class";
import { cx } from "@/ui/cx";
import { controlClass, labelClass } from "@/ui/field-class";
import { CheckIcon, DocumentIcon, NoPhotoIcon } from "@/ui/icons";
import { Notice } from "@/ui/notice";

type MediaRow = Awaited<ReturnType<typeof mediaForListing>>["assets"][number];

const previewable = ({ asset }: MediaRow) => asset.scan === "clean" && asset.processing === "ready";

function Preview({ row, label, className }: { row: MediaRow; label: string; className: string }) {
  return previewable(row) ? (
    // biome-ignore lint/performance/noImgElement: Authenticated previews must bypass shared image optimizers.
    <img
      src={`/api/files/private/media/${row.asset.id}?preview=1`}
      alt={row.asset.altText ?? label}
      className={cx("w-full rounded-panel object-cover", className)}
    />
  ) : (
    <div
      className={cx(
        "flex w-full items-center justify-center rounded-panel border border-divider bg-subtle text-text-muted",
        className,
      )}
    >
      <NoPhotoIcon className="size-8" />
    </div>
  );
}

/** Copy with the listing reference isolated for bidirectional text. */
function withReference(template: string, values: Record<string, string | number>, ref: ReactNode) {
  return template
    .split("{reference}")
    .flatMap((part, index) => (index === 0 ? [part] : [ref, part]))
    .map((part) => (typeof part === "string" ? fillCopy(part, values) : part));
}

export default async function MediaPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; reference: string }>;
  searchParams: Promise<{ error?: string; saved?: string; photo?: string; move?: string }>;
}) {
  const { locale, reference } = await params;
  const session = await requireStaffPage(locale);
  const { listing, assets } = await mediaForListing(getDb(), session, reference).catch((error) => {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  });
  const copy = filesCopy(locale);
  const query = await searchParams;
  // Readback: a receipt counts only for this listing, and it names its own target photo.
  const receipt = await mediaReceipt(getDb(), session, listing.id, query.saved, query.photo);
  const path = `/${locale}/inventory/${reference}/media`;
  const action = `${path}/submit`;
  const ref = <bdi>{listing.reference}</bdi>;
  const total = assets.length;
  const target = receipt ? receipt.relationId : query.photo;
  const selectedIndex = Math.max(
    0,
    assets.findIndex(({ relation, asset }) => relation.id === target || asset.id === target),
  );
  const selected = assets[selectedIndex];
  const photoHref = (id: string) => `${path}?photo=${id}`;
  const order = assets.map(({ relation }) => relation.id);
  const numberOf = new Map(order.map((id, index) => [id, index + 1]));

  // O13ORDERSAVED: the order this staff member saved on this listing, as it was recorded.
  if (receipt?.move) {
    const back = receipt.relationId ? photoHref(receipt.relationId) : path;
    const recorded = receipt.order;
    return (
      <FocusedState closeHref={back} closeLabel={copy.close}>
        <h1 className="pe-12 text-heading font-semibold sm:text-title">{copy.orderSaved}</h1>
        <CheckIcon className="size-8 text-success" />
        <p role="status">
          {recorded
            ? withReference(
                copy.orderSavedDetail,
                {
                  order: recorded.after.map((id) => recorded.before.indexOf(id) + 1).join(", "),
                },
                ref,
              )
            : withReference(copy.orderSavedPlain, {}, ref)}
        </p>
        {recorded && recorded.after.join() !== order.join() ? (
          <p>{copy.orderChangedSince}</p>
        ) : null}
        <a href={back} className={buttonClass("primary")}>
          {copy.toTask}
        </a>
      </FocusedState>
    );
  }

  // O13ORDER: the move is staged in the address only; Save sends the one version-checked move.
  const direction = query.move === "up" ? -1 : query.move === "down" ? 1 : 0;
  const neighbour = direction && selected ? assets[selectedIndex + direction] : undefined;
  if (selected && neighbour) {
    const proposed = moveRelation(
      assets.map(({ relation }) => ({ relationId: relation.id, position: relation.position })),
      selected.relation.id,
      direction < 0 ? { before: neighbour.relation.id } : { after: neighbour.relation.id },
    ).map(({ relationId }) => relationId);
    // The next gallery's cover is the first photo that is not hidden, in each order.
    const cover = (ids: string[]) =>
      ids
        .map((id) => assets.find(({ relation }) => relation.id === id))
        .find((row) => row && !row.relation.hidden);
    const before = cover(order);
    const after = cover(proposed);
    const cancel = photoHref(selected.relation.id);
    return (
      <FocusedState closeHref={cancel} closeLabel={copy.close}>
        <h1 className="pe-12 text-heading font-semibold sm:text-title">{copy.reviewOrder}</h1>
        <p>
          {withReference(
            copy.reviewLead,
            {
              n: selectedIndex + 1,
              direction: direction < 0 ? copy.directionUp : copy.directionDown,
            },
            ref,
          )}
        </p>
        {before && after && before !== after ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {[
              [copy.coverBefore, before],
              [copy.coverAfter, after],
            ].map(([label, row]) => (
              <figure key={label as string} className="grid gap-3">
                <figcaption className="text-dense font-semibold">
                  {fillCopy(label as string, {
                    n: numberOf.get((row as MediaRow).relation.id) ?? "",
                  })}
                </figcaption>
                <Preview row={row as MediaRow} label={copy.preview} className="h-28 sm:h-50" />
              </figure>
            ))}
          </div>
        ) : null}
        <dl className="divide-y divide-divider border-b border-divider">
          {[
            [copy.before, order.map((id) => numberOf.get(id)).join(", ")],
            [copy.proposal, proposed.map((id) => numberOf.get(id)).join(", ")],
            [copy.unchanged, copy.unchangedDetail],
          ].map(([term, detail]) => (
            <div key={term} className="flex items-start gap-3 p-3 text-dense">
              <DocumentIcon className="size-5" />
              <div className="grid gap-1">
                <dt className="font-semibold">{term}</dt>
                <dd className="text-text-muted">{detail}</dd>
              </div>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-3">
          <form action={action} method="post">
            <FileEnvelope intent="place" version={listing.version} />
            <input type="hidden" name="relationId" value={selected.relation.id} />
            <input
              type="hidden"
              name={direction < 0 ? "before" : "after"}
              value={neighbour.relation.id}
            />
            <button type="submit" className={buttonClass("primary")}>
              {copy.saveOrder}
            </button>
          </form>
          <a href={cancel} className={buttonClass("tertiary")}>
            {copy.cancel}
          </a>
        </div>
      </FocusedState>
    );
  }

  const fileChooser = (
    <label className="grid gap-2">
      <span className={labelClass}>{copy.file}</span>
      <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required />
    </label>
  );
  return (
    <div className="space-y-8 px-gutter py-8 lg:px-8">
      <a href={`/${locale}/inventory/${reference}`} className="underline">
        {copy.back}
      </a>
      <div className="space-y-2">
        <h1 className="text-title font-semibold">{copy.orderTitle}</h1>
        <p className="text-text-muted">{copy.orderLead}</p>
      </div>
      {receipt ? (
        <Notice tone="success" role="status">
          {copy.saved} <bdi>{receipt.id}</bdi>
        </Notice>
      ) : null}
      {query.error ? (
        <Notice tone="error" role="alert">
          {fileError(copy, query.error)}
        </Notice>
      ) : null}
      {selected ? (
        <section aria-labelledby="o13-selected" className="space-y-6">
          <h2 id="o13-selected" className="sr-only">
            {fillCopy(copy.photoMeta, {
              reference: listing.reference,
              n: selectedIndex + 1,
              total,
            })}
          </h2>
          <Preview row={selected} label={copy.preview} className="h-64 sm:h-[35rem]" />
          <ol className="flex gap-3 overflow-x-auto pb-1">
            {assets.map((row, index) => (
              <li key={row.relation.id} className="shrink-0">
                <a
                  href={photoHref(row.relation.id)}
                  aria-current={index === selectedIndex ? "true" : undefined}
                  aria-label={fillCopy(copy.showPhoto, { n: index + 1 })}
                  className={cx(
                    "block h-30 w-[13.8rem] overflow-hidden rounded-panel",
                    index === selectedIndex ? "border-3 border-brand" : "border border-divider",
                    row.relation.hidden && "opacity-60",
                  )}
                >
                  <Preview row={row} label="" className="h-full rounded-none" />
                </a>
              </li>
            ))}
          </ol>
          <p className="text-dense text-text-muted">
            {withReference(copy.photoMeta, { n: selectedIndex + 1, total }, ref)} ·{" "}
            {selected.asset.caption ?? fileLabel(copy, selected.asset.kind)}
            {selected.relation.hidden ? ` · ${copy.hidden}` : ""}
          </p>
          <a href="#o13-all" className={buttonClass("secondary")}>
            {fillCopy(copy.allPhotos, { total })}
          </a>
          <div className="flex flex-wrap gap-3">
            {selectedIndex > 0 ? (
              <a
                href={`${photoHref(selected.relation.id)}&move=up`}
                className={buttonClass("secondary")}
              >
                {copy.moveUp}
              </a>
            ) : (
              <button type="button" disabled className={buttonClass("secondary")}>
                {copy.firstAlready}
              </button>
            )}
            {selectedIndex + 1 < total ? (
              <a
                href={`${photoHref(selected.relation.id)}&move=down`}
                className={buttonClass("secondary")}
              >
                {copy.moveDown}
              </a>
            ) : (
              <button type="button" disabled className={buttonClass("secondary")}>
                {copy.lastAlready}
              </button>
            )}
            <form action={action} method="post">
              <FileEnvelope intent="place" version={listing.version} />
              <input type="hidden" name="relationId" value={selected.relation.id} />
              <input type="hidden" name="hidden" value={String(!selected.relation.hidden)} />
              <FileButton>{selected.relation.hidden ? copy.show : copy.hide}</FileButton>
            </form>
          </div>
          <PhotoChecks row={selected} copy={copy} action={action} fileChooser={fileChooser} />
        </section>
      ) : (
        <p>{copy.empty}</p>
      )}
      <p className="text-dense text-text-muted">{copy.permission}</p>
      <form
        action={action}
        method="post"
        encType="multipart/form-data"
        className="grid max-w-3xl gap-4 rounded-panel border border-divider bg-surface p-5"
      >
        <h2 className="text-section font-semibold">{copy.upload}</h2>
        <p className="text-dense text-text-muted">{copy.imageLimit}</p>
        <FileEnvelope intent="upload" version={listing.version} />
        {fileChooser}
        <label className="grid gap-2">
          <span className={labelClass}>{copy.kind}</span>
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
      {total ? (
        <section id="o13-all" aria-labelledby="o13-all-heading" className="space-y-3">
          <h2 id="o13-all-heading" className="text-section font-semibold">
            {fillCopy(copy.allPhotos, { total })}
          </h2>
          <ol className="divide-y divide-divider border-y border-divider">
            {assets.map((row, index) => (
              <li key={row.relation.id}>
                <a
                  href={photoHref(row.relation.id)}
                  aria-current={index === selectedIndex ? "true" : undefined}
                  className="flex flex-wrap gap-x-3 p-3 text-dense hover:bg-subtle"
                >
                  <span className="font-semibold">
                    {index + 1}. {row.asset.caption ?? fileLabel(copy, row.asset.kind)}
                  </span>
                  <span className="text-text-muted">
                    {copy.scan}: {fileLabel(copy, row.asset.scan)} · {copy.review}:{" "}
                    {fileLabel(copy, row.asset.review)}
                    {row.relation.hidden ? ` · ${copy.hidden}` : ""}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <a href={path} className="underline">
        {copy.refresh}
      </a>
    </div>
  );
}

function PhotoChecks({
  row: { asset, upload, relation },
  copy,
  action,
  fileChooser,
}: {
  row: MediaRow;
  copy: ReturnType<typeof filesCopy>;
  action: string;
  fileChooser: ReactNode;
}) {
  const ready = asset.scan === "clean" && asset.processing === "ready";
  return (
    <div className="space-y-4 rounded-panel border border-divider bg-surface p-5">
      <h2 className="text-section font-semibold">{copy.photoChecks}</h2>
      {ready ? null : <p className="text-text-muted">{copy.noPreview}</p>}
      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
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
      {ready ? (
        <a className="underline" href={`/api/files/private/media/${asset.id}`}>
          {copy.original}
        </a>
      ) : null}
      {upload && !upload.completedAt ? (
        upload.expiresAt > new Date() ? (
          <form action={action} method="post" encType="multipart/form-data" className="grid gap-3">
            <FileEnvelope intent="upload" version={asset.version} />
            <input type="hidden" name="uploadId" value={upload.id} />
            <input type="hidden" name="relationId" value={relation.id} />
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
          <input type="hidden" name="relationId" value={relation.id} />
          <FileButton>{copy.retry}</FileButton>
        </form>
      ) : null}
      {ready ? (
        <form action={action} method="post" className="grid gap-4 border-t border-divider pt-4">
          <FileEnvelope intent="review" version={asset.version} id={asset.id} />
          <input type="hidden" name="relationId" value={relation.id} />
          <div className="grid gap-4 lg:grid-cols-2">
            <FileField name="altText" label={copy.altText} value={asset.altText ?? ""} />
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
            <label className="grid gap-2">
              <span className={labelClass}>{copy.modification}</span>
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
          </div>
          <FileCheck name="privacyReviewed">{copy.privacy}</FileCheck>
          <FileCheck name="rightsConfirmed">{copy.rightsCheck}</FileCheck>
          <label className="grid max-w-md gap-2">
            <span className={labelClass}>{copy.decision}</span>
            <select name="decision" className={controlClass}>
              <option value="approve">{copy.approve}</option>
              <option value="reject">{copy.reject}</option>
            </select>
          </label>
          <FileButton>{copy.reviewAction}</FileButton>
        </form>
      ) : null}
    </div>
  );
}

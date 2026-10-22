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
import {
  MediaFilePicker,
  MediaGallery,
  MediaReviewGuard,
} from "@/features/inventory/media-workbench";
import { PrivateMediaPreview } from "@/features/inventory/thumbnail";
import { ListingIdentity, ListingNavigation } from "@/features/inventory/workspace";
import { workflowCopy } from "@/i18n/workflow-copy";
import { requireStaffPage } from "@/server/auth/pages";
import { isAppError } from "@/server/errors";
import { mediaForListing, mediaReceipt } from "@/server/media/commands";
import { buttonClass } from "@/ui/button-class";
import { cx } from "@/ui/cx";
import { controlClass, labelClass } from "@/ui/field-class";
import { NativeForm } from "@/ui/form/native-form";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  DocumentIcon,
  NoPhotoIcon,
  PlusIcon,
} from "@/ui/icons";
import { Notice } from "@/ui/notice";

type MediaRow = Awaited<ReturnType<typeof mediaForListing>>["assets"][number];

const previewable = ({ asset }: MediaRow) => asset.scan === "clean" && asset.processing === "ready";

function Preview({ row, label, className }: { row: MediaRow; label: string; className: string }) {
  return (
    <PrivateMediaPreview
      source={previewable(row) ? `/api/files/private/media/${row.asset.id}?preview=1` : undefined}
      alt={row.asset.altText || label}
      unavailable={label}
      className={className}
    />
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
  searchParams: Promise<{
    error?: string;
    saved?: string;
    photo?: string;
    move?: string;
    before?: string;
  }>;
}) {
  const { locale, reference } = await params;
  const session = await requireStaffPage(locale);
  const { listing, assets } = await mediaForListing(getDb(), session, reference).catch((error) => {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  });
  const copy = filesCopy(locale);
  const workspace = workflowCopy(locale, "listingWorkspace");
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
  const neighbour = query.before
    ? assets.find((row) => row.relation.id === query.before && row !== selected)
    : direction && selected
      ? assets[selectedIndex + direction]
      : undefined;
  const move = neighbour
    ? query.before || direction < 0
      ? { before: neighbour.relation.id }
      : { after: neighbour.relation.id }
    : undefined;
  if (selected && neighbour && move) {
    const proposed = moveRelation(
      assets.map(({ relation }) => ({ relationId: relation.id, position: relation.position })),
      selected.relation.id,
      move,
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
          {query.before
            ? withReference(copy.photoMeta, { n: selectedIndex + 1, total }, ref)
            : withReference(
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
          <NativeForm action={action} method="post">
            <FileEnvelope intent="place" version={listing.version} />
            <input type="hidden" name="relationId" value={selected.relation.id} />
            <input
              type="hidden"
              name={"before" in move ? "before" : "after"}
              value={neighbour.relation.id}
            />
            <button type="submit" className={buttonClass("primary")}>
              {copy.saveOrder}
            </button>
          </NativeForm>
          <a href={cancel} className={buttonClass("tertiary")}>
            {copy.cancel}
          </a>
        </div>
      </FocusedState>
    );
  }

  const fileChooser = (
    <MediaFilePicker label={copy.file} hint={copy.imageLimit} clear={workspace.clearFile} />
  );
  const cover = assets.find((row) => !row.relation.hidden);
  return (
    <div className="mx-auto flex max-w-[96rem] flex-col gap-5 px-gutter py-5 sm:px-gutter-wide sm:py-6">
      <ListingIdentity locale={locale} reference={listing.reference} />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-heading font-semibold sm:text-title">{copy.orderTitle}</h1>
          <p className="max-w-prose text-dense text-text-muted">{copy.permission}</p>
        </div>
        <a href="#media-upload" className={buttonClass("primary")}>
          <PlusIcon className="size-5" />
          {copy.upload}
        </a>
      </header>
      <ListingNavigation locale={locale} reference={listing.reference} current="media" />
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
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,1fr)] xl:gap-8">
        <section id="o13-all" aria-labelledby="o13-all-heading" className="min-w-0 space-y-4">
          <div className="space-y-2">
            <h2 id="o13-all-heading" className="text-section font-semibold">
              {fillCopy(copy.allPhotos, { total })}
            </h2>
            <p className="max-w-prose text-dense text-text-muted">{workspace.galleryHint}</p>
          </div>
          {total ? (
            <MediaGallery path={path} ids={order}>
              {assets.map((row, index) => (
                <li
                  key={row.relation.id}
                  data-photo={row.relation.id}
                  draggable
                  className="min-w-0 rounded-control data-[drop-target]:outline-3 data-[drop-target]:outline-action"
                >
                  <a
                    href={`${photoHref(row.relation.id)}#o13-selected`}
                    aria-current={index === selectedIndex ? "true" : undefined}
                    aria-label={fillCopy(copy.showPhoto, { n: index + 1 })}
                    className={cx(
                      "group block overflow-hidden rounded-control border bg-surface no-underline text-text transition-colors hover:border-action",
                      index === selectedIndex
                        ? "border-action ring-2 ring-action"
                        : "border-divider",
                    )}
                  >
                    <div className="relative aspect-4/3 overflow-hidden bg-subtle">
                      <Preview
                        row={row}
                        label={row.asset.caption ?? fileLabel(copy, row.asset.kind)}
                        className={cx(
                          "h-full rounded-none object-cover!",
                          row.relation.hidden && "opacity-50",
                        )}
                      />
                      <span className="absolute start-2 top-2 rounded-control bg-canvas px-2 py-1 text-caption font-semibold">
                        {index + 1}
                      </span>
                    </div>
                    <div className="grid gap-1 p-3 text-caption">
                      <span className="truncate font-semibold">
                        {row.asset.caption || fileLabel(copy, row.asset.kind)}
                      </span>
                      <span
                        className={cx(
                          "text-text-muted",
                          row === cover && "font-semibold text-action",
                        )}
                      >
                        {row === cover
                          ? workspace.cover
                          : row.relation.hidden
                            ? workspace.excluded
                            : workspace.included}
                      </span>
                      <span className="text-text-muted">
                        {fileLabel(
                          copy,
                          row.asset.review === "pending" ? row.asset.scan : row.asset.review,
                        )}
                      </span>
                    </div>
                  </a>
                </li>
              ))}
            </MediaGallery>
          ) : (
            <div className="space-y-3 rounded-panel bg-subtle p-6">
              <NoPhotoIcon className="size-8 text-text-muted" />
              <p>{copy.empty}</p>
              <a href="#media-upload" className="text-action underline">
                {copy.upload}
              </a>
            </div>
          )}
          <details
            id="media-upload"
            open
            className="group rounded-panel border border-divider bg-surface p-4 sm:p-5"
          >
            <summary className="min-h-control cursor-pointer text-section font-semibold">
              {copy.upload}
            </summary>
            <NativeForm
              action={action}
              method="post"
              encType="multipart/form-data"
              className="mt-4 grid gap-4"
            >
              <p className="text-dense text-text-muted">{workspace.uploadHint}</p>
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
              <p className="text-caption text-text-muted">{copy.imageLimit}</p>
              <FileButton>{copy.submit}</FileButton>
            </NativeForm>
          </details>
        </section>
        {selected ? (
          <section
            aria-labelledby="o13-selected"
            className="min-w-0 space-y-4 rounded-panel border border-divider bg-surface p-4 sm:p-5"
          >
            <h2 id="o13-selected" className="scroll-mt-6 text-section font-semibold">
              {withReference(copy.photoMeta, { n: selectedIndex + 1, total }, ref)}
            </h2>
            <Preview
              row={selected}
              label={copy.preview}
              className="aspect-4/3 max-h-96 bg-subtle"
            />
            <div className="flex flex-wrap items-center gap-2 text-dense">
              <span className="font-semibold">
                {selected === cover
                  ? workspace.cover
                  : selected.relation.hidden
                    ? workspace.excluded
                    : workspace.included}
              </span>
              <NativeForm action={action} method="post" className="ms-auto">
                <FileEnvelope intent="place" version={listing.version} />
                <input type="hidden" name="relationId" value={selected.relation.id} />
                <input type="hidden" name="hidden" value={String(!selected.relation.hidden)} />
                <button type="submit" className={buttonClass("tertiary", "px-3")}>
                  {selected.relation.hidden ? copy.show : copy.hide}
                </button>
              </NativeForm>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedIndex > 0 ? (
                <a
                  href={`${photoHref(selected.relation.id)}&move=up`}
                  className={buttonClass("secondary", "flex-1 px-3")}
                >
                  <ArrowUpIcon className="size-4" />
                  {copy.moveUp}
                </a>
              ) : (
                <button type="button" disabled className={buttonClass("secondary", "flex-1 px-3")}>
                  {copy.firstAlready}
                </button>
              )}
              {selectedIndex + 1 < total ? (
                <a
                  href={`${photoHref(selected.relation.id)}&move=down`}
                  className={buttonClass("secondary", "flex-1 px-3")}
                >
                  <ArrowDownIcon className="size-4" />
                  {copy.moveDown}
                </a>
              ) : (
                <button type="button" disabled className={buttonClass("secondary", "flex-1 px-3")}>
                  {copy.lastAlready}
                </button>
              )}
            </div>
            {total > 2 ? (
              <form method="get" action={path} className="grid gap-2 border-b border-divider pb-4">
                <input type="hidden" name="photo" value={selected.relation.id} />
                <label className={labelClass} htmlFor="media-position">
                  {workspace.position}
                </label>
                <div className="flex flex-wrap items-start gap-2">
                  <select
                    id="media-position"
                    name="before"
                    required
                    defaultValue=""
                    className={cx(controlClass, "min-w-0 flex-1 basis-40")}
                  >
                    <option value="">{workspace.choosePosition}</option>
                    {assets.map((row, index) =>
                      row === selected ? null : (
                        <option key={row.relation.id} value={row.relation.id}>
                          {index + 1}. {row.asset.caption || fileLabel(copy, row.asset.kind)}
                        </option>
                      ),
                    )}
                  </select>
                  <button type="submit" className={buttonClass("secondary", "px-3")}>
                    {copy.reviewOrder}
                  </button>
                </div>
              </form>
            ) : null}
            <PhotoChecks
              row={selected}
              copy={copy}
              workspace={workspace}
              action={action}
              fileChooser={fileChooser}
            />
          </section>
        ) : null}
      </div>
      <a href={path} className="self-start text-dense text-action underline">
        {copy.refresh}
      </a>
    </div>
  );
}

function PhotoChecks({
  row: { asset, upload, relation },
  copy,
  workspace,
  action,
  fileChooser,
}: {
  row: MediaRow;
  copy: ReturnType<typeof filesCopy>;
  workspace: ReturnType<typeof workflowCopy<"listingWorkspace">>;
  action: string;
  fileChooser: ReactNode;
}) {
  const ready = asset.scan === "clean" && asset.processing === "ready";
  return (
    <div className="space-y-4">
      {!ready ? <Notice tone="warning">{copy.noPreview}</Notice> : null}
      <dl className="grid gap-2 text-dense">
        {[
          [copy.review, asset.review],
          [copy.rights, asset.rights],
          [copy.audience, asset.audience],
        ].map(([label, state]) => (
          <div key={label} className="flex flex-wrap justify-between gap-x-3 gap-y-1">
            <dt className="text-text-muted">{label}</dt>
            <dd className="font-medium">{fileLabel(copy, state ?? "unknown")}</dd>
          </div>
        ))}
      </dl>
      <details className="border-b border-divider pb-3" open={!ready}>
        <summary className="min-h-control cursor-pointer text-dense font-semibold">
          {copy.photoChecks}
        </summary>
        <dl className="mt-2 divide-y divide-divider text-dense">
          {[
            [copy.scan, asset.scan],
            [copy.processing, asset.processing],
          ].map(([label, state]) => (
            <div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2">
              <dt className="text-text-muted">{label}</dt>
              <dd className="font-medium">{fileLabel(copy, state ?? "unknown")}</dd>
            </div>
          ))}
        </dl>
      </details>
      {ready ? (
        <a
          className="inline-flex min-h-control items-center text-dense text-action underline"
          href={`/api/files/private/media/${asset.id}`}
        >
          {copy.original}
        </a>
      ) : null}
      {upload && !upload.completedAt ? (
        upload.expiresAt > new Date() ? (
          <NativeForm
            action={action}
            method="post"
            encType="multipart/form-data"
            className="grid gap-3"
          >
            <FileEnvelope intent="upload" version={asset.version} />
            <input type="hidden" name="uploadId" value={upload.id} />
            <input type="hidden" name="relationId" value={relation.id} />
            {fileChooser}
            <FileButton>{copy.resume}</FileButton>
          </NativeForm>
        ) : (
          <p>{copy.expired}</p>
        )
      ) : null}
      {asset.sealedKey && asset.scan === "failed" ? (
        <NativeForm action={action} method="post">
          <FileEnvelope intent="scan" version={asset.version} id={asset.id} />
          <input type="hidden" name="relationId" value={relation.id} />
          <FileButton>{copy.retry}</FileButton>
        </NativeForm>
      ) : null}
      {ready ? (
        <MediaReviewGuard
          key={`${asset.id}:${asset.version}`}
          copy={{
            title: workspace.unsavedTitle,
            body: workspace.unsavedBody,
            stay: workspace.stay,
            discard: workspace.discard,
          }}
        >
          <NativeForm
            action={action}
            method="post"
            className="grid gap-5 border-t border-divider pt-5"
          >
            <FileEnvelope intent="review" version={asset.version} id={asset.id} />
            <input type="hidden" name="relationId" value={relation.id} />
            <fieldset className="grid gap-4">
              <legend className="mb-3 text-section font-semibold">{workspace.imageDetails}</legend>
              <FileField
                name="caption"
                label={copy.caption}
                value={asset.caption ?? ""}
                required={false}
              />
              <FileField name="altText" label={copy.altText} value={asset.altText ?? ""} />
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
            </fieldset>
            <fieldset className="grid gap-4 border-t border-divider pt-4">
              <legend className="pe-3 text-section font-semibold">{workspace.rightsReview}</legend>
              <p className="text-dense text-text-muted">{workspace.reviewHint}</p>
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
              <FileCheck name="privacyReviewed">{copy.privacy}</FileCheck>
              <FileCheck name="rightsConfirmed">{copy.rightsCheck}</FileCheck>
              <label className="grid gap-2">
                <span className={labelClass}>{copy.decision}</span>
                <select name="decision" required defaultValue="" className={controlClass}>
                  <option value="">{workspace.chooseDecision}</option>
                  <option value="approve">{copy.approve}</option>
                  <option value="reject">{copy.reject}</option>
                </select>
              </label>
            </fieldset>
            <FileButton>{copy.reviewAction}</FileButton>
          </NativeForm>
        </MediaReviewGuard>
      ) : null}
    </div>
  );
}

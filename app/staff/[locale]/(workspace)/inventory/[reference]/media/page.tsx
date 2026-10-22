// O13/O14/F23/AT28/AT42: one selected photo, a staged order change that writes nothing until Save,
// and originals, scan, processing, rights and publication kept separate. Figma O13 11:5356,
// O13ORDER 46:5049 / 46:5107, O13ORDERSAVED 46:5165 / 46:5184.

import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDb } from "@/db/client";
import { mediaModifications, moveRelation } from "@/domain/media";
import { fileError, fileLabel, filesCopy, fillCopy } from "@/features/files/copy";
import { FileButton, FileCheck, FileEnvelope, FileField } from "@/features/files/forms";
import { inventoryCopy } from "@/features/inventory/copy";
import { FocusedState } from "@/features/inventory/focused-state";
import { LeaveControl } from "@/features/inventory/leave-control";
import {
  MediaDetailsEditor,
  type MediaDetailsValues,
} from "@/features/inventory/media-details-editor";
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
  ChevronStartIcon,
  DocumentIcon,
  PlusIcon,
} from "@/ui/icons";
import { Notice } from "@/ui/notice";

import { savePhotoDetails } from "./actions";

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
    panel?: string;
    upload?: string;
    inline?: string;
  }>;
}) {
  const { locale, reference } = await params;
  const session = await requireStaffPage(locale);
  const { listing, assets, identity } = await mediaForListing(getDb(), session, reference).catch(
    (error) => {
      if (isAppError(error) && error.code === "not_found") notFound();
      throw error;
    },
  );
  const copy = filesCopy(locale);
  const workspace = workflowCopy(locale, "listingWorkspace");
  const query = await searchParams;
  // Readback: a receipt counts only for this listing, and it names its own target photo.
  const receipt = await mediaReceipt(getDb(), session, listing.id, query.saved, query.photo);
  const path = `/${locale}/inventory/${reference}/media`;
  const action = `${path}/submit`;
  const ref = <bdi>{listing.reference}</bdi>;
  const total = assets.length;
  const target =
    receipt?.move && query.inline === "1"
      ? query.photo
      : receipt
        ? receipt.relationId
        : query.photo;
  const selectedIndex = assets.findIndex(
    ({ relation, asset }) => relation.id === target || asset.id === target,
  );
  const selected = assets[selectedIndex];
  const photoHref = (id: string) => `${path}?photo=${id}`;
  const order = assets.map(({ relation }) => relation.id);
  const numberOf = new Map(order.map((id, index) => [id, index + 1]));

  // O13ORDERSAVED: the order this staff member saved on this listing, as it was recorded.
  if (receipt?.move && query.inline !== "1") {
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
  const guard = {
    title: workspace.unsavedTitle,
    body: workspace.unsavedBody,
    stay: workspace.stay,
    discard: workspace.discard,
  };
  const review = Boolean(selected && query.panel === "review");
  const detailsFormId = selected && !review ? "photo-details-form" : undefined;
  const detailsHref = selected ? photoHref(selected.relation.id) : path;
  const galleryHref = selected ? `${path}#photo-${selected.relation.id}` : path;
  const tile = (row: MediaRow, index: number) => (
    <a
      id={`photo-${row.relation.id}`}
      href={photoHref(row.relation.id)}
      aria-label={fillCopy(copy.showPhoto, { n: index + 1 })}
      aria-describedby={`photo-${row.relation.id}-description`}
      className="group block overflow-hidden rounded-panel text-text no-underline"
    >
      <div className="relative aspect-4/3 overflow-hidden rounded-panel bg-subtle">
        <Preview
          row={row}
          label={workspace.noPhoto}
          className={cx("h-full rounded-none object-cover!", row.relation.hidden && "opacity-50")}
        />
        <div className="absolute inset-x-2 bottom-2 flex flex-wrap gap-1 text-caption font-semibold">
          {row.relation.hidden ? (
            <span className="rounded-control bg-canvas px-2 py-1">{workspace.excluded}</span>
          ) : null}
          {row.asset.detailsDraft || row.asset.review !== "approved" ? (
            <span className="rounded-control bg-canvas px-2 py-1">
              {row.asset.detailsDraft
                ? workspace.detailsPending
                : fileLabel(copy, row.asset.review)}
            </span>
          ) : null}
        </div>
      </div>
      <span
        id={`photo-${row.relation.id}-description`}
        title={row.asset.caption || row.asset.altText || fileLabel(copy, row.asset.kind)}
        dir="auto"
        className="block truncate px-1 py-2 text-dense text-text-muted group-hover:text-action"
      >
        {row.asset.caption || row.asset.altText || fileLabel(copy, row.asset.kind)}
      </span>
    </a>
  );
  return (
    <div className="mx-auto flex max-w-[96rem] flex-col group/media gap-5 px-gutter py-5 sm:px-gutter-wide sm:py-6">
      <ListingIdentity
        locale={locale}
        reference={listing.reference}
        title={identity?.title}
        meta={identity?.settlement}
      />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="o13-heading" className="text-heading font-semibold sm:text-title">
          {selected
            ? fillCopy(workspace.photoNumber, { n: selectedIndex + 1, total })
            : inventoryCopy(locale).o12.photos}
        </h1>
        {selected ? (
          <LeaveControl
            href={galleryHref}
            formId={detailsFormId}
            className={buttonClass("tertiary", "px-2")}
          >
            <ChevronStartIcon directional className="size-4" />
            <span className="sr-only">{workspace.backPhotos}</span>
            <span aria-hidden="true">{inventoryCopy(locale).o12.photos}</span>
          </LeaveControl>
        ) : (
          <a href={`${path}?upload=1#media-upload`} className={buttonClass("primary")}>
            <PlusIcon className="size-5" />
            {copy.upload}
          </a>
        )}
      </header>
      <ListingNavigation
        locale={locale}
        reference={listing.reference}
        current="media"
        formId={detailsFormId}
      />
      {receipt ? (
        <Notice tone="success" role="status">
          {receipt.move && receipt.order
            ? withReference(
                copy.orderSavedDetail,
                {
                  order: receipt.order.after
                    .map((id) => (receipt.order?.before.indexOf(id) ?? -1) + 1)
                    .join(", "),
                },
                ref,
              )
            : receipt.action === "media.details.saved"
              ? receipt.details?.pendingReview
                ? workspace.detailsSaved
                : receipt.details?.discarded
                  ? workspace.draftDiscarded
                  : workspace.detailsUnchanged
              : copy.saved}
          {receipt.details?.pendingReview && receipt.relationId ? (
            <a
              href={`${photoHref(receipt.relationId)}&panel=review#photo-review-panel`}
              className="inline-flex min-h-control items-center font-semibold text-action underline"
            >
              {workspace.reviewSaved}
            </a>
          ) : null}
          <details>
            <summary className="cursor-pointer text-caption">
              {inventoryCopy(locale).operation}
            </summary>
            <bdi className="break-all text-caption">{receipt.id}</bdi>
          </details>
        </Notice>
      ) : query.saved ? (
        <Notice tone="warning" role="status">
          {copy.error}
        </Notice>
      ) : null}
      {query.error ? (
        <Notice tone="error" role="alert">
          {fileError(copy, query.error)}
        </Notice>
      ) : null}
      {selected ? (
        <section
          aria-labelledby="o13-heading"
          className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)] lg:gap-8"
        >
          <div className="min-w-0 space-y-4">
            <div className="relative">
              <Preview
                row={selected}
                label={workspace.noPhoto}
                className="aspect-4/3 max-h-[24dvh] bg-subtle md:max-h-[60dvh]"
              />
              {previewable(selected) ? (
                <a
                  href={`/api/files/private/media/${selected.asset.id}?preview=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute bottom-2 end-2 inline-flex min-h-control items-center rounded-control bg-canvas px-3 text-caption font-semibold text-action shadow-sm"
                >
                  {workspace.enlargePhoto}
                  <span className="sr-only"> · {workspace.opensNewTab}</span>
                </a>
              ) : null}
            </div>
            <nav aria-label={fillCopy(copy.allPhotos, { total })}>
              <ol className="flex gap-2 overflow-x-auto pb-2">
                {assets.map((row, index) => (
                  <li key={row.relation.id} className="shrink-0">
                    <a
                      href={photoHref(row.relation.id)}
                      aria-label={fillCopy(copy.showPhoto, { n: index + 1 })}
                      aria-current={row === selected ? "true" : undefined}
                      className={cx(
                        "block w-16 overflow-hidden rounded-control border-2",
                        row === selected
                          ? "border-action"
                          : "border-transparent hover:border-border",
                      )}
                    >
                      <Preview
                        row={row}
                        label={workspace.noPhoto}
                        className="aspect-4/3 rounded-none object-cover!"
                      />
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
          <div
            id="photo-review-panel"
            className="min-w-0 scroll-mt-4 space-y-4 md:col-start-2 md:row-span-2 md:row-start-1 md:border-s md:border-divider md:ps-5"
          >
            <nav
              aria-label={workspace.imageDetails}
              className="flex flex-wrap border-b border-divider"
            >
              <LeaveControl
                href={detailsHref}
                formId={detailsFormId}
                current={!review}
                className="inline-flex min-h-control items-center border-b-2 border-transparent px-3 py-2 text-dense font-semibold text-text-muted aria-[current=page]:border-action aria-[current=page]:text-action"
              >
                <span className="sr-only">{workspace.imageDetails}</span>
                <span aria-hidden="true">{inventoryCopy(locale).o12.text}</span>
              </LeaveControl>
              <LeaveControl
                href={`${detailsHref}&panel=review#photo-review-panel`}
                formId={detailsFormId}
                current={review}
                className="inline-flex min-h-control items-center border-b-2 border-transparent px-3 py-2 text-dense font-semibold text-text-muted aria-[current=page]:border-action aria-[current=page]:text-action"
              >
                <span className="sr-only">{workspace.reviewPhoto}</span>
                <span aria-hidden="true">{workspace.photoReviewShort}</span>
              </LeaveControl>
            </nav>
            {selected.asset.detailsDraft ? (
              <p role="status" className="text-dense font-semibold text-warning">
                {workspace.detailsPending}
              </p>
            ) : null}
            <PhotoEditor
              row={selected}
              copy={copy}
              workspace={workspace}
              action={action}
              fileChooser={fileChooser}
              locale={locale}
              reference={reference}
              path={detailsHref}
              review={review}
              guard={guard}
            />
          </div>
          <div className="min-w-0 space-y-4 md:col-start-1">
            <details className="border-t border-divider pt-2">
              <summary className="min-h-control cursor-pointer py-2 text-dense font-semibold">
                {copy.orderTitle}
              </summary>
              <div className="mt-2 space-y-3">
                <p className="text-dense text-text-muted">{copy.permission}</p>
                <div className="flex flex-wrap gap-2">
                  {selectedIndex > 0 ? (
                    <a href={`${detailsHref}&move=up`} className={buttonClass("secondary")}>
                      <ArrowUpIcon className="size-4" />
                      {copy.moveUp}
                    </a>
                  ) : (
                    <button type="button" disabled className={buttonClass("secondary")}>
                      {copy.firstAlready}
                    </button>
                  )}
                  {selectedIndex + 1 < total ? (
                    <a href={`${detailsHref}&move=down`} className={buttonClass("secondary")}>
                      <ArrowDownIcon className="size-4" />
                      {copy.moveDown}
                    </a>
                  ) : (
                    <button type="button" disabled className={buttonClass("secondary")}>
                      {copy.lastAlready}
                    </button>
                  )}
                  <NativeForm action={action} method="post">
                    <FileEnvelope intent="place" version={listing.version} />
                    <input type="hidden" name="relationId" value={selected.relation.id} />
                    <input type="hidden" name="hidden" value={String(!selected.relation.hidden)} />
                    <button type="submit" className={buttonClass("tertiary")}>
                      {selected.relation.hidden ? copy.show : copy.hide}
                    </button>
                  </NativeForm>
                </div>
                {total > 2 ? (
                  <form method="get" action={path} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="photo" value={selected.relation.id} />
                    <div className="grid min-w-0 flex-1 gap-2">
                      <label className={labelClass} htmlFor="media-position">
                        {workspace.position}
                      </label>
                      <select
                        id="media-position"
                        name="before"
                        required
                        defaultValue=""
                        className={controlClass}
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
                    </div>
                    <button type="submit" className={buttonClass("secondary")}>
                      {copy.reviewOrder}
                    </button>
                  </form>
                ) : null}
              </div>
            </details>
            <details className="border-t border-divider pt-2" open={!previewable(selected)}>
              <summary className="min-h-control cursor-pointer py-2 text-dense font-semibold">
                {copy.photoChecks}
              </summary>
              <dl className="mt-2 grid gap-2 text-dense">
                {[
                  [copy.scan, selected.asset.scan],
                  [copy.processing, selected.asset.processing],
                  [copy.review, selected.asset.review],
                  [copy.rights, selected.asset.rights],
                  [copy.audience, selected.asset.audience],
                ].map(([label, state]) => (
                  <div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                    <dt className="text-text-muted">{label}</dt>
                    <dd>{fileLabel(copy, state ?? "unknown")}</dd>
                  </div>
                ))}
              </dl>
            </details>
            {previewable(selected) ? (
              <a
                className="inline-flex min-h-control items-center text-dense text-action underline"
                href={`/api/files/private/media/${selected.asset.id}`}
              >
                {copy.original}
              </a>
            ) : null}
          </div>
        </section>
      ) : (
        <section id="o13-all" aria-labelledby="o13-all-heading" className="min-w-0 space-y-4">
          {total ? (
            <MediaGallery
              key={`${listing.id}:${listing.version}`}
              heading={
                <h2 id="o13-all-heading" className="text-section font-semibold">
                  {fillCopy(copy.allPhotos, { total })}
                </h2>
              }
              items={assets.map((row, index) => ({
                id: row.relation.id,
                label: `${fileLabel(copy, "photo")} ${index + 1}`,
                hidden: row.relation.hidden,
                content: tile(row, index),
                preview: (
                  <Preview
                    row={row}
                    label={workspace.noPhoto}
                    className="h-full rounded-none object-cover!"
                  />
                ),
              }))}
              action={action}
              envelope={<FileEnvelope intent="order" version={listing.version} />}
              version={listing.version}
              draftKey={`msr-media-order:${session.actor.id}:${listing.id}`}
              confirmedOrder={receipt?.move ? receipt.order?.after : undefined}
              copy={{
                reorder: workspace.reorder,
                hint: workspace.orderHint,
                review: copy.reviewOrder,
                save: copy.saveOrder,
                cancel: copy.cancel,
                before: workspace.currentCover,
                after: workspace.proposedCover,
                up: copy.moveUp,
                down: copy.moveDown,
                cover: workspace.coverShort,
                moved: workspace.photoMoved,
                conflict: copy.conflict,
                guard,
              }}
            />
          ) : (
            <div>
              <h2 id="o13-all-heading" className="mb-4 text-section font-semibold">
                {fillCopy(copy.allPhotos, { total })}
              </h2>
              <p className="rounded-panel bg-subtle p-6">{copy.empty}</p>
            </div>
          )}
          {query.upload === "1" || !total ? (
            <section id="media-upload" className="max-w-xl space-y-4 border-t border-divider pt-5">
              <h2 className="text-section font-semibold">{copy.upload}</h2>
              <NativeForm
                action={action}
                method="post"
                encType="multipart/form-data"
                className="grid gap-4"
              >
                <FileEnvelope intent="upload" version={listing.version} />
                {fileChooser}
                <div className="grid gap-2">
                  <label className={labelClass} htmlFor="media-kind">
                    {copy.kind}
                  </label>
                  <select id="media-kind" className={controlClass} name="kind">
                    {["photo", "floor_plan", "render"].map((kind) => (
                      <option key={kind} value={kind}>
                        {fileLabel(copy, kind)}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-caption text-text-muted">{copy.imageLimit}</p>
                <FileButton>{copy.submit}</FileButton>
              </NativeForm>
            </section>
          ) : null}
        </section>
      )}
      {!selected ? (
        <p className="max-w-prose text-caption text-text-muted">{copy.permission}</p>
      ) : null}
    </div>
  );
}

function PhotoEditor({
  row: { asset, upload, relation },
  copy,
  workspace,
  action,
  fileChooser,
  locale,
  reference,
  path,
  review,
  guard,
}: {
  row: MediaRow;
  copy: ReturnType<typeof filesCopy>;
  workspace: ReturnType<typeof workflowCopy<"listingWorkspace">>;
  action: string;
  fileChooser: ReactNode;
  locale: string;
  reference: string;
  path: string;
  review: boolean;
  guard: { title: string; body: string; stay: string; discard: string };
}) {
  const ready = asset.scan === "clean" && asset.processing === "ready";
  const details = asset.detailsDraft ?? {
    caption: asset.caption ?? "",
    altText: asset.altText ?? "",
    modification: asset.modification,
    modificationDisclosure: asset.modificationDisclosure ?? "",
  };
  if (!ready)
    return (
      <div className="space-y-4">
        <Notice tone="warning">{copy.noPreview}</Notice>
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
      </div>
    );
  if (!review) {
    const operationId = randomUUID();
    return (
      <MediaReviewGuard
        key={`${asset.id}:${asset.version}:details`}
        copy={guard}
        requireAcknowledgment
      >
        <MediaDetailsEditor
          action={savePhotoDetails.bind(null, locale, reference, asset.id, relation.id)}
          path={path}
          formId="photo-details-form"
          initialState={{
            operationId,
            expectedRevision: asset.version,
            responseId: randomUUID(),
            values: details as MediaDetailsValues,
            reconciliation: {
              href: `${path}&saved=${operationId}`,
              label: inventoryCopy(locale).operation,
            },
            outcome: { kind: "idle" },
          }}
          labels={{
            caption: copy.caption,
            altText: copy.altText,
            modification: copy.modification,
            modificationDisclosure: copy.disclosure,
          }}
          options={Object.fromEntries(
            mediaModifications.map((value) => [value, fileLabel(copy, value)]),
          )}
          saveLabel={workspace.saveDetails}
          advancedLabel={workspace.imageChanges}
          copy={inventoryCopy(locale).form}
          secondaryActions={
            asset.detailsDraft ? (
              <button
                type="submit"
                name="_detailsAction"
                value="discard"
                className={buttonClass("tertiary")}
              >
                {workspace.discardDraft}
              </button>
            ) : null
          }
        />
        <p className="mt-4 text-caption text-text-muted">{workspace.detailsNote}</p>
      </MediaReviewGuard>
    );
  }
  const recordedRights = asset.rights === "cleared" && asset.rightsHolder && asset.rightsReference;
  return (
    <MediaReviewGuard key={`${asset.id}:${asset.version}:review`} copy={guard}>
      <NativeForm action={action} method="post" className="grid gap-4">
        <FileEnvelope intent="review" version={asset.version} id={asset.id} />
        <input type="hidden" name="relationId" value={relation.id} />
        {Object.entries(details).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <p className="text-dense text-text-muted">{workspace.reviewHint}</p>
        <dl className="grid gap-3 text-dense">
          <div>
            <dt className="font-semibold">{copy.caption}</dt>
            <dd className="whitespace-pre-wrap text-text-muted">{details.caption || copy.none}</dd>
          </div>
          <div>
            <dt className="font-semibold">{copy.altText}</dt>
            <dd className="whitespace-pre-wrap text-text-muted">{details.altText || copy.none}</dd>
          </div>
          {details.modification !== "none" ? (
            <>
              <div>
                <dt className="font-semibold">{copy.modification}</dt>
                <dd>{fileLabel(copy, details.modification)}</dd>
              </div>
              <div>
                <dt className="font-semibold">{copy.disclosure}</dt>
                <dd className="whitespace-pre-wrap text-text-muted">
                  {details.modificationDisclosure || copy.none}
                </dd>
              </div>
            </>
          ) : null}
        </dl>
        {recordedRights ? (
          <>
            <dl className="grid gap-3 text-dense">
              <div>
                <dt className="font-semibold">{copy.rightsHolder}</dt>
                <dd>{asset.rightsHolder}</dd>
              </div>
              <div>
                <dt className="font-semibold">{copy.rightsReference}</dt>
                <dd>{asset.rightsReference}</dd>
              </div>
            </dl>
            <details>
              <summary className="min-h-control cursor-pointer py-2 text-dense text-action">
                {workspace.editPermissions}
              </summary>
              <div className="grid gap-4 pt-3">
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
              </div>
            </details>
          </>
        ) : (
          <>
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
          </>
        )}
        <FileCheck name="privacyReviewed">{copy.privacy}</FileCheck>
        <FileCheck name="rightsConfirmed">{copy.rightsCheck}</FileCheck>
        {!details.altText.trim() ||
        (details.modification !== "none" && !details.modificationDisclosure.trim()) ? (
          <p className="text-dense text-warning">{workspace.reviewNeedsDetails}</p>
        ) : null}
        <button
          type="submit"
          name="decision"
          value="approve"
          disabled={
            !details.altText.trim() ||
            (details.modification !== "none" && !details.modificationDisclosure.trim())
          }
          className={buttonClass("primary")}
        >
          {copy.approve}
        </button>
        <details className="border-t border-divider pt-3">
          <summary className="min-h-control cursor-pointer py-2 text-dense text-error">
            {copy.reject}
          </summary>
          <button
            type="submit"
            name="decision"
            value="reject"
            formNoValidate
            className={buttonClass("destructive")}
          >
            {copy.reject}
          </button>
        </details>
      </NativeForm>
    </MediaReviewGuard>
  );
}

// ADR 0012 bulk carry-over: listings that pass every check and are still on the market, ready
// for one person to check, select and publish on one attestation. One result per listing.
import { randomUUID } from "node:crypto";
import { getDb } from "@/db/client";
import type { Actor } from "@/domain/capabilities";
import { inventoryCopy } from "@/features/inventory/copy";
import { bulkPublishAction } from "@/features/inventory/publish-actions";
import { fillCopy, publishCopy } from "@/features/inventory/publish-copy";
import { BulkPublishForm } from "@/features/inventory/publish-forms";
import { workflowCopy } from "@/i18n/workflow-copy";
import { readyToPublish } from "@/server/publication/attested";
import { cx } from "@/ui/cx";

function money(locale: string, value: unknown) {
  const amount = value as { amountMinor?: unknown; currency?: unknown; period?: unknown } | null;
  if (typeof amount?.amountMinor !== "number" || typeof amount.currency !== "string") return null;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: amount.currency,
    maximumFractionDigits: 0,
  }).format(amount.amountMinor / 100);
}

function area(locale: string, value: unknown) {
  const measured = value as { value?: unknown } | null;
  return typeof measured?.value === "number"
    ? `${new Intl.NumberFormat(locale).format(measured.value)} m²`
    : null;
}

export async function ReadyToPublish({ locale, actor }: { locale: string; actor: Actor }) {
  const inventory = inventoryCopy(locale);
  const o10 = inventory.o10;
  const copy = publishCopy(locale);
  const workspace = workflowCopy(locale, "listingWorkspace");
  const rows = await readyToPublish(getDb(), actor);
  const operationId = randomUUID();
  const tabs = [
    ["all", o10.all, `/${locale}/inventory`],
    ["needs", o10.needs, `/${locale}/inventory?view=needs`],
    ["mine", o10.mine, `/${locale}/inventory?view=mine`],
    ["ready", copy.ready.view, `/${locale}/inventory?view=ready`],
  ] as const;
  return (
    <div className="flex flex-col gap-4 px-gutter py-5 sm:gap-6 sm:px-gutter-wide sm:py-6">
      <header>
        <h1 className="text-heading font-semibold sm:text-title">{workspace.directoryTitle}</h1>
      </header>
      <nav aria-label={o10.views}>
        <ul className="flex flex-wrap gap-x-4 border-b border-divider">
          {tabs.map(([id, label, href]) => (
            <li key={id} className="flex">
              <a
                href={href}
                aria-current={id === "ready" ? "page" : undefined}
                className={cx(
                  "flex min-h-control items-center justify-center border-b-2 p-3 text-center text-dense font-semibold no-underline",
                  id === "ready"
                    ? "border-action text-action"
                    : "border-transparent text-text-muted hover:bg-subtle hover:text-text",
                )}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <p className="max-w-reading">{copy.ready.lead}</p>
      {rows.length === 0 ? (
        <p className="rounded-panel bg-subtle p-6">{copy.ready.none}</p>
      ) : (
        <BulkPublishForm
          action={bulkPublishAction.bind(null, locale)}
          initialState={{
            values: { attested: "" },
            operationId,
            expectedRevision: null,
            responseId: randomUUID(),
            outcome: { kind: "idle" },
          }}
          permalink={`/${locale}/inventory?view=ready`}
          reconciliation={{ href: `/${locale}/inventory?view=ready`, label: copy.ready.view }}
          formCopy={inventory.form}
          rows={rows.map((row) => ({
            reference: row.reference,
            version: row.version,
            title: row.title,
            detail: row.settlement,
            price:
              row.price.state === "withheld"
                ? copy.priceOnRequest
                : (money(locale, row.price.value) ?? copy.notKnown),
            area: area(locale, row.area.value) ?? copy.notKnown,
            ...(row.thumbnailId
              ? { thumbnail: `/api/files/private/media/${row.thumbnailId}?preview=1` }
              : {}),
            warnings: row.warnings.map((code) => copy.warnings[code]),
            href: `/${locale}/inventory/${encodeURIComponent(row.reference)}/publish`,
            selectLabel: fillCopy(copy.ready.select, { reference: row.reference }),
          }))}
          labels={{
            attested: copy.ready.attestation,
            submit: copy.ready.publish,
            list: copy.ready.view,
            selectAll: copy.ready.selectAll,
            listing: copy.ready.listing,
            photo: copy.ready.photo,
            price: copy.price,
            area: copy.area,
            noPhoto: copy.noPhotos,
          }}
        />
      )}
    </div>
  );
}

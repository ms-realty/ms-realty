import { and, eq, inArray } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { operations } from "@/db/schema";
import { inventoryCopy } from "@/features/inventory/copy";
import { FocusedRows, FocusedState } from "@/features/inventory/focused-state";
import { translationCopy } from "@/features/inventory/translation-copy";
import { isPublicLocale } from "@/i18n/config";
import { requireStaffPage } from "@/server/auth/pages";
import { inventoryDetail } from "@/server/inventory/commands";
import { buttonClass } from "@/ui/button-class";

export default async function InventoryReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ reference?: string }>;
}) {
  const { locale, id } = await params;
  const session = await requireStaffPage(locale);
  const copy = inventoryCopy(locale);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [operation] = await getDb()
    .select()
    .from(operations)
    .where(
      and(
        eq(operations.idempotencyKey, id),
        eq(operations.actorKind, "staff"),
        eq(operations.actorId, session.actor.id),
        inArray(operations.operationType, [
          "inventory.create",
          "inventory.draft.save",
          "inventory.revision.create",
          "inventory.availability.confirm",
          "inventory.instruction.record",
          "inventory.authority.review",
          "translation.save",
          "translation.submit",
          "translation.approve",
          "translation.reject",
          "property.fact_revision.approve",
          "listing.revision.submit",
          "listing.revision.approve",
          "publication.manifest.prepare",
          "publication.activate",
          "publication.restrict",
          "publication.withdraw",
        ]),
      ),
    )
    .limit(1);
  const outcome = operation?.outcome as
    | { reference?: string; propertyId?: string; locale?: string }
    | undefined;
  const translation =
    operation?.status === "succeeded" &&
    operation.operationType.startsWith("translation.") &&
    outcome?.locale &&
    isPublicLocale(outcome.locale)
      ? outcome.locale
      : null;
  const translatedCopy = translationCopy(locale);
  let reference: string | undefined;
  if (outcome?.reference) {
    const record = await inventoryDetail(getDb(), session.actor, outcome.reference).catch(
      () => null,
    );
    if (!record) notFound();
    reference = record.listing.reference;
  } else if (outcome?.propertyId) {
    const requested = (await searchParams).reference;
    if (requested) {
      const record = await inventoryDetail(getDb(), session.actor, requested).catch(() => null);
      if (!record || record.property.id !== outcome.propertyId) notFound();
      reference = record.listing.reference;
    }
  }
  // O16AQ (Figma 23:2587 / 30:6834): an activation whose result is not confirmed yet never
  // reads as published; a confirmed one opens its O16DONE result, a failed one the generic page.
  if (operation?.operationType === "publication.activate" && operation.status !== "failed") {
    const requested = (await searchParams).reference;
    if (operation.status === "succeeded" && reference)
      redirect(`/${locale}/inventory/${reference}?tab=review&published=${id}`);
    const record = requested
      ? await inventoryDetail(getDb(), session.actor, requested).catch(() => null)
      : null;
    if (!record) notFound();
    const o16 = copy.o16;
    const review = `/${locale}/inventory/${record.listing.reference}?tab=review`;
    return (
      <FocusedState closeHref={review} closeLabel={copy.o12.close}>
        <h1 className="pe-12 text-heading font-semibold sm:text-title">{o16.checking}</h1>
        <p role="status">{o16.checkingLead}</p>
        <FocusedRows
          rows={[
            [o16.checkingRows.number, id.slice(0, 8)],
            [o16.checkingRows.candidate, record.listing.reference],
            [o16.checkingRows.local, o16.checkingLocal],
            [o16.checkingRows.external, o16.checkingExternal],
            [o16.checkingRows.recovery, o16.checkingRecovery],
          ]}
        />
        <p className="rounded-control bg-warning-soft p-4 text-dense">{o16.checkingNote}</p>
        <div className="flex flex-wrap gap-3">
          <a
            href={`/${locale}/inventory/operations/${id}?reference=${encodeURIComponent(record.listing.reference)}`}
            className={buttonClass("primary")}
          >
            {o16.checkAgain}
          </a>
          <a href={review} className={buttonClass("tertiary", "text-text")}>
            {o16.reviewException}
          </a>
        </div>
      </FocusedState>
    );
  }
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8">
      <h1 className="text-title font-semibold">
        {translation ? translatedCopy.saved : copy.operation}
      </h1>
      <p role="status">
        {operation?.status === "succeeded"
          ? copy.succeeded
          : operation?.status === "failed"
            ? copy.blocked
            : copy.pending}
      </p>
      {reference ? (
        <p>
          <bdi>{reference}</bdi>
        </p>
      ) : null}
      {operation?.completedAt ? (
        <p>
          {copy.recorded}:{" "}
          <time dateTime={operation.completedAt.toISOString()}>
            {operation.completedAt.toLocaleString(locale)}
          </time>
        </p>
      ) : null}
      <p className="break-all text-caption text-text-muted">
        <bdi>{id}</bdi>
      </p>
      <a
        className={buttonClass("secondary")}
        href={`/${locale}/inventory${reference ? `/${reference}` : ""}`}
      >
        {reference ? copy.open : copy.back}
      </a>
      {reference && translation ? (
        <p>
          <a
            className={buttonClass("primary")}
            href={`/${locale}/inventory/${reference}/translations/${translation}`}
          >
            {translatedCopy.open}
          </a>
        </p>
      ) : null}
    </div>
  );
}

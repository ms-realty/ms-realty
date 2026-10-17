// O11/O12: create the property/listing working draft; no approval or publication side effect.
import { randomUUID } from "node:crypto";
import { getDb } from "@/db/client";
import { inventoryCopy } from "@/features/inventory/copy";
import { InventoryEditor, type InventoryValues } from "@/features/inventory/editor";
import { requireStaffPage } from "@/server/auth/pages";
import { can } from "@/server/authz";
import { emptyDraft } from "@/server/inventory/contracts";
import { saveInventory } from "../actions";

export default async function NewInventoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await requireStaffPage(locale);
  const copy = inventoryCopy(locale);
  const permitted = await can(getDb(), session.actor, "listing.edit");
  const values: InventoryValues = {
    ...emptyDraft,
    propertyType: "apartment",
    purpose: "sale",
    country: "BG",
    region: "",
    settlement: "",
    exactAddress: "",
  };
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-8">
      <a href={`/${locale}/inventory`} className="text-action underline">
        {copy.back}
      </a>
      <h1 className="text-title font-semibold">{copy.create}</h1>
      <p className="text-text-muted">{copy.privateAddress}</p>
      <p>{copy.factsHint}</p>
      {permitted ? (
        <InventoryEditor
          locale={locale}
          action={saveInventory.bind(null, locale, null)}
          initialState={{
            operationId: randomUUID(),
            expectedRevision: 0,
            responseId: randomUUID(),
            values,
            outcome: { kind: "idle" },
          }}
        />
      ) : (
        <p>{copy.permissions}</p>
      )}
    </div>
  );
}

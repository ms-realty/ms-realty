// O10: real capability-scoped inventory, no manufactured totals or readiness claims.

import { getDb } from "@/db/client";
import { inventoryCopy, optionLabel } from "@/features/inventory/copy";
import { requireStaffPage } from "@/server/auth/pages";
import { can } from "@/server/authz";
import { inventoryList } from "@/server/inventory/commands";
import { buttonClass } from "@/ui/button-class";

export default async function InventoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await requireStaffPage(locale);
  const db = getDb();
  const copy = inventoryCopy(locale);
  const rows = await inventoryList(db, session.actor);
  const mayCreate = await can(db, session.actor, "listing.edit");
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-title font-semibold">{copy.inventory}</h1>
        {mayCreate ? (
          <a className={buttonClass("primary")} href={`/${locale}/inventory/new`}>
            {copy.create}
          </a>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-panel border border-divider bg-surface p-6">{copy.empty}</p>
      ) : (
        <ul className="divide-y divide-divider rounded-panel border border-divider bg-surface">
          {rows.map(({ listing, property }) => (
            <li key={listing.id} className="flex flex-wrap items-start justify-between gap-3 p-5">
              <div>
                <a
                  className="font-semibold text-action underline"
                  href={`/${locale}/inventory/${listing.reference}`}
                >
                  <bdi>{listing.reference}</bdi>
                </a>
                <p>
                  {optionLabel(property.propertyType, locale)} · {property.settlement},{" "}
                  {property.region}
                </p>
              </div>
              <div className="text-compact text-text-muted">
                <p>{optionLabel(listing.purpose, locale)}</p>
                <p>
                  {copy.state}: {optionLabel(listing.editorialState, locale)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

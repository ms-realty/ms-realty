// O10: the one next step a row offers, and where it leads. Editorial work opens O12; translation
// work opens O15 for its locale. A translation the person may not review is skipped while an
// authorized pending step exists, so the list never routes into a denial first.
import type { InventoryAction } from "@/server/inventory/queries";

export function rowAction(actions: readonly InventoryAction[]): InventoryAction | undefined {
  return (
    actions.find((action) => action.kind !== "translation_review" || action.canReview) ?? actions[0]
  );
}

export function rowDestination(
  locale: string,
  reference: string,
  action: InventoryAction | undefined,
): string {
  return action?.kind === "translation_review"
    ? `/${locale}/inventory/${reference}/translations/${action.locale}`
    : `/${locale}/inventory/${reference}`;
}

export const inventoryDecisionIntents = [
  "freeze",
  "availability",
  "facts",
  "submit",
  "approve",
  "prepare",
  "activate",
  "restrict",
  "withdraw",
] as const;
export type InventoryDecisionIntent = (typeof inventoryDecisionIntents)[number];
export type InventoryDecisionContext = {
  locale: string;
  reference: string;
  intent: InventoryDecisionIntent;
  revisionId: string;
  manifestId?: string;
};
export type InventoryDecisionValues = {
  scope: string;
  confirmed: string;
  publicationLocale: string;
};
export const inventorySections = {
  navigation: "inventory-sections",
  readiness: "inventory-readiness",
  draft: "inventory-draft",
  locales: "inventory-locales",
  review: "inventory-review",
} as const;
export function inventoryDecisionSection(intent: InventoryDecisionIntent) {
  return intent === "availability"
    ? inventorySections.readiness
    : intent === "freeze"
      ? inventorySections.draft
      : inventorySections.review;
}

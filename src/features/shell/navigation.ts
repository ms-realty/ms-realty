// Navigation registry for the three surfaces (spec §06). An item links only once the slice
// that builds its screen sets `path`; navigation.test.ts checks every set path against the
// routes in app/. Until then the item is left out: no dead-end teasers (§17.1).
import type { PublicLocale } from "@/i18n/config";

type Nav = typeof import("../../../messages/en.json")["nav"];
export type PublicNavLabel = Exclude<keyof Nav, "journey" | "workspace">;
export type JourneyNavLabel = keyof Nav["journey"];
export type WorkspaceNavLabel = keyof Nav["workspace"];
export type FooterLabel = "help" | "privacy" | "accessibility";

export interface NavItem<Label extends string> {
  readonly label: Label;
  /** Spec screen the destination implements. */
  readonly screen: string;
  /**
   * Path inside the surface: after `/<locale>` for public and journey items ("" is the
   * locale home), absolute for the workspace. Null until the route exists.
   */
  readonly path: string | null;
}

export interface WorkspaceNavItem extends NavItem<WorkspaceNavLabel> {
  /** On phones Today, Inbox and Calendar are the primary work surfaces (§06.3). */
  readonly mobilePrimary?: boolean;
}

export const publicPrimaryNav: readonly NavItem<PublicNavLabel>[] = [
  { label: "buy", screen: "P02", path: null },
  { label: "rent", screen: "P02", path: null },
  { label: "sellLet", screen: "P17", path: null },
  { label: "areas", screen: "P15", path: null },
  { label: "howWeHelp", screen: "P16", path: null },
];

export const publicUtilityNav: readonly NavItem<PublicNavLabel>[] = [
  { label: "saved", screen: "P08", path: null },
  { label: "contact", screen: "P20", path: null },
];

/** Shown only to a returning verified client (§06.1). */
export const myJourneyNav: NavItem<PublicNavLabel> = {
  label: "myJourney",
  screen: "C03",
  path: null,
};

export const footerNav: readonly NavItem<FooterLabel>[] = [
  { label: "help", screen: "P24", path: null },
  { label: "privacy", screen: "P24", path: null },
  { label: "accessibility", screen: "P24", path: null },
];

export const journeyNav: readonly NavItem<JourneyNavLabel>[] = [
  { label: "overview", screen: "C03", path: null },
  { label: "properties", screen: "C05", path: null },
  { label: "appointments", screen: "C06", path: null },
  { label: "messages", screen: "C07", path: null },
  { label: "documents", screen: "C08", path: null },
];

export const journeyHelpNav: NavItem<JourneyNavLabel> = {
  label: "help",
  screen: "P24",
  path: null,
};

export const workspacePrimaryNav: readonly WorkspaceNavItem[] = [
  { label: "today", screen: "O01", path: "/workspace", mobilePrimary: true },
  { label: "inbox", screen: "O02", path: null, mobilePrimary: true },
  { label: "cases", screen: "O04", path: null },
  { label: "properties", screen: "O10", path: null },
  { label: "calendar", screen: "O08", path: null, mobilePrimary: true },
];

export const workspaceSecondaryNav: readonly WorkspaceNavItem[] = [
  { label: "contentApprovals", screen: "O21", path: null },
  { label: "serviceOperations", screen: "O29", path: null },
  { label: "reports", screen: "O22", path: null },
  { label: "settings", screen: "O24", path: null },
];

/** Items whose route exists, with locale-prefixed hrefs. */
export function linked<Label extends string, Item extends NavItem<Label>>(
  items: readonly Item[],
  locale?: PublicLocale,
): (Item & { readonly href: string })[] {
  return items.flatMap((item) =>
    item.path === null ? [] : [{ ...item, href: locale ? `/${locale}${item.path}` : item.path }],
  );
}

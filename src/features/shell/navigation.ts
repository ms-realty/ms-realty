// Navigation registry for the three hosts (architecture §11.1, ux-spec §03.1). An item links
// only once the slice that builds its screen sets `path`; navigation.test.ts checks every set
// path against the routes of its host in app/{public,client,staff}. Until then the item is
// left out: no dead-end teasers.
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
  /** Path after `/<locale>` on the item's host ("" is the locale home); null until built. */
  readonly path: string | null;
}

export interface WorkspaceNavItem extends NavItem<WorkspaceNavLabel> {
  /** On phones Today, Inquiries and Calendar are the primary work surfaces. */
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

/** Shown only to a returning verified client; the destination is on the client host. */
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

/** Staff navigation (§11.1): Today, Inquiries, Cases, Calendar, Inventory, Reviews, Content,
 * Operations; settings stays secondary. */
export const workspacePrimaryNav: readonly WorkspaceNavItem[] = [
  { label: "today", screen: "O01", path: "/today", mobilePrimary: true },
  { label: "inquiries", screen: "O02", path: null, mobilePrimary: true },
  { label: "cases", screen: "O04", path: null },
  { label: "calendar", screen: "O08", path: null, mobilePrimary: true },
  { label: "inventory", screen: "O10", path: null },
  { label: "reviews", screen: "O15", path: null },
  { label: "content", screen: "O21", path: null },
  { label: "operations", screen: "O22", path: null },
];

export const workspaceSecondaryNav: readonly WorkspaceNavItem[] = [
  { label: "settings", screen: "O24", path: null },
];

/** Items whose route exists, with locale-prefixed hrefs. */
export function linked<Label extends string, Item extends NavItem<Label>>(
  items: readonly Item[],
  locale: PublicLocale,
): (Item & { readonly href: string })[] {
  return items.flatMap((item) =>
    item.path === null ? [] : [{ ...item, href: `/${locale}${item.path}` }],
  );
}

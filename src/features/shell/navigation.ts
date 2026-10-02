// Navigation registry for the three hosts (architecture §11.1, ux-spec §03.1). An item links
// only once the slice that builds its screen sets `path`; navigation.test.ts checks every set
// path against the routes of its host in app/{public,client,staff}. Until then the item is
// left out: no dead-end teasers.
import type { PublicLocale } from "@/i18n/config";

type Nav = typeof import("../../../messages/bg/nav.json");
export type PublicNavLabel = Exclude<keyof Nav, "journey" | "workspace">;
export type JourneyNavLabel = keyof Nav["journey"];
export type WorkspaceNavLabel = keyof typeof import("../../../messages/staff/bg/workspace.json");
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
  { label: "buy", screen: "P02", path: "/properties?purpose=sale" },
  { label: "rent", screen: "P02", path: "/properties?purpose=long_term_rent" },
  { label: "sellLet", screen: "P17", path: "/sell" },
  { label: "areas", screen: "P15", path: null },
  { label: "aboutContact", screen: "P20", path: "/contact" },
];

export const publicUtilityNav: readonly NavItem<PublicNavLabel>[] = [
  { label: "saved", screen: "P08", path: "/saved" },
  { label: "contact", screen: "P20", path: "/contact" },
];

/** Shown only to a returning verified client; the destination is on the client host. */
export const myJourneyNav: NavItem<PublicNavLabel> = {
  label: "myJourney",
  screen: "C03",
  path: "/overview",
};

export const footerNav: readonly NavItem<FooterLabel>[] = [
  { label: "help", screen: "P24", path: "/help/general" },
  { label: "privacy", screen: "P24", path: "/help/privacy" },
  { label: "accessibility", screen: "P24", path: "/help/accessibility" },
];

export const journeyNav: readonly NavItem<JourneyNavLabel>[] = [
  { label: "overview", screen: "C03", path: "/overview" },
  { label: "properties", screen: "C05", path: "/properties" },
  { label: "appointments", screen: "C06", path: "/appointments" },
  { label: "messages", screen: "C07", path: "/messages" },
  { label: "documents", screen: "C08", path: "/documents" },
];

export const journeyHelpNav: NavItem<JourneyNavLabel> = {
  label: "help",
  screen: "P24",
  path: null,
};

/** Saved Figma O01 rail: everyday work stays primary; Butler and tools stay secondary.
 * The route registry preserves working native destinations and leaves unbuilt pages out. */
export const workspacePrimaryNav: readonly WorkspaceNavItem[] = [
  { label: "today", screen: "O01", path: "/today", mobilePrimary: true },
  { label: "inquiries", screen: "O02", path: "/inquiries", mobilePrimary: true },
  { label: "cases", screen: "O04", path: "/cases" },
  { label: "inventory", screen: "O10", path: "/inventory" },
  { label: "calendar", screen: "O08", path: "/calendar", mobilePrimary: true },
  { label: "tasks", screen: "O18", path: "/tasks" },
];

export const workspaceSecondaryNav: readonly WorkspaceNavItem[] = [
  { label: "butler", screen: "XBUTLER", path: "/operations/assistance" },
  { label: "moreTools", screen: "X02", path: "/operations" },
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

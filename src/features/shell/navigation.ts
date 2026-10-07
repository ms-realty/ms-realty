// Navigation registry for the three hosts (architecture §11.1, ux-spec §03.1). An item links
// only once the slice that builds its screen sets `path`; navigation.test.ts checks every set
// path against the routes of its host in app/{public,client,staff}. Until then the item is
// left out: no dead-end teasers.
import type { Capability } from "@/domain/capabilities";
import type { PublicLocale } from "@/i18n/config";

type Nav = typeof import("../../../messages/bg/nav.json");
type Tools = typeof import("../../../messages/staff/bg/tools.json");
export type PublicNavLabel = Exclude<keyof Nav, "journey" | "workspace">;
export type JourneyNavLabel = keyof Nav["journey"];
export type WorkspaceNavLabel = keyof typeof import("../../../messages/staff/bg/workspace.json");
export type AgencyToolLabel = keyof Tools["items"];
export type AgencyToolSection = keyof Tools["sections"];
export type FooterLabel = "help" | "privacy" | "accessibility";

export interface NavItem<Label extends string> {
  readonly label: Label;
  /** Spec screen the destination implements. */
  readonly screen: string;
  /** Path after `/<locale>` on the item's host ("" is the locale home); null until built. */
  readonly path: string | null;
}

export type WorkspaceNavItem = NavItem<WorkspaceNavLabel>;

export interface AgencyToolItem extends NavItem<AgencyToolLabel> {
  /** Shown only to someone holding all of these, as the destination checks; none: any staff. */
  readonly requires?: readonly Capability[];
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
  { label: "today", screen: "O01", path: "/today" },
  { label: "inquiries", screen: "O02", path: "/inquiries" },
  { label: "cases", screen: "O04", path: "/cases" },
  { label: "inventory", screen: "O10", path: "/inventory" },
  { label: "calendar", screen: "O08", path: "/calendar" },
  { label: "tasks", screen: "O18", path: "/tasks" },
];

export const workspaceSecondaryNav: readonly WorkspaceNavItem[] = [
  { label: "butler", screen: "XBUTLER", path: "/operations/assistance" },
  { label: "moreTools", screen: "X02", path: "/operations" },
];

/**
 * X02 «Инструменти на агенцията» (Figma 22:1103, 23:4648): the rail's «Още инструменти» page and
 * the phone menu. Rows keep the drawn order; working destinations the frame does not draw follow
 * in their section, so nothing reachable before becomes unreachable. `requires` repeats each
 * destination's own capability check, so a row is offered only to someone who may open it.
 */
export const agencyTools: Readonly<Record<AgencyToolSection, readonly AgencyToolItem[]>> = {
  work: [
    { label: "today", screen: "O01", path: "/today" },
    { label: "inquiries", screen: "O02", path: "/inquiries" },
    { label: "cases", screen: "O04", path: "/cases" },
    { label: "inventory", screen: "O10", path: "/inventory" },
    { label: "imports", screen: "O28", path: null },
    { label: "calendar", screen: "O08", path: "/calendar" },
    { label: "tasks", screen: "O18", path: "/tasks" },
    { label: "consultations", screen: "O29", path: null },
    { label: "coverage", screen: "O01", path: "/coverage", requires: ["case.read_internal"] },
    {
      label: "inbound",
      screen: "O02",
      path: "/operations/inbound",
      requires: ["inquiry.assign", "case.read_internal", "message.draft"],
    },
    { label: "keys", screen: "O09", path: "/operations/keys", requires: ["key.manage"] },
    {
      label: "complaints",
      screen: "O25",
      path: "/operations/complaints",
      requires: ["complaint.manage"],
    },
  ],
  management: [
    { label: "pages", screen: "O21", path: "/content", requires: ["content.edit"] },
    { label: "reports", screen: "O22", path: null },
    { label: "team", screen: "O23", path: "/access/manage", requires: ["access.grant"] },
    { label: "system", screen: "O24", path: null },
    { label: "jobs", screen: "O25", path: "/operations/jobs", requires: ["report.read"] },
    { label: "privacy", screen: "O26", path: "/operations/privacy", requires: ["privacy.manage"] },
    {
      label: "alerts",
      screen: "O24",
      path: "/operations/subscriptions",
      requires: ["settings.manage", "message.send_external"],
    },
  ],
};

/** Every capability a tool row asks for: resolve them once per request. */
export const agencyToolCapabilities: readonly Capability[] = [
  ...new Set(Object.values(agencyTools).flatMap((items) => items.flatMap((i) => i.requires ?? []))),
];

export type AgencyToolGroup = {
  readonly section: AgencyToolSection;
  readonly items: readonly (AgencyToolItem & { readonly href: string })[];
};

/** The built rows this person may open, by section; a section with none is left out. */
export function permittedTools(
  locale: PublicLocale,
  held: ReadonlySet<Capability>,
): AgencyToolGroup[] {
  return (Object.keys(agencyTools) as AgencyToolSection[]).flatMap((section) => {
    const items = linked(
      agencyTools[section].filter((item) => (item.requires ?? []).every((c) => held.has(c))),
      locale,
    );
    return items.length > 0 ? [{ section, items }] : [];
  });
}

/** Items whose route exists, with locale-prefixed hrefs. */
export function linked<Label extends string, Item extends NavItem<Label>>(
  items: readonly Item[],
  locale: PublicLocale,
): (Item & { readonly href: string })[] {
  return items.flatMap((item) =>
    item.path === null ? [] : [{ ...item, href: `/${locale}${item.path}` }],
  );
}

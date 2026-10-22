import type { PublicLocale } from "@/i18n/config";
import { type HostContext, homePaths } from "@/server/config/hosts";
import type bg from "../../../messages/bg/errors.json";

/** A list the not-found and error states can name: «Back to deals», not «Back to list». */
export type RecoverySection = keyof (typeof bg)["recovery"]["sections"];
/** What a missing record was, by its URL alone: never a lookup, so existence stays hidden. */
export type MissingItem = keyof (typeof bg)["notFound"]["items"];
type Label =
  | "home"
  | "staffHome"
  | "clientHome"
  | "list"
  | "record"
  | "deal"
  | "listing"
  | "inquiry"
  | "search"
  | "access"
  | "tools"
  | `section:${RecoverySection}`;
export type RecoveryLink = { href: string; label: Label };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const staffLists = new Set([
  "inventory",
  "cases",
  "inquiries",
  "contacts",
  "calendar",
  "tasks",
  "proposals",
  "content",
]);
const clientLists = new Set([
  "overview",
  "properties",
  "appointments",
  "messages",
  "documents",
  "proposals",
  "preferences",
]);
const named = new Set<string>([
  "inquiries",
  "cases",
  "inventory",
  "calendar",
  "tasks",
  "appointments",
  "messages",
  "documents",
  "properties",
] satisfies RecoverySection[]);
const records: Partial<Record<string, "deal" | "listing" | "inquiry">> = {
  cases: "deal",
  inventory: "listing",
  inquiries: "inquiry",
};
const items: Partial<Record<HostContext, Partial<Record<string, MissingItem>>>> = {
  staff: { cases: "deal", inquiries: "inquiry", inventory: "listing", calendar: "appointment" },
  client: { overview: "deal", appointments: "appointment" },
  public: { properties: "property" },
};
const recordSegment = (value: string | undefined) =>
  value !== undefined && (uuid.test(value) || /^MS-[0-9]{5,}$/.test(value));
const listLabel = (section: string): Label =>
  named.has(section) ? `section:${section as RecoverySection}` : "list";

/** Only known local parents. An unknown path, query or token can never become a return URL. */
export function recoveryLinks(
  surface: HostContext,
  locale: PublicLocale,
  requested: string | null,
): { home: RecoveryLink; parent?: RecoveryLink; item?: MissingItem } {
  const root = `/${locale}`;
  const home: RecoveryLink = {
    href: `${root}${homePaths[surface]}`,
    label: surface === "staff" ? "staffHome" : surface === "client" ? "clientHome" : "home",
  };
  let parent: RecoveryLink | undefined;
  let item: MissingItem | undefined;
  if (!requested?.startsWith(`${root}/`) || /[\\\r\n]/.test(requested)) return { home, parent };
  const url = new URL(requested, "https://recovery.invalid");
  const [section, second, third] = url.pathname.slice(root.length + 1).split("/");
  // The URL itself names a record of a known kind (not a page inside one): say which kind
  // was not found. Public listings are /properties/{reference}/{slug}.
  const recordUrl =
    surface === "public"
      ? second !== undefined && second !== "intent"
      : second !== undefined && third === undefined && !["operations", "new"].includes(second);
  if (section && recordUrl) item = items[surface]?.[section];
  if (surface === "public") {
    if (section === "properties") parent = { href: `${root}/properties`, label: "search" };
    else if (section === "areas" && second) parent = { href: `${root}/areas`, label: "list" };
  } else if (section === "access") {
    if (second) parent = { href: `${root}/access`, label: "access" };
  } else if (surface === "staff") {
    if (section === "operations") {
      parent =
        second && third && ["keys", "complaints", "inbound", "assistance"].includes(second)
          ? { href: `${root}/operations/${second}`, label: "list" }
          : { href: `${root}/operations`, label: "tools" };
    } else if (section && staffLists.has(section)) {
      parent =
        third && recordSegment(second)
          ? { href: `${root}/${section}/${second}`, label: records[section] ?? "record" }
          : { href: `${root}/${section}`, label: listLabel(section) };
    }
  } else if (section && clientLists.has(section)) {
    // A receipt URL may lack its key. Its record link still goes through the normal page guard.
    const id = url.searchParams.get("id");
    const command = url.searchParams.get("command");
    const caseCommand = [
      "next",
      "brief",
      "acknowledge",
      "sellerBind",
      "ownerAcknowledge",
      "proposalRequest",
      "stage",
      "disposition",
      "handover",
      "interest",
      "message",
      "note",
      "request",
    ];
    if (
      second === "operations" &&
      id &&
      uuid.test(id) &&
      ((section === "overview" && command && caseCommand.includes(command)) ||
        (section === "proposals" && command === "create"))
    ) {
      parent = { href: `${root}/overview/${id}`, label: "deal" };
    } else if (section === "overview" && third && recordSegment(second)) {
      parent = { href: `${root}/overview/${second}`, label: "deal" };
    } else if (section === "documents" && second === "requests" && third) {
      parent = { href: `${root}/documents/requests`, label: "list" };
    } else if (third && recordSegment(second)) {
      parent = { href: `${root}/${section}/${second}`, label: "record" };
    } else {
      parent = { href: `${root}/${section}`, label: listLabel(section) };
    }
  }
  // A list's own failure is not its parent: the way back is the home only.
  if (parent?.href === home.href || parent?.href === url.pathname) parent = undefined;
  return { home, parent, ...(item ? { item } : {}) };
}

/** Next generates a numeric digest. Never show an arbitrary error message or payload. */
export function errorReference(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("digest" in error)) return undefined;
  return typeof error.digest === "string" && /^[0-9]{1,20}$/.test(error.digest)
    ? error.digest
    : undefined;
}

import type { PublicLocale } from "@/i18n/config";
import { type HostContext, homePaths } from "@/server/config/hosts";

type Label =
  | "home"
  | "staffHome"
  | "clientHome"
  | "list"
  | "record"
  | "deal"
  | "search"
  | "access"
  | "tools";
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
const recordSegment = (value: string | undefined) =>
  value !== undefined && (uuid.test(value) || /^MS-[0-9]{5,}$/.test(value));

/** Only known local parents. An unknown path, query or token can never become a return URL. */
export function recoveryLinks(
  surface: HostContext,
  locale: PublicLocale,
  requested: string | null,
) {
  const root = `/${locale}`;
  const home: RecoveryLink = {
    href: `${root}${homePaths[surface]}`,
    label: surface === "staff" ? "staffHome" : surface === "client" ? "clientHome" : "home",
  };
  let parent: RecoveryLink | undefined;
  if (!requested?.startsWith(`${root}/`) || /[\\\r\n]/.test(requested)) return { home, parent };
  const url = new URL(requested, "https://recovery.invalid");
  const [section, second, third] = url.pathname.slice(root.length + 1).split("/");
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
          ? { href: `${root}/${section}/${second}`, label: "record" }
          : { href: `${root}/${section}`, label: "list" };
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
      parent = { href: `${root}/${section}`, label: "list" };
    }
  }
  if (parent?.href === home.href) parent = undefined;
  return { home, parent };
}

/** Next generates a numeric digest. Never show an arbitrary error message or payload. */
export function errorReference(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("digest" in error)) return undefined;
  return typeof error.digest === "string" && /^[0-9]{1,20}$/.test(error.digest)
    ? error.digest
    : undefined;
}

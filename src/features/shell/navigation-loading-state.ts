import { isPublicLocale, isStaffLocale } from "@/i18n/config";
import type { HostContext } from "@/server/config/hosts";

export const navigationStartEvent = "msr:navigation-start";
export const navigationErrorEvent = "msr:navigation-error";
const lists = new Set([
  "today",
  "inventory",
  "inquiries",
  "cases",
  "contacts",
  "calendar",
  "tasks",
  "content",
  "proposals",
  "overview",
  "properties",
  "appointments",
  "messages",
  "documents",
  "preferences",
  "operations",
]);

/** A pending read gets a shape, never record values or an enabled action. */
export function navigationLoadingTarget(surface: HostContext, href: string, current: string) {
  const source = new URL(current);
  let target: URL;
  try {
    target = new URL(href, source);
  } catch {
    return null;
  }
  if (
    target.origin !== source.origin ||
    target.pathname + target.search === source.pathname + source.search
  )
    return null;
  const [locale, section, record] = target.pathname.slice(1).split("/");
  if (!locale || !isPublicLocale(locale) || (surface === "staff" && !isStaffLocale(locale)))
    return null;
  if (surface === "public") {
    if (section !== "properties" || record === "intent") return null;
    return { locale, kind: record ? ("listing" as const) : ("list" as const) };
  }
  if (!section || !lists.has(section)) return null;
  return { locale, kind: record ? ("record" as const) : ("list" as const) };
}

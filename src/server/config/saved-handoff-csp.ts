import { isRoutableLocale } from "@/i18n/config";
import type { HostContext, HostOrigins } from "./hosts";
/** Only C05's real public selection entry may post to this exact configured bridge. */
export function savedHandoffFormTargets(
  context: HostContext,
  pathname: string,
  origins: HostOrigins,
): readonly string[] {
  const [, locale, entry, ...rest] = pathname.split("/");
  if (
    context !== "public" ||
    !locale ||
    !isRoutableLocale(locale) ||
    entry !== "saved" ||
    rest.length
  )
    return [];
  const target = new URL(origins.client),
    local = Object.values(origins).every((origin) => {
      const host = new URL(origin).hostname;
      return host === "localhost" || host.endsWith(".localhost");
    });
  if (target.protocol !== "https:" && !local) return [];
  return ["saved/handoff", "saved/import", "access"].map(
    (path) => `${origins.client}/${locale}/${path}`,
  );
}

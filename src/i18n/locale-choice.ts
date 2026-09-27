import type { HostContext } from "@/server/config/hosts";
import { isRoutableLocale, isStaffLocale } from "./config";

/** A private access page suppresses Referer to protect sign-in URLs. Browser-proven
 * same-origin user navigation still records a language choice without exposing that URL. */
export function explicitLocaleChoice(
  headers: Headers,
  pathname: string,
  context: HostContext,
): string | null {
  const valid = context === "staff" ? isStaffLocale : isRoutableLocale;
  const target = pathname.split("/")[1] ?? "";
  if (!valid(target) || headers.get("sec-fetch-site") !== "same-origin") return null;
  if (headers.get("sec-fetch-dest") !== "document") return null;
  const referer = headers.get("referer");
  if (!referer)
    return context !== "public" && headers.get("sec-fetch-user") === "?1" ? target : null;
  try {
    const source = new URL(referer).pathname.split("/")[1] ?? "";
    return valid(source) && source !== target ? target : null;
  } catch {
    return null;
  }
}

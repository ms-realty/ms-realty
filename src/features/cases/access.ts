import "server-only";
import { notFound, redirect } from "next/navigation";
import { isRoutableLocale } from "@/i18n/config";
import { currentClientSession, localReturnPath } from "@/server/auth/pages";

/** Preserve only the route's declared record/status identifiers, never arbitrary private query text. */
export function clientReturnPath(
  path: string,
  query: Record<string, string | string[] | undefined>,
  keys: readonly string[],
) {
  const params = new URLSearchParams();
  for (const key of keys) {
    const value = query[key];
    if (typeof value === "string") params.set(key, value);
  }
  return `${path}${params.size ? `?${params}` : ""}`;
}

export async function requireClientPage(locale: string, returnTo: string) {
  if (!isRoutableLocale(locale)) notFound();
  const session = await currentClientSession();
  if (!session) {
    const destination = localReturnPath(returnTo, "client", locale) ?? `/${locale}/overview`;
    return redirect(`/${locale}/access?returnTo=${encodeURIComponent(destination)}`);
  }
  return session;
}

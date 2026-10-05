// Copy accessors (design/i18n-uncatalogued-copy-plan.md §3.1). A feature's copy function reads
// its message catalog, messages/<locale>/<namespace>.json imported statically, so interface text
// lives only in the catalogs, under their review status and checks. Call sites keep their
// `featureCopy(locale)` functions and plain objects.
import type { PublicLocale } from "./config";

/**
 * One catalog per public locale, typed by the Bulgarian source: a locale missing one of its
 * keys is a compile error, and messages.test.ts requires the exact key set. The same object is
 * returned on every call, so it is read-only.
 */
export function catalogCopy<T>(catalogs: Readonly<Record<PublicLocale, T>>) {
  return (locale: PublicLocale): Readonly<T> => catalogs[locale];
}

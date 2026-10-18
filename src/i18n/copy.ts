// Catalogs are selected by the same validated route locale as the existing accessors.
// Selection does not approve a translation or make a locale indexable.
import type { PublicLocale } from "./config";

export function catalogCopy<T>(catalogs: Readonly<Record<PublicLocale, T>>) {
  return (locale: PublicLocale): Readonly<T> => catalogs[locale];
}

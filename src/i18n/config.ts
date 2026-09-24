// Spec §18.2 / AD9. A locale is routable only when enabled; indexing needs human approval.
export const publicLocales = ["bg", "en", "ru", "de", "nl", "el", "he"] as const;
export const staffLocales = ["bg", "ru", "en"] as const;
export const defaultLocale = "bg";

export type PublicLocale = (typeof publicLocales)[number];

export function isPublicLocale(value: string): value is PublicLocale {
  return (publicLocales as readonly string[]).includes(value);
}

export function localeDirection(locale: PublicLocale): "ltr" | "rtl" {
  return locale === "he" ? "rtl" : "ltr";
}

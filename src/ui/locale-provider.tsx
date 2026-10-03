"use client";

import type { ReactNode } from "react";
import { I18nProvider } from "react-aria-components";
import { displayLocale, type PublicLocale } from "@/i18n/config";

/**
 * Gives React Aria the route's display locale (src/i18n/config.ts displayLocales), not the
 * browser's: keyboard mirroring, number parsing and formatting, calendar names and built-in
 * labels follow the page, exactly like server-side formatting (ux-spec §19.3). Time zones are
 * never implied: date components receive zoned values from their callers.
 */
export function LocaleProvider({ locale, children }: { locale: PublicLocale; children: ReactNode }) {
  return <I18nProvider locale={displayLocale(locale)}>{children}</I18nProvider>;
}
